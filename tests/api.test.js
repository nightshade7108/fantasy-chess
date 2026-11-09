// API integration tests against an in-memory Postgres (pg-mem) and a
// mocked PayPal. Run with: node --test tests/api.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { newDb } = require("pg-mem");
const { createApp, createPool } = require("../server/index");
const db = require("../server/db");
const engine = require("../server/engine");
const { chooseMove, evaluate } = require("../server/ai");
const { STARTERS } = require("../server/data/heroes");

process.env.OWNER_SETUP_TOKEN = "owner-test-token";

let server, base, app;
let cookie = "";

async function setup() {
  const mem = newDb();
  const pgMem = mem.adapters.createPg();
  const pool = new pgMem.Pool();
  await db.initDb(pool);
  app = createApp(pool);
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  return pool;
}

function req(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers || {}) };
  if (cookie) headers.cookie = cookie;
  return fetch(base + path, { ...opts, headers }).then(async (r) => {
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
  });
}
const get = (p) => req(p);
const post = (p, body) => req(p, { method: "POST", body: JSON.stringify(body || {}) });

// --- Mock PayPal ---------------------------------------------------------
// Simulates the PayPal REST API. `scenario` is swapped per test.
const paypalScenario = { captureAmount: "0.99", orderStatus: "APPROVED" };
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.includes("paypal.com")) return realFetch(url, opts);
  const json = (obj) => ({ ok: true, status: 200, json: async () => obj });
  if (u.includes("/v1/oauth2/token")) {
    return json({ access_token: "tok", token_type: "Bearer", expires_in: 3600 });
  }
  if (u.includes("/v2/checkout/orders") && opts.method === "POST" && !u.includes("/capture")) {
    return json({
      id: "ORDER-1",
      status: "CREATED",
      links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1" }],
      purchase_units: [{ custom_id: "pouch", amount: { currency_code: "USD", value: "0.99" } }],
    });
  }
  if (u.includes("/v2/checkout/orders/ORDER-1/capture")) {
    return json({
      id: "ORDER-1",
      status: "COMPLETED",
      purchase_units: [{ custom_id: "pouch", payments: { captures: [{ id: "CAP-1", status: "COMPLETED", amount: { currency_code: "USD", value: paypalScenario.captureAmount } }] } }],
    });
  }
  if (u.includes("/v2/checkout/orders/ORDER-1")) {
    if (paypalScenario.orderStatus === "CREATED") {
      return json({ id: "ORDER-1", status: "CREATED", purchase_units: [{ custom_id: "pouch" }] });
    }
    return json({
      id: "ORDER-1",
      status: paypalScenario.orderStatus,
      purchase_units: [{ custom_id: "pouch", payments: { captures: [{ id: "CAP-1", status: "COMPLETED", amount: { currency_code: "USD", value: paypalScenario.captureAmount } }] } }],
    });
  }
  throw new Error("unexpected PayPal URL " + u);
};

let pool;
test.before(async () => { pool = await setup(); });
test.after(() => { server.close(); });

test("state: fresh profile has 100 gold, 6 starters, full catalog", async () => {
  const { status, body } = await get("/api/state");
  assert.equal(status, 200);
  assert.equal(body.gold, 100);
  assert.equal(body.catalog.length, 72);
  assert.equal(body.collection.length, 6);
  assert.equal(body.difficulties.length, 5);
  assert.equal(body.shop.packs.length, 4);
  assert.equal(body.stipend.canClaim, false); // gold >= 20
  assert.equal(body.shop.configured, false);
  assert.equal(body.lessons.length, 6);
  assert.equal(body.lessons[0].unlocked, true);
  assert.equal(body.lessons[3].unlocked, false);
});

