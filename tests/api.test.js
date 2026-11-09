// API integration tests against an in-memory Postgres (pg-mem) and a
// mocked PayPal. Run with: node --test tests/api.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const { newDb } = require("pg-mem");
const { createApp, createPool } = require("../server/index");
const db = require("../server/db");

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
