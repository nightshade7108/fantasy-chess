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
  version INTEGER NOT NULL DEFAULT 1,
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
  // Migrations for databases created before these columns/indexes existed.
  await pool.query("ALTER TABLE matches ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1");
  // A player must never hold two active matches (a past race created
  // duplicates). Keep the newest active match per player, then enforce it
  // with a partial unique index. The index is created defensively: if
  // duplicates somehow remain, the server still starts and the
  // transactions + row locks below remain the primary guard.
  // (Grouped in JS: pg-mem, the in-memory Postgres used in tests, does
  // not support GROUP BY ... HAVING COUNT(*) > 1.)
  const actives = await pool.query(
    "SELECT id, player_id FROM matches WHERE status = 'active' ORDER BY player_id, created_at DESC, id DESC"
  );
  const seenPlayers = new Set();
  let removedDupes = 0;
  for (const row of actives.rows) {
    if (seenPlayers.has(row.player_id)) {
      await pool.query("DELETE FROM matches WHERE id = $1", [row.id]);
      removedDupes++;
    } else {
      seenPlayers.add(row.player_id);
    }
  }
  if (removedDupes > 0) {
    console.warn(`initDb: removed ${removedDupes} duplicate active match(es)`);
  }
  try {
    await pool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS matches_one_active_per_player ON matches(player_id) WHERE status = 'active'"
    );
  } catch (e) {
    console.warn("initDb: could not create the one-active-match index:", e.message);
  }
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

// --- Transactions -------------------------------------------------------
// Run `fn(client)` inside a single Postgres transaction on one pooled
// client. Every db helper takes a pool-or-client as its first argument, so
// pass `client` through to keep every statement in the transaction. On
// error the transaction rolls back and the error rethrows.
async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* already closed */ }
    throw e;
  } finally {
    client.release();
  }
}

// Per-player in-process lock, keyed by player id. The database mechanisms
// (row locks, the partial unique index, the version column) are the real
// guarantee across processes; this lock additionally serializes one
// player's concurrent requests inside this process, which is what makes
// the race fixes deterministic against pg-mem in tests (its pool hands
// out a single shared client, so two "transactions" there would otherwise
// see each other's uncommitted writes). Different players never block
// each other.
const playerLocks = new Map();
async function withPlayerLock(playerId, fn) {
  const prev = playerLocks.get(playerId) || Promise.resolve();
  let release;
  const mine = new Promise((r) => { release = r; });
  const chained = prev.then(() => mine);
  playerLocks.set(playerId, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (playerLocks.get(playerId) === chained) playerLocks.delete(playerId);
  }
}

// The database's own current date (one clock for the stipend gate in
// claimStipend and the banner in buildStateResponse — never the app
// server's clock, which can disagree around midnight).
async function currentDate(pool) {
  const res = await pool.query("SELECT CURRENT_DATE AS today");
  return new Date(res.rows[0].today).toISOString().slice(0, 10);
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

// Same as getActiveMatch, but locks the row for the duration of the
// caller's transaction: a second concurrent move for this player blocks
// here, then re-reads the post-move state instead of applying its move
// to the stale pre-move board.
async function getActiveMatchForUpdate(client, playerId) {
  const res = await client.query(
    "SELECT * FROM matches WHERE player_id = $1 AND status = 'active' FOR UPDATE",
    [playerId]
  );
  return res.rows[0] || null;
}

async function getMatch(pool, matchId) {
  const res = await pool.query("SELECT * FROM matches WHERE id = $1", [matchId]);
  return res.rows[0] || null;
}

// Version-guarded save for the move handler: updates the match only if
// its version is still the one the handler read at the start of its
// transaction, and bumps the version. Returns false (0 rows) when another
// request already applied a move — the caller must abort (rolling back
// any settlement done in the same transaction) instead of saving over it.
async function saveMatchVersioned(client, match, expectedVersion) {
  const res = await client.query(
    `UPDATE matches SET status = $2, board = $3, turn = $4, castling = $5, ep = $6,
       halfmove = $7, fullmove = $8, heroes_w = $9, heroes_b = $10,
       keys = $11, history = $12, version = version + 1, updated_at = now()
     WHERE id = $1 AND version = $13`,
    [match.id, match.status, JSON.stringify(match.board), match.turn,
     JSON.stringify(match.castling), match.ep, match.halfmove, match.fullmove,
     JSON.stringify(match.heroesW), JSON.stringify(match.heroesB),
     JSON.stringify(match.keys), JSON.stringify(match.history), expectedVersion]
  );
  return res.rowCount > 0;
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

// Transaction-safe purchase recording: record the capture and credit the
// gold in the caller's transaction, so the two can never be split (a
// recorded capture with no credit, or a credit with no record). Returns
// { inserted, gold }: inserted=false when this capture was already
// recorded (idempotent replay — credit nothing, just report the balance).
// NOTE: do NOT use the plain recordPurchase() helper inside a transaction
// — its catch of the unique-violation would abort the transaction.
async function recordPurchaseAndCredit(client, { playerId, packId, captureId, priceCents, gold }) {
  const existing = await client.query(
    "SELECT id FROM purchases WHERE capture_id = $1",
    [captureId]
  );
  if (existing.rows.length > 0) return { inserted: false, gold: null };
  await client.query(
    `INSERT INTO purchases (player_id, pack_id, capture_id, price_cents, gold)
     VALUES ($1,$2,$3,$4,$5)`,
    [playerId, packId, captureId, priceCents, gold]
  );
  const newGold = await addGold(client, playerId, gold);
  return { inserted: true, gold: newGold };
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
  initDb, withTransaction, withPlayerLock, currentDate,
  getOrCreatePlayer, getCollection, addToCollection, setGold, addGold,
  recordResult, setEquipped, claimStipend, resetPlayer,
  saveMatch, saveMatchVersioned, getActiveMatch, getActiveMatchForUpdate, getMatch, deleteMatch,
  recordPurchase, recordPurchaseAndCredit, getShopConfig, saveShopConfig, removeShopConfig,
};