test("state: ?full=0 omits the static catalog/difficulties/packs but keeps live fields", async () => {
  const { status, body } = await get("/api/state?full=0");
  assert.equal(status, 200);
  assert.equal(body.catalog, undefined);
  assert.equal(body.difficulties, undefined);
  assert.equal(body.shop.packs, undefined);
  assert.equal(body.gold, 100);
  assert.equal(body.shop.configured, false);
  assert.equal(body.lessons.length, 6);
  assert.equal(body.lessons[0].unlocked, true);
  assert.equal(body.collection.length, 6);
});

test("state: catalog heroes carry a portraitThumb alongside the portrait", async () => {
  const { body } = await get("/api/state");
  const withPortrait = body.catalog.filter((h) => h.portrait);
  assert.ok(withPortrait.length > 0);
  for (const h of withPortrait) {
    assert.ok(h.portraitThumb, `${h.id} should have a portraitThumb`);
    assert.equal(h.portraitThumb, h.portrait.replace(/\.webp$/i, "-thumb.webp"));
  }
});

test("match: start charges entry, illegal move rejected, legal move gets AI reply", async () => {
  const started = await post("/api/match/start", { difficultyId: "squire" });
  assert.equal(started.status, 200);
  assert.equal(started.body.match.difficultyId, "squire");
  assert.equal(started.body.gold, 80);
  const illegal = await post("/api/match/move", { from: "e2", to: "e5" });
  assert.equal(illegal.status, 400);
  const moves = await get("/api/match/moves");
  assert.equal(moves.status, 200);
  assert.ok(moves.body.moves.length > 20);
  const m = moves.body.moves[0];
  const played = await post("/api/match/move", { from: m.from, to: m.to, promotion: m.promotion || undefined });
  assert.equal(played.status, 200);
  assert.ok(played.body.aiMove || played.body.gameOver);
  const state = await get("/api/state");
  assert.ok(state.body.activeMatch || played.body.gameOver);
  await post("/api/match/abandon");
  const after = await get("/api/state");
  assert.equal(after.body.activeMatch, null);
});

test("stipend: gated by gold and once per day", async () => {
  const playerId = cookie.split("=")[1].split(".")[0]; // signed cookie: uuid.signature
  await pool.query("UPDATE players SET gold = 10 WHERE id = $1", [playerId]);
  const low = await get("/api/state");
  assert.equal(low.body.stipend.canClaim, true);
  const claimed = await post("/api/stipend/claim");
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.gold, 30);
  assert.equal(claimed.body.claimedToday, true);
  const again = await post("/api/stipend/claim");
  assert.equal(again.status, 400);
  assert.equal(again.body.error, "stipend_unavailable");
});

test("equip: locked hero rejected, owned hero equips", async () => {
  const locked = await post("/api/collection/equip", { characterId: "valeria-warmarshal" });
  assert.equal(locked.status, 400);
  const ok = await post("/api/collection/equip", { characterId: "bram-footman" });
  assert.equal(ok.status, 200);
});

