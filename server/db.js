// Fantasy Chess — Postgres data layer.
// All queries are parameterized. `pool` is any pg-compatible pool
// (real `pg` Pool in production; pg-mem in tests).

const { STARTERS } = require("./data/heroes");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  gold INTEGER NOT NULL DEFAULT 100,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  last_stipend_date DATE,
  equipped JSONB NOT NULL DEFAULT '{"soldier":"bram-footman","archer":"pip-bowman","wizard":"eldon-hedge","knight":"tomas-squire","witch":"mabel-herb","warlord":"roland-captain"}'::jsonb
);
CREATE TABLE IF NOT EXISTS collection (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  copies INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, character_id)
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  board JSONB NOT NULL,
  turn TEXT NOT NULL DEFAULT 'w',
  castling JSONB NOT NULL,
  ep INTEGER,
  halfmove INTEGER NOT NULL DEFAULT 0,
  fullmove INTEGER NOT NULL DEFAULT 1,
  heroes_w JSONB NOT NULL,
  heroes_b JSONB NOT NULL,
  keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_fee INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  capture_id TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL,
  gold INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shop_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  client_id TEXT NOT NULL,
  secret TEXT NOT NULL,
  env TEXT NOT NULL DEFAULT 'sandbox'
);
CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL,
  step INTEGER NOT NULL DEFAULT 0,
  state JSONB NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function initDb(pool) {
  await pool.query(SCHEMA);
  // Pre-seed the shop config from environment variables, if set and no
  // config row exists yet (Render dashboard env vars win over the panel).
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (clientId && secret) {
    const env = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
    await pool.query(
      `INSERT INTO shop_config (id, client_id, secret, env) VALUES (1, $1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [clientId, secret, env]
    );
  }
}

async function getOrCreatePlayer(pool, playerId) {
  const existing = await pool.query("SELECT * FROM players WHERE id = $1", [playerId]);
  if (existing.rows.length > 0) return existing.rows[0];
  const created = await pool.query(
    `INSERT INTO players (id, gold, wins, losses, draws, games_played, equipped)
     VALUES ($1, 100, 0, 0, 0, 0, $2) RETURNING *`,
    [playerId, JSON.stringify(STARTERS)]
  );
  for (const [role, heroId] of Object.entries(STARTERS)) {
    await pool.query(
      "INSERT INTO collection (player_id, character_id, copies) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING",
      [playerId, heroId]
    );
  }
  return created.rows[0];
}

async function getCollection(pool, playerId) {
  const res = await pool.query(
    "SELECT character_id, copies FROM collection WHERE player_id = $1 ORDER BY character_id",
    [playerId]
  );
  return res.rows.map((r) => ({ characterId: r.character_id, copies: r.copies }));
}

async function addToCollection(pool, playerId, characterId) {
  await pool.query(
    `INSERT INTO collection (player_id, character_id, copies) VALUES ($1, $2, 1)
     ON CONFLICT (player_id, character_id) DO UPDATE SET copies = collection.copies + 1`,
    [playerId, characterId]
  );
}

async function setGold(pool, playerId, gold) {
  await pool.query("UPDATE players SET gold = $2 WHERE id = $1", [playerId, gold]);
}

async function addGold(pool, playerId, amount) {
  const res = await pool.query(
    "UPDATE players SET gold = gold + $2 WHERE id = $1 RETURNING gold",
    [playerId, amount]
  );
  return res.rows[0].gold;
}

async function recordResult(pool, playerId, result, goldAwarded) {
  const col = result === "win" ? "wins" : result === "loss" ? "losses" : "draws";
  const res = await pool.query(
    `UPDATE players SET ${col} = ${col} + 1, games_played = games_played + 1, gold = gold + $2 WHERE id = $1 RETURNING gold`,
    [playerId, goldAwarded]
  );
  return res.rows[0].gold;
}

async function setEquipped(pool, playerId, equipped) {
  await pool.query("UPDATE players SET equipped = $2 WHERE id = $1", [playerId, JSON.stringify(equipped)]);
}

async function claimStipend(pool, playerId) {
  // Atomic: only claims when gold < 20 and no claim today (UTC date).
  const res = await pool.query(
    `UPDATE players SET gold = gold + 20, last_stipend_date = CURRENT_DATE
     WHERE id = $1 AND gold < 20 AND (last_stipend_date IS NULL OR last_stipend_date < CURRENT_DATE)
     RETURNING gold`,
    [playerId]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].gold;
}

async function resetPlayer(pool, playerId) {
  await pool.query("DELETE FROM matches WHERE player_id = $1", [playerId]);
  await pool.query("DELETE FROM training_sessions WHERE player_id = $1", [playerId]);
  await pool.query("DELETE FROM collection WHERE player_id = $1", [playerId]);
  await pool.query(
    `UPDATE players SET gold = 100, wins = 0, losses = 0, draws = 0, games_played = 0,
     last_stipend_date = NULL, equipped = $2 WHERE id = $1`,
    [playerId, JSON.stringify(STARTERS)]
  );
  for (const heroId of Object.values(STARTERS)) {
    await pool.query(
      "INSERT INTO collection (player_id, character_id, copies) VALUES ($1, $2, 1) ON CONFLICT DO NOTHING",
      [playerId, heroId]
    );
  }
}

// --- Matches ---
async function saveMatch(pool, match) {
  await pool.query(
    `INSERT INTO matches (id, player_id, difficulty, status, board, turn, castling, ep,
       halfmove, fullmove, heroes_w, heroes_b, keys, history, entry_fee)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, board = EXCLUDED.board,
       turn = EXCLUDED.turn, castling = EXCLUDED.castling, ep = EXCLUDED.ep,
       halfmove = EXCLUDED.halfmove, fullmove = EXCLUDED.fullmove,
       heroes_w = EXCLUDED.heroes_w, heroes_b = EXCLUDED.heroes_b,
       keys = EXCLUDED.keys, history = EXCLUDED.history, updated_at = now()`,
    [match.id, match.playerId, match.difficulty, match.status,
     JSON.stringify(match.board), match.turn, JSON.stringify(match.castling), match.ep,
     match.halfmove, match.fullmove, JSON.stringify(match.heroesW), JSON.stringify(match.heroesB),
     JSON.stringify(match.keys), JSON.stringify(match.history), match.entryFee]
  );
}

async function getActiveMatch(pool, playerId) {
  const res = await pool.query(
    "SELECT * FROM matches WHERE player_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    [playerId]
  );
  return res.rows[0] || null;
}

async function getMatch(pool, matchId) {
  const res = await pool.query("SELECT * FROM matches WHERE id = $1", [matchId]);
  return res.rows[0] || null;
}

async function deleteMatch(pool, matchId) {
  await pool.query("DELETE FROM matches WHERE id = $1", [matchId]);
}

// --- Purchases (idempotency on capture_id) ---
async function recordPurchase(pool, { playerId, packId, captureId, priceCents, gold }) {
  // Idempotency on capture_id: plain INSERT, and treat a unique-violation
  // (23505) as "already recorded". (ON CONFLICT DO NOTHING is not honoured
  // by pg-mem, the in-memory Postgres used in tests.)
  try {
    const res = await pool.query(
      `INSERT INTO purchases (player_id, pack_id, capture_id, price_cents, gold)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [playerId, packId, captureId, priceCents, gold]
    );
    return res.rows.length > 0; // true = newly recorded (credit the gold)
  } catch (e) {
    if (e.code === "23505") return false;
    throw e;
  }
}

async function findPurchaseByCapture(pool, captureId) {
  const res = await pool.query("SELECT * FROM purchases WHERE capture_id = $1", [captureId]);
  return res.rows[0] || null;
}

// --- Shop config ---
async function getShopConfig(pool) {
  const res = await pool.query("SELECT client_id, secret, env FROM shop_config WHERE id = 1");
  return res.rows[0] || null;
}

async function saveShopConfig(pool, { clientId, secret, env }) {
  await pool.query(
    `INSERT INTO shop_config (id, client_id, secret, env) VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET client_id = EXCLUDED.client_id, secret = EXCLUDED.secret, env = EXCLUDED.env`,
    [clientId, secret, env]
  );
}

async function removeShopConfig(pool) {
  await pool.query("DELETE FROM shop_config WHERE id = 1");
}

module.exports = {
  initDb, getOrCreatePlayer, getCollection, addToCollection, setGold, addGold,
  recordResult, setEquipped, claimStipend, resetPlayer,
  saveMatch, getActiveMatch, getMatch, deleteMatch,
  recordPurchase, findPurchaseByCapture, getShopConfig, saveShopConfig, removeShopConfig,
};
