# Fantasy Chess — public web version

A standalone rebuild of Fantasy Chess: real chess rules with fantasy heroes,
a 72-hero collectible roster, five difficulty tiers, a PayPal gold shop,
a daily King's Stipend, and free Training Grounds. Node.js + Express server,
Postgres database, vanilla HTML/CSS/JS frontend. No build step.

## How it plays

- **Real chess, fantasy heroes.** Soldiers move like pawns, archers like
  rooks, wizards like bishops, knights like knights, witches like queens,
  warlords like kings — and every hero has a unique, engine-enforced ability
  (teleporting wizards, leaping archers, warlords that stride two squares…).
  Castling, en passant, promotion, check/checkmate, stalemate and draws all
  work.
- **72 collectible heroes** — 3 per rarity (Common / Rare / Epic / Legendary)
  for each of the 6 roles. 6 starters unlocked; the rest are earned from
  battle rewards. Duplicates level heroes up.
- **5 difficulties**, entry fees 20 / 50 / 100 / 200 / 350 gold. Winning pays
  2× entry (stage 1 pays a flat 75); draws refund half the entry fee.
- **Gold Shop** (PayPal Checkout, full-tab flow): Pouch 50 gold / $0.99,
  Satchel 165 / $2.99, Chest 335 / $4.99, Dragon Vault 835 / $9.99. Gold is
  credited **only** after the server verifies the capture with PayPal's API
  (status COMPLETED, exact pack price, exactly once per capture ID).
- **King's Stipend**: claim 20 gold once per calendar day when below 20 gold.
- **Training Grounds**: 6 free lessons with Coach Pell; lessons 4–6 unlock as
  your equipped team's rarity/level score grows.
- **TCG gallery**: rarity frames, holographic sheen on Rare+, locked cards
  greyed out, collection progress and filters.
- Progress, collection, gold and record persist per player (browser cookie).

## Project layout

```
fantasy-chess-public/
├── render.yaml            # Render blueprint (web service + Postgres)
├── package.json           # express, pg; pg-mem for tests
├── CONTRACT.md            # frontend ↔ server API contract (source of truth)
├── server/
│   ├── index.js           # Express app: routes, PayPal shop, training
│   ├── engine.js          # chess engine with hero abilities
│   ├── ai.js              # minimax AI, one profile per difficulty
│   ├── db.js              # Postgres schema + queries
│   ├── paypal.js          # PayPal REST client (Orders v2)
│   └── data/
│       ├── heroes.js      # the 72-hero roster, difficulties, packs
│       └── lessons.js     # Training Grounds lessons
├── public/                # frontend (served statically by the server)
│   ├── index.html  styles.css  app.js  manifest.webmanifest  icon.svg
└── tests/                 # node:test suites (engine, lessons, API)
```

## Run locally

Requires Node 20+ and Postgres (or use the test setup, which needs no DB).

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL and the rest
npm start                   # serves on http://localhost:3000
```

Environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (required) |
| `PORT` | HTTP port (default 3000; Render sets it) |
| `SESSION_SECRET` | Secret for signing player cookies (generate a random one) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal app credentials (optional — see Shop setup) |
| `PAYPAL_ENV` | `sandbox` or `live` (default `sandbox`) |
| `OWNER_SETUP_TOKEN` | Token that unlocks the in-app Store Owner Setup panel (optional) |

Run the tests (no Postgres needed — they use an in-memory database):

```bash
npm test
```

## Shop setup (PayPal)

Two ways to connect PayPal; either works:

1. **Environment variables** — set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`
   and `PAYPAL_ENV=live` on the server (Render dashboard → Environment).
2. **In-app panel** — set `OWNER_SETUP_TOKEN`, open the Shop tab, scroll to
   Store Owner Setup, enter the Client ID + Secret, pick Sandbox/Live and
   save with the owner token. The secret is stored server-side only and is
   never returned to the browser.

How a purchase works: the buyer clicks Buy → the server creates a PayPal
order → the buyer approves it on PayPal's own page (full tab) → back in the
game they press "Verify my payment" → the server reads the order from PayPal,
captures it if approved, checks the capture is COMPLETED for exactly the
pack's price, and credits the gold once per capture ID.

Use PayPal **Sandbox** keys first to test, then switch to **Live** keys for
real sales. Money goes to the PayPal account that owns the app credentials.

## Deploy to Render (~$13/mo)

1. **GitHub account + repo** — create a repo (e.g. `fantasy-chess`) and push
   this folder to it. Nothing in this repo contains secrets (`.env` is
   gitignored; never commit one).
2. **Render account** — sign up at render.com.
3. **New → Blueprint**, point it at the GitHub repo. Render creates the web
   service and the Postgres database from `render.yaml` (Starter web $7/mo +
   Starter Postgres $6/mo ≈ $13/mo). The Free database deletes itself after
   30 days — fine for a test, not for launch.
4. **Set PayPal env vars** in the Render dashboard (Environment tab): live
   `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=live`. (Or skip
   this and use the in-app Owner Setup panel; `OWNER_SETUP_TOKEN` is
   auto-generated by the blueprint — find it in the Environment tab.)
5. Deploy. The site is live at the `*.onrender.com` URL Render gives you.
   A custom domain is optional (~$10–15/year from a registrar) and can be
   added later in Render's Settings.

**Everyone starts fresh on the public site** — progress from the original
Muse version does not carry over.

## Known limitations / honest gaps

- **Player identity is a browser cookie, not an account.** There is no
  login; clearing cookies (or switching devices/browsers) loses the profile.
  The cookie is HMAC-signed so profiles can't be hijacked by guessing an ID.
  Accounts are a possible v2.
- **Portraits are illustrated monograms**, not the original anime portraits.
  The original art could not be recovered from the game (its API exposes no
  portrait URLs), so each card shows a rarity gradient + role icon + the
  hero's initial. If portrait art is supplied later, add a `portrait` URL
  per hero in `server/data/heroes.js` and have the frontend prefer it.
- **Three reconstructions** (documented in the code): the starting position
  is the standard 16-piece chess setup skinned by the equipped heroes; the
  battle-reward rarity weights reproduce the published reward notes; the
  lesson 4–6 unlock thresholds (team scores 2/4/6) reproduce the published
  rarity/level rule. The 72-hero roster itself (names, abilities, flavour,
  power) is transcribed exactly from the original game.
- The shop has **no refunds endpoint** and no admin dashboard; purchases are
  recorded in the `purchases` table for manual review.
