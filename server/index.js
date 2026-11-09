// Fantasy Chess — standalone server.
// Express + Postgres. Serves the frontend from public/ and the JSON API
// from /api (see CONTRACT.md). The chess engine is authoritative on the
// server: clients send moves, the server validates them, replies with the
// AI move, and settles matches.

const express = require("express");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");

const engine = require("./engine");
const { chooseMove } = require("./ai");
const db = require("./db");
const { PayPalClient, PayPalError } = require("./paypal");
const { HEROES, STARTERS, DIFFICULTIES, PACKS, RARITY_POINTS, heroById, difficultyById, packById, rollReward } = require("./data/heroes");
const { LESSONS, buildStepState, moveMatchesAccept, checkPredicate } = require("./data/lessons");

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "fantasy-chess-dev-secret";

function createPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 10,
    });
  }
  // Local development without Postgres configured: expect DATABASE_URL.
  return new Pool({ connectionString: "postgres://localhost:5432/fantasychess" });
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    // A malformed value (invalid % escapes) must not 500 every request:
    // decodeURIComponent throws URIError, so treat an undecodable value
    // as absent and let the request start a fresh profile.
    try { out[k] = decodeURIComponent(rest.join("=")); } catch { /* ignore */ }
  }
  return out;
}

function apiError(status, code, message) {
  const e = new Error(message || code);
  e.status = status;
  e.code = code;
  return e;
}

// pg returns JSONB as parsed objects; pg-mem (tests) may return strings.
// Normalize either way.
function asJson(v) {
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
  return v;
}

function publicHero(h) {
  // portraitThumb: a small (400px) version of the portrait for card grids —
  // the full portrait is ~500KB and 72 of them would be ~47MB; the thumb is
  // ~40KB. The detail modal still uses the full portrait.
  const thumb = h.portrait ? h.portrait.replace(/\.webp$/i, "-thumb.webp") : null;
  return { id: h.id, name: h.name, role: h.role, rarity: h.rarity, power: h.power, ability: h.ability, flavor: h.flavor, portrait: h.portrait || null, portraitThumb: thumb };
}

// --- Match (engine state <-> DB row) ---
function rowToEngineState(row) {
  return {
    board: engine.deserializeBoard(asJson(row.board), asJson(row.heroes_w), asJson(row.heroes_b)),
    turn: row.turn,
    castling: asJson(row.castling),
    ep: row.ep,
    halfmove: row.halfmove,
    fullmove: row.fullmove,
    heroesW: asJson(row.heroes_w),
    heroesB: asJson(row.heroes_b),
    keys: asJson(row.keys) || [],
  };
}

function engineStateToRow(state) {
  return {
    board: engine.serializeBoard(state),
    turn: state.turn,
    castling: state.castling,
    ep: state.ep,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    heroesW: state.heroesW,
    heroesB: state.heroesB,
    keys: state.keys,
  };
}

// A legal move as the client needs it: squares, promotion/castle flags,
// and the SAN (whose "x" marks captures — en passant lands on an empty
// square, so the board alone cannot tell it from a quiet move).
function serializeMove(m) {
  return {
    from: engine.toAlgebraic(m.from), to: engine.toAlgebraic(m.to),
    promotion: m.promotion, castle: m.castle, san: m.san,
  };
}

function serializeMatch(row) {
  if (!row) return null;
  const state = rowToEngineState(row);
  return {
    id: row.id,
    difficultyId: row.difficulty,
    board: engine.serializeBoard(state),
    turn: state.turn,
    history: asJson(row.history) || [],
    status: engine.gameStatus(state),
    check: engine.isCheck(state, state.turn),
    result: null,
  };
}

function teamScore(equipped, collection) {
  const byId = new Map(collection.map((c) => [c.characterId, c.copies]));
  let score = 0;
  for (const heroId of Object.values(equipped)) {
    const hero = heroById(heroId);
    if (!hero) continue;
    score += RARITY_POINTS[hero.rarity] || 0;
    if ((byId.get(heroId) || 0) >= 3) score += 1;
  }
  return score;
}

