# Fantasy Chess — API & Engine Contract

This file is the single source of truth for how the frontend (`public/`) talks
to the server (`server/`) and how the engine (`server/engine.js`) is used.
Build to this contract; do not invent new endpoints or response shapes.

## Player identity

- The server identifies a player by a `fc_player` HttpOnly cookie holding a
  UUID. First visit creates a player row (100 gold, 6 starters). No accounts
  or passwords in v1; the cookie is the identity. Losing the cookie loses the
  profile (documented limitation).

## HTTP API (all JSON, all under `/api`)

### `GET /api/state`
Returns everything the UI needs in one call:
```json
{
  "gold": 250, "wins": 0, "losses": 0, "draws": 0, "gamesPlayed": 0, "record": "0-0-0",
  "catalog": [ { "id", "name", "role", "rarity", "power", "ability", "flavor" } ],
  "collection": [ { "characterId", "copies", "level", "equippedSlot": "soldier"|null } ],
  "equipped": { "soldier": "bram-footman", "archer": "pip-bowman", "wizard": "eldon-hedge", "knight": "tomas-squire", "witch": "mabel-herb", "warlord": "roland-captain" },
  "difficulties": [ { "id", "name", "opponent", "opponentTitle", "blurb", "cost", "winGold", "drawGold", "rewardNote", "enemyBand": { "soldier": "...", ... } } ],
  "shop": { "configured": true, "env": "sandbox"|"live"|null,
            "packs": [ { "id", "name", "gold", "priceCents", "priceLabel", "tagline", "badge" } ] },
  "stipend": { "amount": 20, "threshold": 20, "canClaim": false, "claimedToday": false },
  "activeMatch": null | { "id", "difficultyId", "board": <see below>, "turn": "w"|"b",
                         "history": [ { "from", "to", "san" } ], "status": "active"|"checkmate"|"stalemate"|"draw",
                         "result": null | "win"|"loss"|"draw", "check": false }
}
```

### `POST /api/match/start` `{ "difficultyId": "squire" }`
Charges the entry fee (fails 400 if gold is insufficient; fails 409
`match_active` if a match is already active) and returns
`{ "match": <activeMatch> }`. Player is White.

### `POST /api/match/move` `{ "from": "e2", "to": "e4", "promotion": "witch"|null, "castle": true|false|null }`
Applies the player's move if legal (400 otherwise), then the AI replies.
Returns `{ "match": <activeMatch>, "gameOver": false, "aiMove": { "from", "to", "san" }|null }`.
Squares are algebraic (`"a1"`..`"h8"`). Promotion must be one of
`"archer" | "wizard" | "knight" | "witch"`. A range-2 warlord stepping two
squares and castling can share a from/to — the server prefers castling when
both are legal, and the client may force either with `"castle": true|false`.