test("shop: owner config gate, full-tab flow, idempotent credit, wrong amount rejected", async () => {
  // No config yet -> create-order 409.
  const noCfg = await post("/api/shop/create-order", { packId: "pouch" });
  assert.equal(noCfg.status, 409);
  assert.equal(noCfg.body.error, "shop_not_configured");
  // Save config with the owner token.
  const saved = await post("/api/shop/config", {
    clientId: "fake-client-id", secret: "fake-secret", env: "sandbox", ownerToken: "owner-test-token",
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.configured, true);
  // Wrong owner token rejected.
  const badToken = await post("/api/shop/config", {
    clientId: "x", secret: "y", env: "sandbox", ownerToken: "nope",
  });
  assert.equal(badToken.status, 403);

  const before = (await get("/api/state")).body.gold;
  const created = await post("/api/shop/create-order", { packId: "pouch" });
  assert.equal(created.status, 200);
  assert.equal(created.body.orderId, "ORDER-1");
  assert.match(created.body.approveUrl, /sandbox\.paypal\.com/);

  // First verify: credits 50 gold.
  const settled = await post("/api/shop/complete-order", { orderId: "ORDER-1" });
  assert.equal(settled.status, 200);
  assert.equal(settled.body.credited, 50);
  assert.equal(settled.body.gold, before + 50);
  // Second verify of the same capture: credited 0, gold unchanged.
  const again = await post("/api/shop/complete-order", { orderId: "ORDER-1" });
  assert.equal(again.status, 200);
  assert.equal(again.body.credited, 0);
  assert.equal(again.body.gold, before + 50);

  // Wrong-amount capture is rejected and credits nothing.
  paypalScenario.captureAmount = "1.99";
  const wrong = await post("/api/shop/complete-order", { orderId: "ORDER-1" });
  assert.equal(wrong.status, 502);
  assert.equal(wrong.body.error, "verification_failed");
  paypalScenario.captureAmount = "0.99";
  const after = (await get("/api/state")).body.gold;
  assert.equal(after, before + 50);

  // Unapproved order is refused.
  paypalScenario.orderStatus = "CREATED";
  const unapproved = await post("/api/shop/complete-order", { orderId: "ORDER-1" });
  assert.equal(unapproved.status, 409);
  assert.equal(unapproved.body.error, "not_approved");
  paypalScenario.orderStatus = "APPROVED";
});

test("training: lesson 1 starts and accepts its moves", async () => {
  const list = await get("/api/training");
  assert.equal(list.body.lessons[0].unlocked, true);
  const start = await post("/api/training/start", { lessonId: 1 });
  assert.equal(start.status, 200);
  const wrong = await post("/api/training/move", { sessionId: start.body.sessionId, from: "a1", to: "a3" });
  assert.equal(wrong.body.correct, false);
  const right = await post("/api/training/move", { sessionId: start.body.sessionId, from: "a1", to: "a4" });
  assert.equal(right.body.correct, true);
  assert.equal(right.body.step, 1);
  const locked = await post("/api/training/start", { lessonId: 4 });
  assert.equal(locked.status, 403);
});

test("full game: random player vs squire settles without errors", async () => {
  const started = await post("/api/match/start", { difficultyId: "squire" });
  assert.equal(started.status, 200);
  const goldBefore = started.body.gold;
  let plies = 0;
  let settled = null;
  while (plies < 400) {
    const moves = await get("/api/match/moves");
    assert.equal(moves.status, 200);
    if (moves.body.moves.length === 0) break; // game over (no active match)
    const m = moves.body.moves[Math.floor(Math.random() * moves.body.moves.length)];
    const played = await post("/api/match/move", { from: m.from, to: m.to, promotion: m.promotion || undefined });
    assert.equal(played.status, 200);
    plies++;
    if (played.body.gameOver) { settled = played.body.settlement; break; }
  }
  assert.ok(settled, `game should settle within 400 plies (played ${plies})`);
  assert.ok(["win", "loss", "draw"].includes(settled.result));
  assert.equal(typeof settled.goldAwarded, "number");
  assert.equal(typeof settled.gold, "number");
  if (settled.result === "win") {
    assert.equal(settled.goldAwarded, 75);
    assert.equal(settled.gold, goldBefore + 75);
    assert.ok(settled.card && settled.card.id);
  }
  const state = await get("/api/state");
  assert.equal(state.body.activeMatch, null);
  assert.equal(state.body.gamesPlayed, 1);
});

test("reset: restores 100 gold and starters", async () => {
  const reset = await post("/api/profile/reset");
  assert.equal(reset.status, 200);
  assert.equal(reset.body.gold, 100);
  assert.equal(reset.body.collection.length, 6);
  const state = await get("/api/state");
  assert.equal(state.body.activeMatch, null);
  assert.equal(state.body.record, "0-0-0");
});

// --- Server/AI legality regression tests -------------------------------
// These pin down the move-validation contract: the server never trusts
// the client — every move is checked against engine.legalMoves — and the
// AI only ever plays legal moves.

function asJson(v) {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
  return v;
}
function cellAt(board, sq) {
  const f = "abcdefgh".indexOf(sq[0]);
  const r = parseInt(sq[1], 10) - 1;
  return board[r][f];
}
function crafted(pieces, turn = "w") {
  const s = engine.createGame({ ...STARTERS }, { ...STARTERS });
  s.board = new Array(64).fill(null);
  for (const [role, color, sq] of pieces) {
    const { r, f } = engine.fromAlgebraic(sq);
    s.board[engine.idx(r, f)] = { role, color, hero: STARTERS[role], moved: true };
  }
  s.turn = turn;
  s.castling = { wk: true, wq: true, bk: true, bq: true };
  s.ep = null; s.halfmove = 0; s.fullmove = 1;
  s.keys = [engine.positionKey(s)];
  return s;
}
async function insertCraftedMatch(state, difficulty = "squire") {
  const pid = cookie.split("=")[1].split(".")[0];
  await pool.query("DELETE FROM matches WHERE player_id = $1", [pid]);
  await db.saveMatch(pool, {
    id: crypto.randomUUID(), playerId: pid, difficulty, status: "active",
    board: engine.serializeBoard(state), turn: state.turn,
    castling: state.castling, ep: state.ep, halfmove: state.halfmove,
    fullmove: state.fullmove, heroesW: state.heroesW, heroesB: state.heroesB,
    keys: state.keys, history: [], entryFee: 20,
  });
  return pid;
}
function rowToState(row) {
  return {
    board: engine.deserializeBoard(asJson(row.board), asJson(row.heroes_w), asJson(row.heroes_b)),
    turn: row.turn, castling: asJson(row.castling), ep: row.ep,
    halfmove: row.halfmove, fullmove: row.fullmove,
    heroesW: asJson(row.heroes_w), heroesB: asJson(row.heroes_b), keys: asJson(row.keys) || [],
  };
}
function moveKey(m) {
  return [engine.toAlgebraic(m.from), engine.toAlgebraic(m.to), m.promotion || "", m.castle || "", !!m.enPassant].join("|");
}

test("match: illegal moves are rejected (incl. bishop-like soldier)", async () => {
  const pid = cookie.split("=")[1].split(".")[0];
  await pool.query("UPDATE players SET gold = 10000 WHERE id = $1", [pid]);
  await insertCraftedMatch(engine.createGame({ ...STARTERS }, { ...STARTERS }));
  // e2-e5: three squares, never legal for a soldier.
  const bad = await post("/api/match/move", { from: "e2", to: "e5" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, "illegal_move");
  // A soldier moving two squares diagonally to an EMPTY square (the
  // reported bishop-like pawn move) is illegal for every soldier hero:
  // cap2Diag only ever captures, diagStep only ever steps one square.
  const s1 = crafted([
    ["warlord", "w", "e1"], ["warlord", "b", "e8"], ["soldier", "w", "e4"],
  ]);
  await insertCraftedMatch(s1);
  const bishop = await post("/api/match/move", { from: "e4", to: "g6" });
  assert.equal(bishop.status, 400);
  assert.equal(bishop.body.error, "illegal_move");
  // The legal one-square diagonal step (Bram's Steady Step) still works.
  const step = await post("/api/match/move", { from: "e4", to: "f5" });
  assert.equal(step.status, 200);
  await post("/api/match/abandon");
});

test("match: promotion defaults to witch; illegal promotions rejected", async () => {
  const promo = crafted([
    ["warlord", "w", "a1"], ["warlord", "b", "h8"], ["soldier", "w", "e7"],
  ]);
  await insertCraftedMatch(promo);
  const def = await post("/api/match/move", { from: "e7", to: "e8" });
  assert.equal(def.status, 200);
  assert.equal(cellAt(def.body.boardAfterPlayer, "e8").role, "witch");
  await insertCraftedMatch(promo);
  const arch = await post("/api/match/move", { from: "e7", to: "e8", promotion: "archer" });
  assert.equal(arch.status, 200);
  assert.equal(cellAt(arch.body.boardAfterPlayer, "e8").role, "archer");
  await insertCraftedMatch(promo);
  const badRole = await post("/api/match/move", { from: "e7", to: "e8", promotion: "warlord" });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.body.error, "illegal_move");
  await insertCraftedMatch(promo);
  const badRole2 = await post("/api/match/move", { from: "e7", to: "e8", promotion: "soldier" });
  assert.equal(badRole2.status, 400);
  assert.equal(badRole2.body.error, "illegal_move");
  await post("/api/match/abandon");
});

test("match: warlord step vs castling is disambiguated by the castle flag", async () => {
  // Roland's warlord strides two squares, so e1->g1 is both a plain step
  // and kingside castling when the path is clear and rights are intact.
  const castlePos = () => crafted([
    ["warlord", "w", "e1"], ["archer", "w", "a1"], ["archer", "w", "h1"],
    ["warlord", "b", "e8"],
  ]);
  // The engine really does offer both moves for e1->g1.
  const both = engine.legalMoves(castlePos()).filter(
    (m) => engine.toAlgebraic(m.from) === "e1" && engine.toAlgebraic(m.to) === "g1");
  assert.equal(both.length, 2);
  assert.equal(both.filter((m) => m.castle === "K").length, 1);
  assert.equal(both.filter((m) => !m.castle).length, 1);
  // No flag: the documented default is castling (a king moving two squares
  // toward its rook). The client must send castle:false to step instead.
  await insertCraftedMatch(castlePos());
  const def = await post("/api/match/move", { from: "e1", to: "g1" });
  assert.equal(def.status, 200);
  assert.equal(cellAt(def.body.boardAfterPlayer, "f1").role, "archer"); // rook hopped
  assert.equal(cellAt(def.body.boardAfterPlayer, "g1").role, "warlord");
  // castle:false -> plain step, rook stays home.
  await insertCraftedMatch(castlePos());
  const step = await post("/api/match/move", { from: "e1", to: "g1", castle: false });
  assert.equal(step.status, 200);
  assert.equal(cellAt(step.body.boardAfterPlayer, "h1").role, "archer");
  assert.equal(cellAt(step.body.boardAfterPlayer, "g1").role, "warlord");
  assert.equal(cellAt(step.body.boardAfterPlayer, "f1"), null);
  // castle:true -> castling.
  await insertCraftedMatch(castlePos());
  const cast = await post("/api/match/move", { from: "e1", to: "g1", castle: true });
  assert.equal(cast.status, 200);
  assert.equal(cellAt(cast.body.boardAfterPlayer, "f1").role, "archer");
  // With no castling rights the same squares are just the plain step,
  // and castle:true is rejected.
  const noRights = castlePos();
  noRights.castling = { wk: false, wq: false, bk: true, bq: true };
  noRights.keys = [engine.positionKey(noRights)];
  await insertCraftedMatch(noRights);
  const plain = await post("/api/match/move", { from: "e1", to: "g1" });
  assert.equal(plain.status, 200);
  assert.equal(cellAt(plain.body.boardAfterPlayer, "h1").role, "archer");
  await insertCraftedMatch(noRights);
  const badCastle = await post("/api/match/move", { from: "e1", to: "g1", castle: true });
  assert.equal(badCastle.status, 400);
  assert.equal(badCastle.body.error, "illegal_move");
  await post("/api/match/abandon");
});

test("match: move response reports check given by the player's move", async () => {
  // White witch d1-d7 gives check on the black warlord e8. Extra pieces on
  // both sides keep the position far from insufficient material, so the
  // AI's reply cannot settle the game and pollute the shared test profile.
  const pos = crafted([
    ["warlord", "w", "e1"], ["witch", "w", "d1"], ["archer", "w", "a1"], ["soldier", "w", "e2"],
    ["warlord", "b", "e8"], ["archer", "b", "a8"], ["soldier", "b", "e7"],
  ]);
  await insertCraftedMatch(pos);
  const chk = await post("/api/match/move", { from: "d1", to: "d7" });
  assert.equal(chk.status, 200);
  assert.equal(chk.body.checkAfterPlayer, true);
  await post("/api/match/abandon");
  // A quiet move reports no check.
  await insertCraftedMatch(pos);
  const quiet = await post("/api/match/move", { from: "d1", to: "d2" });
  assert.equal(quiet.status, 200);
  assert.equal(quiet.body.checkAfterPlayer, false);
  await post("/api/match/abandon");
});

test("match: settlement credits mate as a win and stalemate as a draw", async () => {
  const pid = cookie.split("=")[1].split(".")[0];
  const goldBefore = (await get("/api/state")).body.gold;
  // Mate in one: witch f7-g7, protected by the warlord on g6.
  const mate = crafted([
    ["warlord", "w", "g6"], ["witch", "w", "f7"], ["warlord", "b", "h8"],
  ]);
  await insertCraftedMatch(mate);
  const won = await post("/api/match/move", { from: "f7", to: "g7" });
  assert.equal(won.status, 200);
  assert.equal(won.body.gameOver, true);
  assert.equal(won.body.settlement.result, "win");
  assert.equal(won.body.settlement.goldAwarded, 75); // squire winGold
  assert.equal(won.body.settlement.gold, goldBefore + 75);
  assert.ok(won.body.settlement.card && won.body.settlement.card.id);
  const afterWin = await get("/api/state");
  assert.equal(afterWin.body.activeMatch, null);
  assert.equal(afterWin.body.record, "1-0-0");
  // Stalemate in one: witch b5-b6 leaves the black warlord no square
  // (its range-2 steps are all covered too).
  const stale = crafted([
    ["warlord", "w", "d7"], ["witch", "w", "b5"], ["warlord", "b", "a8"],
  ]);
  await insertCraftedMatch(stale);
  const drawn = await post("/api/match/move", { from: "b5", to: "b6" });
  assert.equal(drawn.status, 200);
  assert.equal(drawn.body.gameOver, true);
  assert.equal(drawn.body.settlement.result, "draw");
  assert.equal(drawn.body.settlement.goldAwarded, 10); // squire drawGold
  const afterDraw = await get("/api/state");
  assert.equal(afterDraw.body.record, "1-0-1");
  assert.equal(afterDraw.body.activeMatch, null);
});

test("match: every AI reply is legal, carries SAN, and the DB round-trips", async () => {
  const pid = cookie.split("=")[1].split(".")[0];
  await pool.query("UPDATE players SET gold = 10000 WHERE id = $1", [pid]);
  for (const difficultyId of ["squire", "knight", "warlord"]) {
    await post("/api/match/abandon");
    const started = await post("/api/match/start", { difficultyId });
    assert.equal(started.status, 200, `start ${difficultyId}`);
    let plies = 0;
    while (plies < 80) {
      const row = await db.getActiveMatch(pool, pid);
      if (!row) break;
      const state = rowToState(row);
      assert.equal(state.turn, "w");
      const legal = engine.legalMoves(state);
      if (!legal.length) break;
      // Pick a move whose from/to is unambiguous: if several legal moves
      // share from/to they may only differ by promotion (which we send
      // explicitly); a step-vs-castle clash is skipped.
      const bySq = new Map();
      for (const m of legal) {
        const k = engine.toAlgebraic(m.from) + "-" + engine.toAlgebraic(m.to);
        bySq.set(k, [...(bySq.get(k) || []), m]);
      }
      const usable = legal.filter((m) => {
        const group = bySq.get(engine.toAlgebraic(m.from) + "-" + engine.toAlgebraic(m.to));
        return group.every((g) => g.castle === m.castle);
      });
      const mine = usable[Math.floor(Math.random() * usable.length)];
      const preAi = engine.applyMove(state, mine);
      const aiLegal = engine.legalMovesFast(preAi);
      const played = await post("/api/match/move", {
        from: engine.toAlgebraic(mine.from), to: engine.toAlgebraic(mine.to),
        promotion: mine.promotion || undefined,
      });
      assert.equal(played.status, 200, `${difficultyId} ply ${plies}: ${JSON.stringify(played.body)}`);
      plies++;
      if (played.body.gameOver) break;
      assert.ok(played.body.aiMove, "AI should reply while the game is active");
      // The AI's move must be legal for the pre-AI position, and carry SAN.
      const aiKey = [played.body.aiMove.from, played.body.aiMove.to,
        played.body.aiMove.promotion || "", played.body.aiMove.castle || "",
        !!played.body.aiMove.enPassant].join("|");
      const aiKeys = new Set(aiLegal.map(moveKey));
      assert.ok(aiKeys.has(aiKey), `${difficultyId} ply ${plies}: AI move ${aiKey} not legal`);
      assert.equal(typeof played.body.aiMove.san, "string");
      assert.ok(played.body.aiMove.san.length > 0);
      // The saved board must be exactly the engine's application of the
      // reported AI move (no corruption through save/load or apply).
      const match = aiLegal.find((m) => moveKey(m) === aiKey);
      const expected = engine.serializeBoard(engine.applyMove(preAi, match));
      const saved = await db.getActiveMatch(pool, pid);
      assert.deepEqual(asJson(saved.board), expected);
      // Round-trip: the moves the API lists for the reloaded state must
      // equal the engine's legal moves for that same state.
      const reloaded = rowToState(saved);
      const apiMoves = (await get("/api/match/moves")).body.moves
        .map((x) => `${x.from}-${x.to}:${x.promotion || ""}:${x.castle || ""}`).sort();
      const engMoves = engine.legalMoves(reloaded)
        .map((x) => `${engine.toAlgebraic(x.from)}-${engine.toAlgebraic(x.to)}:${x.promotion || ""}:${x.castle || ""}`).sort();
      assert.deepEqual(apiMoves, engMoves, `${difficultyId} ply ${plies}: API moves != engine moves after reload`);
    }
    await post("/api/match/abandon");
  }
});

test("ai: chooseMove only returns legal moves and never mutates state", async () => {
  for (const difficultyId of ["squire", "knight", "warlord", "dragon", "celestial"]) {
    const diff = (await get("/api/state")).body.difficulties.find((d) => d.id === difficultyId);
    assert.ok(diff);
    const { DIFFICULTIES } = require("../server/data/heroes");
    const band = DIFFICULTIES.find((d) => d.id === difficultyId).enemyBand;
    let state = engine.createGame({ ...STARTERS }, band);
    for (let i = 0; i < 10; i++) {
      const ms = engine.legalMovesFast(state);
      if (!ms.length || engine.gameStatus(state) !== "active") break;
      state = engine.applyMove(state, ms[Math.floor(Math.random() * ms.length)]);
    }
    if (engine.gameStatus(state) !== "active") continue;
    const before = JSON.stringify(state);
    const ai = chooseMove(state, difficultyId);
    assert.deepEqual(JSON.stringify(state), before, `${difficultyId}: chooseMove mutated the live state`);
    assert.ok(ai, `${difficultyId}: chooseMove returned null with legal moves available`);
    const legalKeys = new Set(engine.legalMoves(state).map(moveKey));
    assert.ok(legalKeys.has(moveKey(ai)), `${difficultyId}: chooseMove returned an illegal move`);
    assert.equal(typeof ai.san, "string");
    assert.ok(ai.san.length > 0);
  }
});

test("ai: evaluate survives promoted pieces and unknown heroes", () => {
  const s = engine.createGame({ ...STARTERS }, { ...STARTERS });
  s.board[engine.idx(7, 0)] = { role: "witch", color: "w", hero: "mabel-herb", moved: true };
  s.board[engine.idx(6, 0)] = null;
  assert.equal(typeof evaluate(s), "number");
  s.board[engine.idx(7, 0)].hero = "no-such-hero";
  assert.equal(typeof evaluate(s), "number");
  const s2 = engine.createGame({ ...STARTERS }, { ...STARTERS });
  delete s2.heroesW.witch;
  s2.board[engine.idx(7, 3)] = { role: "witch", color: "w", hero: undefined, moved: true };
  assert.equal(typeof evaluate(s2), "number");
});

test("engine agreement: legalMoves and legalMovesFast match over random play", () => {
  const { DIFFICULTIES } = require("../server/data/heroes");
  for (const d of DIFFICULTIES) {
    let state = engine.createGame({ ...STARTERS }, d.enemyBand);
    for (let ply = 0; ply < 60 && engine.gameStatus(state) === "active"; ply++) {
      const a = engine.legalMoves(state).map(moveKey).sort();
      const b = engine.legalMovesFast(state).map(moveKey).sort();
      assert.deepEqual(a, b, `${d.id} ply ${ply}: legalMoves != legalMovesFast`);
      if (!a.length) break;
      const fast = engine.legalMovesFast(state);
      state = engine.applyMove(state, fast[Math.floor(Math.random() * fast.length)]);
    }
  }
});

test("training: castle flag and promotion default are honoured", async () => {
  const pid = cookie.split("=")[1].split(".")[0];
  // Unlock lessons 4-5: a Legendary warlord (3 pts) at 3 copies (+1) = 4.
  for (const id of ["kaizhar-dragonlord"]) {
    await pool.query(
      "INSERT INTO collection (player_id, character_id, copies) VALUES ($1,$2,3) ON CONFLICT (player_id, character_id) DO UPDATE SET copies=3",
      [pid, id]);
  }
  await pool.query("UPDATE players SET equipped = $2 WHERE id = $1",
    [pid, JSON.stringify({ ...STARTERS, warlord: "kaizhar-dragonlord" })]);
  const list = await get("/api/training");
  assert.equal(list.body.lessons.find((l) => l.id === 5).unlocked, true);
  // Lesson 4 (castling): a plain step must not satisfy "castled".
  const l4 = await post("/api/training/start", { lessonId: 4 });
  assert.equal(l4.status, 200);
  const plainStep = await post("/api/training/move", { sessionId: l4.body.sessionId, from: "e1", to: "g1", castle: false });
  assert.equal(plainStep.body.correct, false);
  const castled = await post("/api/training/move", { sessionId: l4.body.sessionId, from: "e1", to: "g1" });
  assert.equal(castled.body.correct, true);
  // Lesson 5 (promotion): no promotion defaults to witch and is accepted.
  const l5 = await post("/api/training/start", { lessonId: 5 });
  assert.equal(l5.status, 200);
  const def = await post("/api/training/move", { sessionId: l5.body.sessionId, from: "a7", to: "a8" });
  assert.equal(def.body.correct, true);
  const l5b = await post("/api/training/start", { lessonId: 5 });
  const wrong = await post("/api/training/move", { sessionId: l5b.body.sessionId, from: "a7", to: "a8", promotion: "archer" });
  assert.equal(wrong.body.correct, false);
  // En passant step still completes the lesson.
  const l5c = await post("/api/training/start", { lessonId: 5 });
  const s1 = await post("/api/training/move", { sessionId: l5c.body.sessionId, from: "a7", to: "a8", promotion: "witch" });
  assert.equal(s1.body.correct, true);
  const s2 = await post("/api/training/move", { sessionId: l5c.body.sessionId, from: "e5", to: "d6" });
  assert.equal(s2.body.correct, true);
  assert.equal(s2.body.done, true);
  // Restore starters so later tests see the default team.
  await pool.query("UPDATE players SET equipped = $2 WHERE id = $1", [pid, JSON.stringify(STARTERS)]);
});