/* full=false omits the static catalog/difficulties/packs (~30KB) — the
   client caches those after the first full load and merges them back.
   Lessons stay (their `unlocked` flags depend on the live team score). */
async function buildStateResponse(pool, player, opts) {
  const full = !opts || opts.full !== false;
  const collection = await db.getCollection(pool, player.id);
  const equipped = asJson(player.equipped) || { ...STARTERS };
  const activeRow = await db.getActiveMatch(pool, player.id);
  const cfg = await db.getShopConfig(pool);
  const score = teamScore(equipped, collection);
  // "Today" comes from the database's clock — the same clock the stipend
  // gate in claimStipend uses — so the banner can never disagree with
  // the server around midnight if the two clocks ever differ.
  const today = await db.currentDate(pool);
  const claimedToday = player.last_stipend_date &&
    new Date(player.last_stipend_date).toISOString().slice(0, 10) === today;
  const out = {
    gold: player.gold,
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    gamesPlayed: player.games_played,
    record: `${player.wins}-${player.losses}-${player.draws}`,
    collection: collection.map((c) => ({
      characterId: c.characterId,
      copies: c.copies,
      level: c.copies,
      equippedSlot: Object.entries(equipped).find(([, id]) => id === c.characterId)?.[0] || null,
    })),
    equipped,
    shop: {
      configured: !!cfg,
      env: cfg ? cfg.env : null,
    },
    stipend: { amount: 20, threshold: 20, canClaim: player.gold < 20 && !claimedToday, claimedToday: !!claimedToday },
    lessons: LESSONS.map((l) => ({ id: l.id, title: l.title, minScore: l.minScore, unlocked: score >= l.minScore, text: l.text })),
    teamScore: score,
    activeMatch: serializeMatch(activeRow),
  };
  if (full) {
    out.catalog = HEROES.map(publicHero);
    out.difficulties = DIFFICULTIES;
    out.shop.packs = PACKS;
  }
  return out;
}