### `GET /api/match/moves`
Legal moves for the side to move in the active match (empty list when it is
the AI's turn or there is no match). The client uses this to highlight
destinations: `{ "moves": [ { "from", "to", "promotion", "castle", "san" } ] }`.
If a move has a non-null `promotion`, the client must ask which role
(archer/wizard/knight/witch) before sending it.

### `POST /api/match/abandon` `{}`
Closes a stuck active match with no rewards and no refund. Returns `{ "ok": true }`.

### `POST /api/collection/equip` `{ "characterId": "sera-shieldbearer" }`
Equips an owned hero into its role slot. Returns `{ "equipped": {...} }`.

### `POST /api/stipend/claim` `{}`
King's Stipend: +20 gold, once per calendar day, only when gold < 20.
Fails 400 otherwise. Returns `{ "gold": 20, "claimedToday": true }`.

### `POST /api/profile/reset` `{}`
Wipes gold/record/collection/matches and restores the fresh start
(100 gold, 6 starters). Returns the fresh `GET /api/state` body.

### Shop
- `GET /api/shop/config` → `{ "configured": bool, "env": "sandbox"|"live"|null }`
  (never returns the secret; the client id is not returned either).
- `POST /api/shop/config` `{ "clientId", "secret", "env", "ownerToken" }`
  Requires `ownerToken` to equal the server `OWNER_SETUP_TOKEN` env var.
  If `OWNER_SETUP_TOKEN` is unset, this endpoint is disabled (409) and
  PayPal must be configured via environment variables. Returns `{ "configured": true, "env" }`.
- Checkout is **full-tab only** (no embedded PayPal SDK — the client never
  needs the PayPal client id):
  `POST /api/shop/create-order` `{ "packId": "pouch" }` → `{ "orderId", "approveUrl" }`.
  The client opens `approveUrl` in a full browser tab; the buyer approves
  there; then the client shows a pending panel with a verify button that
  calls `POST /api/shop/complete-order` `{ "orderId" }` → `{ "gold": 250, "credited": 50 }`.
- `POST /api/shop/complete-order` `{ "orderId" }` → `{ "gold": 250, "credited": 50 }`.
  Reads the order back from PayPal; if APPROVED, captures it, verifies the
  capture (status COMPLETED, amount == pack price), credits the gold exactly
  once per capture id. If not approved yet: 409 `{ "error": "not_approved" }`.
- `POST /api/shop/complete-purchase` `{ "orderId" }` → same as above
  (kept for the embedded-checkout flow; verifies the capture directly).

Errors are `{ "error": "<code>", "message": "<human text>" }` with an HTTP
status (400 bad input, 409 conflict/not-ready, 502 PayPal failure).

## Training Grounds (in addition to the above)

- `GET /api/training` → `{ "teamScore": 3, "lessons": [ { "id", "title", "minScore", "unlocked", "text" } ] }`.
  Team score = sum over equipped heroes of rarity points (Common 0, Rare 1,
  Epic 2, Legendary 3) plus 1 per Lv 3+ equipped hero. Lessons 1–3 have
  minScore 0; lessons 4/5/6 need 2/4/6.
- `POST /api/training/start` `{ "lessonId": 1 }` → `{ "sessionId", "lessonId",
  "lessonTitle", "step": 0, "stepsTotal": 3, "instruction", "board", "turn": "w" }`.
- `POST /api/training/move` `{ "sessionId", "from": "a1", "to": "a4" }` →
  `{ "correct": true|false, "message", "done": bool, "board", "step",
  "stepsTotal", "instruction" }` (instruction/step present when advancing).
  A legal-but-wrong move returns `correct: false` and the board as it was
  (the position did not change, so the client must not be shown a
  position it cannot play from).

`GET /api/state` also includes `lessons` (same shape as /api/training) and
`teamScore`.

Standard chess starting position, 16 pieces per side. Each piece's type is
its role; every piece of a role uses the equipped hero of that role.
`board` is 8 ranks, rank 0 = rank 1 (White home rank), each square either
`null` or `{ "role": "soldier"|"archer"|"wizard"|"knight"|"witch"|"warlord",
"color": "w"|"b", "hero": "<hero id>" }`.
SAN strings are simple coordinate-ish labels (`"e2-e4"`, `"e7-e8=w"` for
promotion, `"O-O"`, `"O-O-O"`); the client must not parse them for logic.

## Engine (`server/engine.js`)

- `createGame(playerHeroes, enemyHeroes)` → state object.
  `playerHeroes`/`enemyHeroes` are `{ soldier, archer, wizard, knight, witch, warlord }`
  maps of role → hero id. White = player.
- `legalMoves(state)` → array of `{ from, to, piece, captured, promotion, castle, enPassant, double, teleport, san }`
  where `from`/`to` are `{ r, f }` (r 0 = rank 1, f 0 = file a).
- `applyMove(state, move)` → new state (does not mutate).
- `isCheck(state, color)`, `gameStatus(state)` → `"active"|"checkmate"|"stalemate"|"draw"`.
- `toAlgebraic({r,f})` / `fromAlgebraic("e4")`.
- Abilities are read from `server/data/heroes.js` `fx` flags on the hero
  objects. A hero with no flags plays as its plain base role.

## AI (`server/ai.js`)

- `chooseMove(state, difficultyId)` → a legal move (or null). Time-capped
  minimax with alpha-beta; difficulty sets depth/time/randomness.
- Never blocks the event loop longer than ~2.5s.

## Roles map to base chess pieces

soldier = pawn, archer = rook, wizard = bishop, knight = knight,
witch = queen, warlord = king.

## Shop rules (server-enforced, never trust the client)

- Gold is credited only after server-side verification of the PayPal capture:
  capture status must be `COMPLETED` and the captured amount must equal the
  pack's `priceCents` exactly.
- Exactly once per capture id (unique constraint on `purchases.capture_id`).
- Pack prices come from the server catalog, never from client input.