function createApp(pool) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));

  // Player identity: a long-lived HttpOnly cookie holding a UUID, HMAC-signed
  // with SESSION_SECRET so one player cannot guess another's cookie and
  // take over their profile. Unsigned/foreign cookies start a fresh profile.
  const cookieSecret = process.env.SESSION_SECRET || "dev-secret-change-me";
  const signPlayer = (id) =>
    `${id}.${crypto.createHmac("sha256", cookieSecret).update(id).digest("hex").slice(0, 32)}`;
  const verifyPlayer = (value) => {
    if (!value) return null;
    const [id, sig] = value.split(".");
    if (!id || !sig || sig.length !== 32 || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    const expected = crypto.createHmac("sha256", cookieSecret).update(id).digest("hex").slice(0, 32);
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? id : null;
    } catch { return null; }
  };
  app.use(async (req, res, next) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      let playerId = verifyPlayer(cookies.fc_player);
      if (!playerId) playerId = crypto.randomUUID();
      req.player = await db.getOrCreatePlayer(pool, playerId);
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      res.setHeader("Set-Cookie", `fc_player=${signPlayer(playerId)}; HttpOnly; Path=/; Max-Age=31536000; SameSite=Lax${secure}`);
      next();
    } catch (e) {
      next(e);
    }
  });

  app.get("/healthz", (req, res) => res.json({ ok: true }));

  // ?full=0 skips the static catalog/difficulties/packs (the client caches
  // them after the first full load) so repeated refreshes stay small.
  app.get("/api/state", async (req, res, next) => {
    try {
      const full = req.query.full !== "0";
      res.json(await buildStateResponse(pool, req.player, { full }));
    } catch (e) { next(e); }
  });

  // --- Matches ---
  app.post("/api/match/start", async (req, res, next) => {
    try {
      const { difficultyId } = req.body || {};
      const diff = difficultyById(difficultyId);
      if (!diff) throw apiError(400, "bad_difficulty", "Unknown difficulty.");
      // Check + insert + charge happen in ONE transaction, so concurrent
      // starts cannot create two active matches for one entry fee:
      // the player row is locked (SELECT ... FOR UPDATE) to serialize
      // starts, the charge is atomic (gold >= cost, else 0 rows), and a
      // partial unique index on active matches backs the check up.
      const result = await db.withPlayerLock(req.player.id, () =>
        db.withTransaction(pool, async (client) => {
          await client.query("SELECT * FROM players WHERE id = $1 FOR UPDATE", [req.player.id]);
          const existing = await db.getActiveMatch(client, req.player.id);
          if (existing) throw apiError(409, "match_active", "A match is already in progress.");
          const charged = await client.query(
            // The ::int casts are load-bearing for pg-mem (the in-memory
            // Postgres used in tests): it mis-parses `gold - $1` as
            // `$1 - gold` without them. Real Postgres treats the casts as
            // no-ops on an integer column.
            "UPDATE players SET gold = gold - $1::int WHERE id = $2 AND gold >= $3::int RETURNING gold",
            [diff.cost, req.player.id, diff.cost]
          );
          if (charged.rows.length === 0) throw apiError(400, "not_enough_gold", "Not enough gold for this battle.");
          const state = engine.createGame(asJson(req.player.equipped) || { ...STARTERS }, diff.enemyBand);
          const match = {
            id: crypto.randomUUID(),
            playerId: req.player.id,
            difficulty: diff.id,
            status: "active",
            ...engineStateToRow(state),
            history: [],
            entryFee: diff.cost,
          };
          await db.saveMatch(client, match);
          return { match, gold: charged.rows[0].gold };
        })
      );
      const row = await db.getMatch(pool, result.match.id);
      res.json({ match: serializeMatch(row), gold: result.gold });
    } catch (e) {
      // The partial unique index fired instead of the check (a start raced
      // in and committed first): same answer as the check, 409.
      if (e.code === "23505") return next(apiError(409, "match_active", "A match is already in progress."));
      next(e);
    }
  });

  app.post("/api/match/move", async (req, res, next) => {
    try {
      const { from, to, promotion, castle } = req.body || {};
      if (!from || !to) throw apiError(400, "bad_move", "from and to squares are required.");
      const f = engine.fromAlgebraic(from);
      const t = engine.fromAlgebraic(to);
      if (!f || !t) throw apiError(400, "bad_move", "Bad squares.");
      // The whole move — read, validate, player move, AI reply, settle,
      // save — runs in ONE transaction under a per-player lock. The match
      // row is locked (SELECT ... FOR UPDATE) and the save is guarded by
      // its version: a second request for the same move re-reads the
      // post-move state (where its move is now illegal) or fails the
      // version check, so a terminal position can only ever settle once.
      const outcome = await db.withPlayerLock(req.player.id, () =>
        db.withTransaction(pool, async (client) => {
          const row = await db.getActiveMatchForUpdate(client, req.player.id);
          if (!row) throw apiError(409, "no_active_match", "No match in progress.");
          const state = rowToEngineState(row);
          if (state.turn !== "w") throw apiError(409, "not_your_turn", "It is not your turn.");
          let candidates = engine.legalMoves(state).filter(
            (m) => m.from.r === f.r && m.from.f === f.f && m.to.r === t.r && m.to.f === t.f
          );
          if (candidates.length === 0) throw apiError(400, "illegal_move", "That move is not legal.");
          if (promotion) {
            candidates = candidates.filter((m) => m.promotion === promotion);
            if (candidates.length === 0) throw apiError(400, "illegal_move", "That promotion is not legal.");
          } else if (candidates[0].promotion) {
            // Promotion not specified: default to witch.
            candidates = candidates.filter((m) => m.promotion === "witch");
          }
          if (castle === true) candidates = candidates.filter((m) => m.castle);
          else if (castle === false) candidates = candidates.filter((m) => !m.castle);
          if (candidates.length === 0) throw apiError(400, "illegal_move", "That move is not legal.");
          // Prefer en passant, then castling, then captures, when several moves
          // share from/to (e.g. a range-2 warlord stepping two squares vs castling).
          candidates.sort((a, b) => (b.enPassant - a.enPassant) || ((b.castle ? 1 : 0) - (a.castle ? 1 : 0)) || ((b.captured ? 1 : 0) - (a.captured ? 1 : 0)));
          const move = candidates[0];
          let next = engine.applyMove(state, move);
          // Whether the player's move gives check — the client shows the staged
          // board (after the player's move only) during the AI think pause, and
          // the CHECK flag must not disappear for that beat.
          const checkAfterPlayer = engine.isCheck(next, next.turn);
          // Board after the player's move only (before the AI replies) — the
          // client renders this first so the player's move lands instantly,
          // then animates the AI's reply on top of it.
          const boardAfterPlayer = engine.serializeBoard(next);
          const history = [...(asJson(row.history) || []), { from, to, san: move.san }];
          let aiMove = null;

          const statusAfterPlayer = engine.gameStatus(next);
          if (statusAfterPlayer === "active") {
            const ai = chooseMove(next, row.difficulty);
            if (ai) {
              // Move flags are presentation data for the client animation
              // (teleport vs slide, castling rook, en passant, promotion).
              aiMove = {
                from: engine.toAlgebraic(ai.from), to: engine.toAlgebraic(ai.to), san: ai.san,
                castle: ai.castle || null, enPassant: !!ai.enPassant,
                promotion: ai.promotion || null, teleport: !!ai.teleport,
              };
              next = engine.applyMove(next, ai);
              history.push({ from: aiMove.from, to: aiMove.to, san: ai.san });
            }
          }
          const finalStatus = engine.gameStatus(next);
          const finished = finalStatus !== "active";
          // Version-guarded save FIRST: if another request already applied
          // a move, this touches 0 rows and the whole transaction —
          // including any settlement below — rolls back instead of
          // settling the same position twice.
          const saved = await db.saveMatchVersioned(client, {
            id: row.id, playerId: req.player.id, difficulty: row.difficulty,
            status: finished ? "finished" : "active",
            ...engineStateToRow(next), history, entryFee: row.entry_fee,
          }, row.version);
          if (!saved) throw apiError(409, "match_conflict", "The match changed while your move was processed. Refresh and try again.");
          let settlement = null;
          if (finished) {
            const result = finalStatus === "checkmate"
              ? (next.turn === "b" ? "win" : "loss")
              : "draw";
            settlement = await settleMatch(client, req.player, row, result);
          }
          const fresh = finished ? null : await db.getMatch(client, row.id);
          return { match: fresh, gameOver: finished, aiMove, boardAfterPlayer, checkAfterPlayer, settlement };
        })
      );
      res.json({
        match: outcome.gameOver ? null : serializeMatch(outcome.match),
        gameOver: outcome.gameOver,
        aiMove: outcome.aiMove,
        boardAfterPlayer: outcome.boardAfterPlayer,
        checkAfterPlayer: outcome.checkAfterPlayer,
        settlement: outcome.settlement,
      });
    } catch (e) { next(e); }
  });

  async function settleMatch(client, player, row, result) {
    const diff = difficultyById(row.difficulty);
    let goldAwarded = 0;
    let card = null;
    if (result === "win") {
      goldAwarded = diff.winGold;
      const cardId = rollReward(diff.id);
      card = heroById(cardId);
      await db.addToCollection(client, player.id, cardId);
    } else if (result === "draw") {
      goldAwarded = diff.drawGold;
    }
    const gold = await db.recordResult(client, player.id, result, goldAwarded);
    return { result, goldAwarded, card: card ? publicHero(card) : null, gold };
  }

  // Read-only inspection: ?color=w|b returns that side's legal moves from
  // the current position regardless of whose turn it is (viewing an enemy
  // hero's possible moves). Without it, the player's own moves, only while
  // it is their turn. This never enables a move: /api/match/move still
  // only accepts the side-to-move's pieces.
  app.get("/api/match/moves", async (req, res, next) => {
    try {
      const row = await db.getActiveMatch(pool, req.player.id);
      if (!row) return res.json({ moves: [] });
      const state = rowToEngineState(row);
      const color = req.query.color;
      const moves = (color === "w" || color === "b")
        ? engine.legalMovesFor(state, color)
        : (state.turn === "w" ? engine.legalMoves(state) : []);
      res.json({ moves: moves.map(serializeMove) });
    } catch (e) { next(e); }
  });

  app.post("/api/match/abandon", async (req, res, next) => {
    try {
      const row = await db.getActiveMatch(pool, req.player.id);
      if (row) await db.deleteMatch(pool, row.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // --- Collection / profile ---
  app.post("/api/collection/equip", async (req, res, next) => {
    try {
      const { characterId } = req.body || {};
      const hero = heroById(characterId);
      if (!hero) throw apiError(400, "bad_hero", "Unknown hero.");
      const collection = await db.getCollection(pool, req.player.id);
      if (!collection.some((c) => c.characterId === characterId)) {
        throw apiError(400, "not_owned", "You do not own that hero yet.");
      }
      const equipped = { ...(asJson(req.player.equipped) || { ...STARTERS }) };
      equipped[hero.role] = characterId;
      await db.setEquipped(pool, req.player.id, equipped);
      res.json({ equipped });
    } catch (e) { next(e); }
  });

  app.post("/api/stipend/claim", async (req, res, next) => {
    try {
      const gold = await db.claimStipend(pool, req.player.id);
      if (gold === null) {
        throw apiError(400, "stipend_unavailable", "The stipend is only available below 20 gold, once a day.");
      }
      res.json({ gold, claimedToday: true });
    } catch (e) { next(e); }
  });

  app.post("/api/profile/reset", async (req, res, next) => {
    try {
      await db.resetPlayer(pool, req.player.id);
      const fresh = await db.getOrCreatePlayer(pool, req.player.id);
      res.json(await buildStateResponse(pool, fresh));
    } catch (e) { next(e); }
  });

  // --- Shop (PayPal) ---
  app.get("/api/shop/config", async (req, res, next) => {
    try {
      const cfg = await db.getShopConfig(pool);
      res.json({ configured: !!cfg, env: cfg ? cfg.env : null });
    } catch (e) { next(e); }
  });

  // Constant-time owner-token comparison: compare SHA-256 hashes with
  // timingSafeEqual so a wrong token cannot be distinguished by timing.
  function ownerTokenMatches(provided) {
    const required = process.env.OWNER_SETUP_TOKEN;
    if (!required || typeof provided !== "string") return false;
    const a = crypto.createHash("sha256").update(required).digest();
    const b = crypto.createHash("sha256").update(provided).digest();
    return crypto.timingSafeEqual(a, b);
  }

  app.post("/api/shop/config", async (req, res, next) => {
    try {
      const { clientId, secret, env, ownerToken } = req.body || {};
      const required = process.env.OWNER_SETUP_TOKEN;
      if (!required) {
        throw apiError(409, "setup_disabled", "In-app setup is disabled. Configure PayPal with PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET environment variables.");
      }
      if (!ownerTokenMatches(ownerToken)) throw apiError(403, "bad_owner_token", "Wrong owner token.");
      if (!clientId || !secret) throw apiError(400, "bad_config", "Client ID and Secret are required.");
      const cleanEnv = env === "live" ? "live" : "sandbox";
      await db.saveShopConfig(pool, { clientId, secret, env: cleanEnv });
      res.json({ configured: true, env: cleanEnv });
    } catch (e) { next(e); }
  });

  app.post("/api/shop/remove-config", async (req, res, next) => {
    try {
      const { ownerToken } = req.body || {};
      if (!process.env.OWNER_SETUP_TOKEN) {
        throw apiError(409, "setup_disabled", "In-app setup is disabled. Configure PayPal with PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET environment variables.");
      }
      if (!ownerTokenMatches(ownerToken)) throw apiError(403, "bad_owner_token", "Wrong owner token.");
      await db.removeShopConfig(pool);
      res.json({ configured: false });
    } catch (e) { next(e); }
  });

  async function paypalClientFor(pool) {
    const cfg = await db.getShopConfig(pool);
    if (!cfg) throw apiError(409, "shop_not_configured", "The shop is not connected to PayPal yet.");
    return new PayPalClient({ clientId: cfg.client_id, secret: cfg.secret, env: cfg.env });
  }

  // Origin for PayPal return/cancel URLs. Never build these from an
  // untrusted Host header: a poisoned Host could redirect the payer to an
  // attacker domain after approval. PUBLIC_URL (set in render.yaml) wins;
  // otherwise only the site's own host or a local dev host is trusted,
  // and anything else falls back to the known production origin.
  function publicOrigin(req) {
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, "");
    const host = req.get("host") || "";
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || host === "fantasy-chess.onrender.com") {
      return `${req.protocol}://${host}`;
    }
    return "https://fantasy-chess.onrender.com";
  }

  app.post("/api/shop/create-order", async (req, res, next) => {
    try {
      const { packId } = req.body || {};
      const pack = packById(packId);
      if (!pack) throw apiError(400, "bad_pack", "Unknown gold pack.");
      const client = await paypalClientFor(pool);
      const origin = publicOrigin(req);
      const order = await client.createOrder({
        amountCents: pack.priceCents,
        customId: pack.id,
        returnUrl: `${origin}/?shop=return`,
        cancelUrl: `${origin}/?shop=cancel`,
      });
      const approveUrl = PayPalClient.approveUrl(order);
      if (!approveUrl) throw apiError(502, "paypal_error", "PayPal did not return an approval link. Please try again.");
      res.json({ orderId: order.id, approveUrl });
    } catch (e) { next(e); }
  });

  // Shared settle logic for both checkout flows: read the order back from
  // PayPal, capture it if approved, verify the capture (COMPLETED + exact
  // pack price), and credit the gold exactly once per capture id.
  async function settlePayPalOrder(pool, playerId, orderId) {
    const client = await paypalClientFor(pool);
    let order;
    try {
      order = await client.getOrder(orderId);
    } catch (e) {
      if (e instanceof PayPalError) throw apiError(502, "paypal_error", "Could not read the order from PayPal.");
      throw e;
    }
    let capture = PayPalClient.firstCapture(order);
    if (order.status === "APPROVED") {
      try {
        const captured = await client.captureOrder(orderId);
        capture = PayPalClient.firstCapture(captured) || capture;
      } catch (e) {
        if (e instanceof PayPalError) throw apiError(502, "paypal_error", "PayPal refused the capture.");
        throw e;
      }
    }
    if (!capture) {
      if (order.status === "CREATED") throw apiError(409, "not_approved", "PayPal says this payment hasn't been approved yet. Approve it in the PayPal tab first — nothing has been charged yet.");
      throw apiError(409, "not_approved", "This order has no capture yet. Approve it in the PayPal tab first.");
    }
    const packId = order.purchase_units && order.purchase_units[0] && order.purchase_units[0].custom_id;
    const pack = packId ? packById(packId) : null;
    if (!pack) throw apiError(400, "unknown_pack", "This PayPal order is not tied to a gold pack.");
    const amount = capture.amount || {};
    const cents = Math.round(parseFloat(amount.value || "0") * 100);
    if (capture.status !== "COMPLETED" || amount.currency_code !== "USD" || cents !== pack.priceCents) {
      throw apiError(502, "verification_failed", "PayPal's capture did not verify (wrong status, currency or amount). No gold was credited.");
    }
    const inserted = await db.withPlayerLock(playerId, async () => {
      try {
        return await db.withTransaction(pool, (client) =>
          db.recordPurchaseAndCredit(client, {
            playerId, packId: pack.id, captureId: capture.id,
            priceCents: pack.priceCents, gold: pack.gold,
          })
        );
      } catch (e) {
        // Lost a race with a concurrent settle of the same capture: the
        // other request recorded it and credited the gold; report the
        // idempotent replay (credited: 0) instead of erroring.
        if (e.code === "23505") return { inserted: false, gold: null };
        throw e;
      }
    });
    let gold;
    if (inserted.inserted) {
      gold = inserted.gold;
    } else {
      const player = await db.getOrCreatePlayer(pool, playerId);
      gold = player.gold;
    }
    return { gold, credited: inserted.inserted ? pack.gold : 0, packId: pack.id };
  }

  app.post("/api/shop/complete-order", async (req, res, next) => {
    try {
      const { orderId } = req.body || {};
      if (!orderId) throw apiError(400, "bad_order", "orderId is required.");
      res.json(await settlePayPalOrder(pool, req.player.id, orderId));
    } catch (e) { next(e); }
  });

  // Embedded-checkout flow: same verification, kept as a separate endpoint.
  app.post("/api/shop/complete-purchase", async (req, res, next) => {
    try {
      const { orderId } = req.body || {};
      if (!orderId) throw apiError(400, "bad_order", "orderId is required.");
      res.json(await settlePayPalOrder(pool, req.player.id, orderId));
    } catch (e) { next(e); }
  });

  // --- Training Grounds ---
  app.get("/api/training", async (req, res, next) => {
    try {
      const collection = await db.getCollection(pool, req.player.id);
      const equipped = asJson(req.player.equipped) || { ...STARTERS };
      const score = teamScore(equipped, collection);
      res.json({
        teamScore: score,
        lessons: LESSONS.map((l) => ({ id: l.id, title: l.title, minScore: l.minScore, unlocked: score >= l.minScore, text: l.text })),
      });
    } catch (e) { next(e); }
  });

  app.post("/api/training/start", async (req, res, next) => {
    try {
      const { lessonId } = req.body || {};
      const lesson = LESSONS.find((l) => l.id === lessonId);
      if (!lesson) throw apiError(400, "bad_lesson", "Unknown lesson.");
      const collection = await db.getCollection(pool, req.player.id);
      const score = teamScore(asJson(req.player.equipped) || { ...STARTERS }, collection);
      if (score < lesson.minScore) throw apiError(403, "lesson_locked", "This lesson is still locked. Raise your team's rarity and levels to unlock it.");
      const step = lesson.steps[0];
      const state = buildStepState(step);
      const sessionId = crypto.randomUUID();
      await pool.query(
        "INSERT INTO training_sessions (id, player_id, lesson_id, step, state) VALUES ($1,$2,$3,0,$4)",
        [sessionId, req.player.id, lesson.id, JSON.stringify(sessionState(state))]
      );
      res.json({
        sessionId, lessonId: lesson.id, lessonTitle: lesson.title,
        step: 0, stepsTotal: lesson.steps.length,
        instruction: step.instruction, board: engine.serializeBoard(state), turn: "w",
      });
    } catch (e) { next(e); }
  });

  app.post("/api/training/move", async (req, res, next) => {
    try {
      const { sessionId, from, to, promotion, castle } = req.body || {};
      const sess = (await pool.query("SELECT * FROM training_sessions WHERE id = $1 AND player_id = $2", [sessionId, req.player.id])).rows[0];
      if (!sess || sess.completed) throw apiError(409, "no_session", "No training session in progress.");
      const lesson = LESSONS.find((l) => l.id === sess.lesson_id);
      const step = lesson.steps[sess.step];
      const state = sessionStateToEngine(asJson(sess.state));
      const f = engine.fromAlgebraic(from || "");
      const t = engine.fromAlgebraic(to || "");
      if (!f || !t) {
        return res.json({ correct: false, message: "Those aren't valid squares. Look at the hint and try again.", board: engine.serializeBoard(state) });
      }
      let candidates = engine.legalMoves(state).filter(
        (m) => m.from.r === f.r && m.from.f === f.f && m.to.r === t.r && m.to.f === t.f
      );
      if (promotion) candidates = candidates.filter((m) => m.promotion === promotion);
      else if (candidates.length > 0 && candidates[0].promotion) {
        candidates = candidates.filter((m) => m.promotion === "witch");
      }
      if (castle === true) candidates = candidates.filter((m) => m.castle);
      else if (castle === false) candidates = candidates.filter((m) => !m.castle);
      if (candidates.length === 0) {
        return res.json({ correct: false, message: "That's not a legal move on this board. Look at the hint and try again.", board: engine.serializeBoard(state) });
      }
      candidates.sort((a, b) => (b.enPassant - a.enPassant) || ((b.castle ? 1 : 0) - (a.castle ? 1 : 0)) || ((b.captured ? 1 : 0) - (a.captured ? 1 : 0)));
      const move = candidates[0];
      const accepted = moveMatchesAccept(move, step.accept);
      const next = engine.applyMove(state, move);
      if (!accepted || !checkPredicate(next, move, step.accept)) {
        // Return the board as it was: the session position did not change,
        // so the client must not be shown a position it cannot play from.
        return res.json({ correct: false, message: "That move is legal, but it's not what Coach Pell asked for. Read the instruction again.", board: engine.serializeBoard(state) });
      }
      const nextStep = sess.step + 1;
      if (nextStep >= lesson.steps.length) {
        await pool.query("UPDATE training_sessions SET completed = true WHERE id = $1", [sessionId]);
        return res.json({ correct: true, done: true, message: `Lesson complete! ${lesson.title} — well played.`, board: engine.serializeBoard(next) });
      }
      const nextStepDef = lesson.steps[nextStep];
      const nextState = buildStepState(nextStepDef);
      await pool.query(
        "UPDATE training_sessions SET step = $2, state = $3 WHERE id = $1",
        [sessionId, nextStep, JSON.stringify(sessionState(nextState))]
      );
      res.json({
        correct: true, done: false,
        message: "Exactly right. " + nextStepDef.instruction,
        step: nextStep, stepsTotal: lesson.steps.length,
        instruction: nextStepDef.instruction, board: engine.serializeBoard(nextState),
      });
    } catch (e) { next(e); }
  });

  // Legal moves for the current training position, so the client can
  // highlight destinations and list possible moves just like in battle.
  // Read-only: training steps are server-validated on /api/training/move.
  app.get("/api/training/moves", async (req, res, next) => {
    try {
      const { sessionId } = req.query;
      const sess = (await pool.query("SELECT * FROM training_sessions WHERE id = $1 AND player_id = $2", [sessionId, req.player.id])).rows[0];
      if (!sess || sess.completed) return res.json({ moves: [] });
      const state = sessionStateToEngine(asJson(sess.state));
      res.json({ moves: engine.legalMoves(state).map(serializeMove) });
    } catch (e) { next(e); }
  });

  function sessionState(engineState) {
    return {
      board: engine.serializeBoard(engineState),
      turn: engineState.turn, castling: engineState.castling, ep: engineState.ep,
      halfmove: engineState.halfmove, fullmove: engineState.fullmove,
      heroesW: engineState.heroesW, heroesB: engineState.heroesB, keys: engineState.keys,
    };
  }

  function sessionStateToEngine(s) {
    return {
      board: engine.deserializeBoard(asJson(s.board), asJson(s.heroesW), asJson(s.heroesB)),
      turn: s.turn, castling: asJson(s.castling), ep: s.ep,
      halfmove: s.halfmove, fullmove: s.fullmove,
      heroesW: asJson(s.heroesW), heroesB: asJson(s.heroesB), keys: asJson(s.keys) || [],
    };
  }

  // Error handler: always JSON.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "bad_json", message: "Request body is not valid JSON." });
    }
    if (err instanceof PayPalError) {
      return res.status(502).json({ error: "paypal_error", message: "PayPal reported an error. Please try again." });
    }
    const status = err.status || 500;
    res.status(status).json({ error: err.code || "server_error", message: err.message || "Something went wrong." });
  });

  return app;
}

async function main() {
  // Never start in production with the publicly-known dev session secret.
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set in production (refusing to start with the known dev default).");
  }
  if (!process.env.SESSION_SECRET) {
    console.warn("WARNING: SESSION_SECRET is not set; using an insecure development default. Set SESSION_SECRET before any real deployment.");
  }
  const pool = createPool();
  await db.initDb(pool);
  const app = createApp(pool);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fantasy Chess listening on port ${PORT}`);
  });
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { createApp, createPool };
