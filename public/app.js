/* Fantasy Chess — standalone frontend.
   All game rules live server-side. This file only renders what /api/*
   returns and sends moves. It never computes legality itself. */

"use strict";

/* ---------------- helpers ---------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const FILES = "abcdefgh";
const sqName = (r, f) => FILES[f] + (r + 1);
const ROLE_LABEL = { soldier: "Soldier", archer: "Archer", wizard: "Wizard", knight: "Knight", witch: "Witch", warlord: "Warlord" };
const RARITY_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };
const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
const ROLES = ["soldier", "archer", "wizard", "knight", "witch", "warlord"];
const PROMO_ROLES = ["archer", "wizard", "knight", "witch"];

/* Inline SVG role icons — never emoji for pieces. */
const ICONS = {
  soldier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 L19 5 V11 C19 16 15.5 20.5 12 22 C8.5 20.5 5 16 5 11 V5 Z"/><path d="M12 7 V12 M9.5 9.5 L12 7 L14.5 9.5"/></svg>',
  archer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3 C13 6 13 18 6 21"/><path d="M6 3 C9 8 9 16 6 21"/><path d="M4 12 L20 12"/><path d="M20 12 L16.5 9.5 M20 12 L16.5 14.5"/></svg>',
  wizard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21 L16 5"/><path d="M16 5 L18.5 7.5 L17 10 L14.5 8.5 Z" fill="currentColor" stroke="none"/><path d="M19 3 L19.7 5.2 L22 6 L19.7 6.8 L19 9 L18.3 6.8 L16 6 L18.3 5.2 Z" fill="currentColor" stroke="none"/><path d="M8 14 L9.5 15.5 M10 11.5 L11.5 13"/></svg>',
  knight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20 L5 15 L7 8 L10 3.5 L13.5 4 L16 6 L18 10 L18.5 14 L18 17 L16.5 20 Z"/><path d="M7 8 L9.5 7 L10.5 10 L8 11 Z"/><circle cx="12" cy="7" r="0.6" fill="currentColor"/></svg>',
  witch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13.5 A8.5 8.5 0 1 1 10.5 4 A7 7 0 0 0 20 13.5 Z"/><path d="M17 4.5 L17.6 6.4 L19.5 7 L17.6 7.6 L17 9.5 L16.4 7.6 L14.5 7 L16.4 6.4 Z" fill="currentColor" stroke="none"/></svg>',
  warlord: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18 L3 7 L8 10.5 L12 4 L16 10.5 L21 7 L20 18 Z"/><path d="M5 20.5 L19 20.5"/><circle cx="12" cy="13.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
};
const icon = (role) => ICONS[role] || ICONS.soldier;

/* Filled role silhouettes for the die-cut piece tokens: the token IS the
   symbol shape (shield / bow / wand / sword / crescent moon / crown),
   filled with the side colour and outlined in the hero's rarity colour.
   `.sil` is the main shape, `.det` a lighter inner detail. The shapes are
   drawn for a refined, crafted look: smooth curves, balanced proportions,
   a clear silhouette at small sizes. */
const SILHOUETTES = {
  soldier: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sil" d="M12 1.6 C14.2 2.4 16.8 3.2 19.4 4.2 V10.8 C19.4 15.9 15.9 20 12 22 C8.1 20 4.6 15.9 4.6 10.8 V4.2 C7.2 3.2 9.8 2.4 12 1.6 Z"/><path class="det" d="M12 6 C13.5 6.6 15 7.2 16.2 7.8 V10.8 C16.2 13.9 14.4 16.4 12 17.8 C9.6 16.4 7.8 13.9 7.8 10.8 V7.8 C9 7.2 10.5 6.6 12 6 Z"/></svg>',
  archer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sil" d="M10 1 C4.5 4.5 3.2 8 3.2 12 C3.2 16 4.5 19.5 10 23 C7.8 19 7.2 15.5 7.2 12 C7.2 8.5 7.8 5 10 1 Z"/><path class="sil" d="M9.7 1 L10.3 1 L10.3 23 L9.7 23 Z"/><path class="sil" d="M9.5 11.3 L20 11.3 L20 12.7 L9.5 12.7 Z"/><path class="sil" d="M19.4 9.3 L23.6 12 L19.4 14.7 Z"/><path class="sil" d="M7.5 9.7 L10.5 12 L7.5 14.3 Z"/></svg>',
  wizard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sil" d="M4.7 21.5 L15.6 4.8 L16.4 5.2 L6.3 22.5 Z"/><path class="sil" d="M17.8 1 L18.4 3 L20.4 3.6 L18.4 4.2 L17.8 6.2 L17.2 4.2 L15.2 3.6 L17.2 3 Z"/><path class="sil" d="M21 8.4 L21.4 9.7 L22.7 10.1 L21.4 10.5 L21 11.8 L20.6 10.5 L19.3 10.1 L20.6 9.7 Z"/><path class="sil" d="M8.5 13.8 L8.8 14.9 L9.9 15.2 L8.8 15.5 L8.5 16.6 L8.2 15.5 L7.1 15.2 L8.2 14.9 Z"/></svg>',
  knight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sil" d="M12 0.8 L13.5 3.4 L13.1 12.4 L10.9 12.4 L10.5 3.4 Z"/><path class="det" d="M11.6 3.8 L12.4 3.8 L12.3 11.6 L11.7 11.6 Z"/><path class="sil" d="M4.8 13.2 L19.2 13.2 L19.2 15.2 L4.8 15.2 Z"/><path class="sil" d="M10.9 15.4 L13.1 15.4 L13.1 19.8 L10.9 19.8 Z"/><path class="sil" d="M12 20 m-1.9 0 a1.9 1.9 0 1 0 3.8 0 a1.9 1.9 0 1 0 -3.8 0"/></svg>',
  witch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sil" d="M20.6 14.2 A8.6 8.6 0 1 1 10.4 3.8 A7.4 7.4 0 0 0 20.6 14.2 Z"/><path class="sil" d="M17.6 2.6 L18.1 4.5 L20 5 L18.1 5.5 L17.6 7.4 L17.1 5.5 L15.2 5 L17.1 4.5 Z"/><path class="sil" d="M7.5 17.5 L7.8 18.5 L8.8 18.8 L7.8 19.1 L7.5 20.1 L7.2 19.1 L6.2 18.8 L7.2 18.5 Z"/></svg>',
  warlord: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="sil" d="M3.4 17.6 L2.4 6.6 L7.8 10.6 L12 3 L16.2 10.6 L21.6 6.6 L20.6 17.6 Z"/><path class="sil" d="M2.4 5.2 m-1.2 0 a1.2 1.2 0 1 0 2.4 0 a1.2 1.2 0 1 0 -2.4 0"/><path class="sil" d="M12 1.6 m-1.2 0 a1.2 1.2 0 1 0 2.4 0 a1.2 1.2 0 1 0 -2.4 0"/><path class="sil" d="M21.6 5.2 m-1.2 0 a1.2 1.2 0 1 0 2.4 0 a1.2 1.2 0 1 0 -2.4 0"/><path class="sil" d="M3.8 19 L20.2 19 L20.2 21.6 L3.8 21.6 Z"/><path class="det" d="M12 19.4 L13.3 20.3 L12 21.2 L10.7 20.3 Z"/></svg>',
};
const silhouette = (role) => SILHOUETTES[role] || SILHOUETTES.soldier;

/* ---------------- state ---------------- */
let S = null;               // GET /api/state payload
let currentTab = "battle";
let battleSel = null;       // { from, dests: {to: "move"|"capture"}, moves: [move objects] }
let battleBusy = false;
let lastSettlement = null;  // settlement object from the final move response
let lastResultDiff = null;  // difficulty id of the finished match
let lastAiMove = null;      // { from, to } of the most recent AI reply —
// highlighted on the board until the player makes their next move.
/* Static data (catalog, difficulties, shop packs) never changes during a
   session, so it is fetched once and merged into every later slim
   /api/state?full=0 response. That cuts each refresh from ~37KB to ~2.6KB. */
let staticCache = null;     // { catalog, difficulties, packs }
/* Legal moves for the current position, cached: the position only changes
   when a move is made, so re-selecting pieces in the same position must
   not hit the network again. Keyed by the board object reference + turn —
   a new position always means a new board object from the server. */
let movesCache = { board: null, turn: null, moves: null };
const AI_THINK_MS = 750;    // beat after the player's move lands, before the enemy acts
const AI_SLIDE_MS = 450;    // how long the enemy chip takes to slide to its square
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let galleryRole = "all";
let galleryRarity = "all";
let gallerySelected = null; // hero id for the detail modal
let pendingOrder = null;    // { orderId, packId, packName, priceLabel } — also in localStorage
let training = null;        // active training session view-model
let trainingSel = null;     // { from } for the training board
let shopConfig = null;      // GET /api/shop/config

try { pendingOrder = JSON.parse(localStorage.getItem("fc_pending_order") || "null"); } catch (e) { pendingOrder = null; }

/* ---------------- api ---------------- */
async function api(path, opts) {
  const res = await fetch(path, Object.assign(
    { headers: { "Content-Type": "application/json" } }, opts || {}));
  let body = {};
  try { body = await res.json(); } catch (e) { /* non-JSON body */ }
  if (!res.ok) {
    const err = new Error(body.message || body.error || ("Request failed (" + res.status + ")"));
    err.code = body.error; err.status = res.status;
    throw err;
  }
  return body;
}

async function refreshState() {
  // After the first full load the static data is cached, so ask for the
  // slim state (~2.6KB instead of ~37KB) and merge the cached statics back
  // in. The board may have changed, so drop the cached legal moves too.
  const useSlim = !!staticCache;
  const body = await api(useSlim ? "/api/state?full=0" : "/api/state");
  if (!useSlim) {
    staticCache = {
      catalog: body.catalog,
      difficulties: body.difficulties,
      packs: (body.shop && body.shop.packs) || [],
    };
    S = body;
  } else {
    S = body;
    S.catalog = staticCache.catalog;
    S.difficulties = staticCache.difficulties;
    S.shop = S.shop || {};
    S.shop.packs = staticCache.packs;
  }
  movesCache = { board: null, turn: null, moves: null };
  renderHeader();
  renderTab(currentTab);
}

/* Legal moves for the current position. Cached: the position only changes
   when a move is made, so re-selecting pieces in the same position must
   not hit the network again. */
async function getMoves() {
  const m = S.activeMatch;
  if (!m) return [];
  if (movesCache.moves && movesCache.board === m.board && movesCache.turn === m.turn) {
    return movesCache.moves;
  }
  const res = await api("/api/match/moves");
  movesCache = { board: m.board, turn: m.turn, moves: res.moves || [] };
  return movesCache.moves;
}

function toast(msg, isError) {
  const t = $("#toast");
  t.textContent = msg;
  t.style.borderColor = isError ? "#dc2626" : "#f2b705";
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 4500);
}
function showError(e) {
  toast(e && e.message ? e.message : "Something went wrong.", true);
}

/* ---------------- header / tabs ---------------- */
function renderHeader() {
  if (!S) return;
  $("#hdr-gold").textContent = S.gold;
  $("#hdr-record").textContent = S.wins + "W · " + S.losses + "L · " + S.draws + "D";
}

function switchTab(tab) {
  currentTab = tab;
  $$(".tab-btn").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + tab));
  renderTab(tab);
}

function renderTab(tab) {
  if (!S) return;
  if (tab === "battle") renderBattle();
  else if (tab === "gallery") renderGallery();
  else if (tab === "shop") renderShop();
  else if (tab === "training") renderTraining();
  else if (tab === "guide") renderGuide();
}

/* ---------------- shared: board ---------------- */
/* board: ranks array, rank 0 = rank 1 (White home rank). Rendered ranks
   8 -> 1 top to bottom, White at the bottom. */
function boardHTML(board, opts) {
  opts = opts || {};
  const selFrom = opts.selectedFrom || null;
  const dests = opts.dests || {}; // to-square -> "move" | "capture"
  const checkSq = opts.checkSquare || null;
  const aiMove = opts.aiMove || null; // last AI reply: highlight its from/to squares
  const theme = opts.theme || "arena-squire"; // per-difficulty arena
  let html = '<div class="board ' + theme + '" role="grid" aria-label="Chess board">';
  for (let r = 7; r >= 0; r--) {
    for (let f = 0; f < 8; f++) {
      const sq = sqName(r, f);
      const cell = board && board[r] ? board[r][f] : null;
      const cls = ["sq", ((r + f) % 2 === 0) ? "dark" : "light"];
      if (opts.playable) cls.push("playable");
      if (selFrom === sq) cls.push("selected");
      if (dests[sq] === "move") cls.push("dest");
      if (dests[sq] === "capture") cls.push("dest-capture");
      if (checkSq === sq) cls.push("in-check");
      if (aiMove && aiMove.from === sq) cls.push("ai-from");
      if (aiMove && aiMove.to === sq) cls.push("ai-to");
      let inner = "";
      if (f === 0) inner += '<span class="coord rank">' + (r + 1) + "</span>";
      if (r === 0) inner += '<span class="coord file">' + FILES[f] + "</span>";
      if (cell) inner += chipHTML(cell);
      html += '<div class="' + cls.join(" ") + '" data-square="' + sq + '" role="gridcell" aria-label="' + sq + (cell ? " " + ROLE_LABEL[cell.role] : "") + '">' + inner + "</div>";
    }
  }
  return html + "</div>";
}

function heroById(id) {
  return (S && S.catalog) ? S.catalog.find((h) => h.id === id) || null : null;
}

/* Die-cut piece token: the token IS the role symbol, filled with the side
   colour (warm ivory = player, muted slate = enemy), outlined in rarity colour,
   gold rim on warlords. */
function chipHTML(cell) {
  const hero = heroById(cell.hero);
  const rarity = hero ? hero.rarity : "common";
  const cls = "chip " + cell.color + (cell.role === "warlord" ? " warlord" : "");
  return '<span class="' + cls + '" style="--rarity-color: var(--rarity-' + rarity + ')" title="' +
    esc(hero ? hero.name : ROLE_LABEL[cell.role]) + '">' + silhouette(cell.role) + "</span>";
}

function miniChipHTML(cell) {
  const hero = heroById(cell.hero);
  const rarity = hero ? hero.rarity : "common";
  const cls = "chip mini " + cell.color + (cell.role === "warlord" ? " warlord" : "");
  return '<span class="' + cls + '" style="--rarity-color: var(--rarity-' + rarity + ')">' + silhouette(cell.role) + "</span>";
}

/* Captured pieces, derived from the board vs the standard 16-piece start.
   Promotions are compensated: an extra witch/archer/wizard/knight of a
   colour means one of its soldiers promoted rather than being captured. */
function capturedPieces(board) {
  const start = { soldier: 8, archer: 2, wizard: 2, knight: 2, witch: 1, warlord: 1 };
  const count = { w: {}, b: {} };
  ROLES.forEach((r) => { count.w[r] = 0; count.b[r] = 0; });
  (board || []).forEach((rank) => (rank || []).forEach((cell) => {
    if (cell) count[cell.color][cell.role]++;
  }));
  const out = { w: [], b: [] }; // pieces of that colour that were captured
  ["w", "b"].forEach((color) => {
    let promoted = 0;
    ["archer", "wizard", "knight", "witch"].forEach((r) => {
      if (count[color][r] > start[r]) promoted += count[color][r] - start[r];
    });
    ROLES.forEach((r) => {
      let missing = start[r] - count[color][r];
      if (r === "soldier") missing = Math.max(0, missing - promoted);
      missing = Math.max(0, missing);
      for (let i = 0; i < missing; i++) out[color].push(r);
    });
  });
  return out;
}

function capturedRowHTML(label, roles, color) {
  if (!roles.length) return '<div class="captured-row"><span class="cap-label">' + esc(label) + ':</span><span class="muted small">none yet</span></div>';
  return '<div class="captured-row"><span class="cap-label">' + esc(label) + ':</span>' +
    roles.map((r) => miniChipHTML({ role: r, color: color, hero: null })).join("") + "</div>";
}

function historyHTML(history) {
  if (!history || !history.length) return '<p class="muted small">No moves yet.</p>';
  const items = history.map((m, i) => "<li>" + esc(m.san || (m.from + "–" + m.to)) + "</li>").join("");
  return "<ol>" + items + "</ol>";
}

/* Promotion picker modal. Resolves with the chosen role or null. */
function pickPromotion() {
  return new Promise((resolve) => {
    const root = $("#modal-root");
    root.innerHTML =
      '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="Choose promotion">' +
      "<h2>Promote your soldier!</h2>" +
      "<p>Your soldier reached the far rank. Choose what it becomes:</p>" +
      '<div class="promo-grid">' +
      PROMO_ROLES.map((r) =>
        '<button class="promo-btn" data-role="' + r + '">' +
        '<span class="chip w" style="--rarity-color: var(--rarity-common)">' + silhouette(r) + "</span>" +
        esc(ROLE_LABEL[r]) + "</button>").join("") +
      "</div>" +
      '<div class="modal-actions"><button class="btn btn-ghost" data-cancel>Cancel</button></div>' +
      "</div></div>";
    root.querySelectorAll(".promo-btn").forEach((b) => b.addEventListener("click", () => { root.innerHTML = ""; resolve(b.dataset.role); }));
    root.querySelector("[data-cancel]").addEventListener("click", () => { root.innerHTML = ""; resolve(null); });
  });
}

/* Castle-or-stride picker modal. A range-2 warlord stepping two squares
   toward its archer is also a castling move; ask which the player means.
   Resolves true (castle), false (plain two-square step), or null (cancel). */
function pickCastleOrStride() {
  return new Promise((resolve) => {
    const root = $("#modal-root");
    root.innerHTML =
      '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="Castle or step?">' +
      "<h2>Castle or step?</h2>" +
      "<p>Your warlord can step two squares — or castle with the archer. Which do you mean?</p>" +
      '<div class="promo-grid">' +
      '<button class="promo-btn" data-castle="1">Castle with the archer</button>' +
      '<button class="promo-btn" data-castle="0">Step two squares</button>' +
      "</div>" +
      '<div class="modal-actions"><button class="btn btn-ghost" data-cancel>Cancel</button></div>' +
      "</div></div>";
    root.querySelectorAll(".promo-btn").forEach((b) => b.addEventListener("click", () => { root.innerHTML = ""; resolve(b.dataset.castle === "1"); }));
    root.querySelector("[data-cancel]").addEventListener("click", () => { root.innerHTML = ""; resolve(null); });
  });
}

/* ---------------- Battle tab ---------------- */
function renderBattle() {
  const el = $("#tab-battle");
  const m = S.activeMatch;
  const diff = m ? S.difficulties.find((d) => d.id === m.difficultyId) : null;

  let html = '<div class="stats-row">' +
    statCard(S.gold, "Gold") +
    statCard(S.wins, "Wins") + statCard(S.losses, "Losses") + statCard(S.draws, "Draws") +
    statCard(S.gamesPlayed, "Battles") +
    "</div>";

  // King's Stipend banner when broke.
  if (S.gold < S.stipend.threshold) {
    html += '<div class="banner" role="status">' +
      "<p><strong>👑 King's Stipend:</strong> You are below " + S.stipend.threshold + " gold. " +
      (S.stipend.claimedToday
        ? "You already claimed today's stipend — come back tomorrow."
        : "Claim " + S.stipend.amount + " free gold, once a day.") + "</p>" +
      '<button class="btn btn-gold" id="claim-stipend" ' + (S.stipend.canClaim ? "" : "disabled") + ">Claim " + S.stipend.amount + " gold</button>" +
      "</div>";
  }

  if (m) {
    html += matchHTML(m, diff);
  } else if (lastSettlement) {
    html += resultHTML(lastSettlement, lastResultDiff);
  }

  if (!m) {
    html += '<div class="panel"><h2>Choose your battle</h2>' +
      '<p class="muted">Win to earn gold and a new hero card. A draw refunds part of your entry fee. Entry fees are charged when the battle starts.</p>' +
      '<div class="diff-grid">' + S.difficulties.map((d) => diffCardHTML(d)).join("") + "</div></div>";
  }

  el.innerHTML = html;

  const claimBtn = $("#claim-stipend");
  if (claimBtn) claimBtn.addEventListener("click", claimStipend);
  $$(".diff-start", el).forEach((b) => b.addEventListener("click", () => startMatch(b.dataset.diff)));
  if (m) wireBattleBoard(m);
  const ab = $("#abandon-match");
  if (ab) ab.addEventListener("click", abandonMatch);
  const back = $("#back-to-battles");
  if (back) back.addEventListener("click", () => { lastSettlement = null; lastResultDiff = null; renderBattle(); });
}

function statCard(num, label) {
  return '<div class="stat-card"><span class="num">' + esc(num) + '</span><span class="lbl">' + esc(label) + "</span></div>";
}

function diffCardHTML(d) {
  const afford = S.gold >= d.cost;
  return '<div class="diff-card arena-' + esc(d.id) + '">' +
    "<h3>" + esc(d.name) + "</h3>" +
    '<div class="opp">' + esc(d.opponent) + '</div><div class="small muted">' + esc(d.opponentTitle || "") + "</div>" +
    '<div class="blurb">' + esc(d.blurb || "") + "</div>" +
    '<div class="costs">Entry <b>' + d.cost + ' gold</b> · Win <b>' + d.winGold + ' gold</b> · Draw <b>' + d.drawGold + " gold</b></div>" +
    '<div class="reward-note">' + esc(d.rewardNote || "") + "</div>" +
    '<button class="btn btn-gold diff-start" data-diff="' + esc(d.id) + '" ' + (afford ? "" : "disabled") + ">" +
    (afford ? "Start battle — " + d.cost + " gold" : "Need " + d.cost + " gold") + "</button>" +
    "</div>";
}

function matchHTML(m, diff) {
  const caps = capturedPieces(m.board);
  const enemyHeroes = diff ? diff.enemyBand : {};
  const checkSq = m.check ? findWarlordSquare(m.board, m.turn) : null;
  const arena = "arena-" + (diff ? diff.id : "squire");
  const turnText = m.status !== "active"
    ? "Battle over"
    : m.turn === "w" ? "Your move — tap one of your ivory heroes" : "The enemy is thinking…";
  return '<div class="panel ' + arena + '"><h2>' + esc(diff ? diff.name : "Battle") +
    ' <span class="small muted">vs ' + esc(diff ? diff.opponent : "") + "</span></h2>" +
    '<p class="turn-line">' + esc(turnText) + " " +
    (m.check && m.status === "active" ? '<span class="check-flag">CHECK!</span>' : "") + "</p>" +
    '<div class="match-wrap"><div class="board-col">' +
    boardHTML(m.board, { playable: m.status === "active" && m.turn === "w", selectedFrom: battleSel ? battleSel.from : null, dests: battleSel ? battleSel.dests : {}, checkSquare: checkSq, theme: arena, aiMove: lastAiMove }) +
    '<p class="small muted" style="text-align:center">You are White (ivory), at the bottom. The enemy is slate, at the top.</p>' +
    "</div>" +
    '<div class="side-col">' +
    '<div id="sel-dialog">' + selectedMovesHTML() + "</div>" +
    "<h3>Move history</h3>" +
    '<div class="history-box">' + historyHTML(m.history) + "</div>" +
    '<p style="margin-top:1rem"><button class="btn btn-danger" id="abandon-match">Abandon battle (no refund)</button></p>' +
    "</div></div>" +
    '<div class="below-board">' +
    "<h3>Your warband</h3>" + fieldStripHTML(S.equipped, "w") +
    "<h3>Enemy warband</h3>" + fieldStripHTML(enemyHeroes, "b") +
    "<h3>Captured</h3>" +
    capturedRowHTML("You captured", caps.b, "b") +
    capturedRowHTML("Enemy captured", caps.w, "w") +
    "</div></div>";
}

/* The selected-character dialog: what the selected hero can do, in plain
   language. It lives in the side column beside the board, updates when a
   different piece is selected, and disappears on deselect or after a move.
   Every ability affects movement (see the fx glossary in heroes.js), so the
   ability line is always shown. */
function selectedMovesHTML() {
  if (!battleSel || !S.activeMatch) return "";
  const m = S.activeMatch;
  const cell = cellAt(m.board, battleSel.from);
  if (!cell) return "";
  const hero = cell.hero ? heroById(cell.hero) : null;
  const name = hero ? hero.name : ROLE_LABEL[cell.role];
  const byDest = {};
  (battleSel.moves || []).forEach((mv) => {
    (byDest[mv.to] = byDest[mv.to] || []).push(mv);
  });
  const dests = Object.keys(byDest).sort();
  let items = "";
  dests.forEach((to) => {
    items += "<li>" + esc(describeMovesTo(byDest[to], to, battleSel.from, m.board)) + "</li>";
  });
  if (!dests.length) items = "<li>No legal moves right now.</li>";
  return '<div class="sel-dialog" role="status" aria-live="polite">' +
    '<div class="sel-head">' + miniChipHTML({ role: cell.role, color: cell.color, hero: cell.hero }) +
    "<div><strong>" + esc(name) + "</strong><br><span class='muted small'>" + esc(ROLE_LABEL[cell.role]) +
    (hero ? " · " + esc(RARITY_LABEL[hero.rarity]) : "") + " · " + esc(battleSel.from) + "</span></div></div>" +
    (hero ? '<p class="sel-ability">✦ ' + esc(hero.ability) + "</p>" : "") +
    "<p><strong>Possible moves (" + dests.length + "):</strong></p>" +
    '<ul class="sel-moves">' + items + "</ul></div>";
}

/* Plain-language description of every legal move to one destination square.
   movesTo is the list of move objects landing on `to` (there can be several
   when castling, striding and promoting overlap). */
function describeMovesTo(movesTo, to, from, board) {
  const hasCastle = movesTo.some((mv) => mv.castle);
  const hasPlain = movesTo.some((mv) => !mv.castle);
  const hasPromo = movesTo.some((mv) => mv.promotion);
  if (hasCastle && hasPlain) return "Castle with the archer, or step two squares to " + to;
  if (hasCastle) return "Castle with the archer to " + to;
  const mv = movesTo[0];
  const isCapture = mv.san && mv.san.indexOf("x") !== -1;
  const promoSuffix = " — choose Archer, Wizard, Knight or Witch";
  if (isCapture) {
    const target = cellAt(board, to);
    let who;
    if (target) {
      const tHero = target.hero ? heroById(target.hero) : null;
      who = tHero ? tHero.name + " (" + ROLE_LABEL[target.role] + ")" : "the " + ROLE_LABEL[target.role];
    } else {
      // En passant: the destination is empty; the captured soldier sits on
      // the origin rank, destination file.
      const capSq = to[0] + from[1];
      const capCell = cellAt(board, capSq);
      const capHero = capCell && capCell.hero ? heroById(capCell.hero) : null;
      who = capHero
        ? "en passant — takes " + capHero.name + " (" + ROLE_LABEL[capCell.role] + ") on " + capSq
        : "en passant on " + capSq;
    }
    if (hasPromo) return "Capture " + who + " on " + to + " and promote" + promoSuffix;
    return "Capture " + who + " on " + to;
  }
  if (hasPromo) return "Promote on " + to + promoSuffix;
  return "Move to " + to;
}

/* Update only the selection highlights and the dialog — no full tab
   re-render. Tapping a piece is the hottest interaction in a battle, and
   rebuilding the whole tab (64 squares, warbands, history) on every tap
   is what made it feel laggy. Falls back to renderBattle if the board
   is not in the DOM. The ai-from/ai-to/check classes are left untouched. */
function updateSelectionUI() {
  const boardEl = $("#tab-battle .board");
  const dialogEl = $("#sel-dialog");
  if (!boardEl) { renderBattle(); return; }
  $$(".sq.selected, .sq.dest, .sq.dest-capture", boardEl).forEach((el) => {
    el.classList.remove("selected", "dest", "dest-capture");
  });
  if (battleSel) {
    const fromEl = boardEl.querySelector('[data-square="' + battleSel.from + '"]');
    if (fromEl) fromEl.classList.add("selected");
    Object.keys(battleSel.dests || {}).forEach((to) => {
      const el = boardEl.querySelector('[data-square="' + to + '"]');
      if (el) el.classList.add(battleSel.dests[to] === "capture" ? "dest-capture" : "dest");
    });
  }
  if (dialogEl) dialogEl.innerHTML = selectedMovesHTML();
}

function findWarlordSquare(board, color) {
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const c = board[r] && board[r][f];
    if (c && c.role === "warlord" && c.color === color) return sqName(r, f);
  }
  return null;
}

function fieldStripHTML(band, color) {
  return '<div class="field-strip">' + ROLES.map((role) => {
    const hero = heroById(band[role]);
    return '<span class="field-hero">' + miniChipHTML({ role: role, color: color, hero: band[role] }) +
      "<span>" + esc(hero ? hero.name : ROLE_LABEL[role]) + '<span class="role-name">' + esc(ROLE_LABEL[role]) + "</span></span></span>";
  }).join("") + "</div>";
}

function resultHTML(settlement, diffId) {
  const diff = S.difficulties.find((d) => d.id === diffId);
  const title = settlement.result === "win" ? "Victory!" : settlement.result === "loss" ? "Defeat" : "Draw";
  const cls = settlement.result === "win" ? "banner" : settlement.result === "loss" ? "banner danger" : "banner info";
  let cardHtml = "";
  if (settlement.card) {
    const h = settlement.card;
    cardHtml = '<p><strong>New hero won:</strong></p><div style="max-width:280px">' + heroCardHTML(h, ownedMap()[h.id], true) + "</div>";
  }
  return '<div class="' + cls + '" role="status"><div><h2 style="margin:0">' + title + "</h2>" +
    "<p>" + (diff ? "Battle: " + esc(diff.name) + ". " : "") +
    "Gold awarded: <strong>" + settlement.goldAwarded + "</strong>. New balance: <strong>" + settlement.gold + " gold</strong>.</p>" +
    (settlement.result === "win" ? "<p>You won a new hero card!</p>" : "") +
    cardHtml +
    '</div><button class="btn btn-gold" id="back-to-battles">Back to battles</button></div>';
}

async function startMatch(diffId) {
  if (battleBusy) return;
  battleBusy = true;
  try {
    lastSettlement = null; lastResultDiff = null; battleSel = null; lastAiMove = null;
    await api("/api/match/start", { method: "POST", body: JSON.stringify({ difficultyId: diffId }) });
    await refreshState();
    toast("Battle started — good luck!");
  } catch (e) { showError(e); } finally { battleBusy = false; }
}

async function abandonMatch() {
  if (!confirm("Abandon this battle? You lose your entry fee and get no rewards.")) return;
  try {
    await api("/api/match/abandon", { method: "POST", body: JSON.stringify({}) });
    battleSel = null; lastAiMove = null;
    await refreshState();
    toast("Battle abandoned.");
  } catch (e) { showError(e); }
}

async function claimStipend() {
  try {
    const r = await api("/api/stipend/claim", { method: "POST", body: JSON.stringify({}) });
    toast("King's Stipend claimed — +" + (r.gold != null ? "20" : "") + " gold. Balance: " + r.gold + " gold.");
    await refreshState();
  } catch (e) { showError(e); }
}

function wireBattleBoard(m) {
  const boardEl = $("#tab-battle .board");
  if (!boardEl) return;
  boardEl.addEventListener("click", async (ev) => {
    const sqEl = ev.target.closest("[data-square]");
    if (!sqEl || battleBusy) return;
    if (m.turn !== "w" || m.status !== "active") return;
    const sq = sqEl.dataset.square;
    const cell = cellAt(m.board, sq);
    // Click a highlighted destination -> move there.
    if (battleSel && battleSel.dests[sq]) {
      await doBattleMove(battleSel.from, sq, battleSel.dests[sq]);
      return;
    }
    // Click own piece -> select it and show its legal moves (cached: the
    // first selection in a position fetches, later ones do not).
    if (cell && cell.color === "w") {
      if (battleSel && battleSel.from === sq) { battleSel = null; updateSelectionUI(); return; }
      try {
        const allMoves = await getMoves();
        const moves = allMoves.filter((mv) => mv.from === sq);
        const dests = {};
        moves.forEach((mv) => {
          const target = cellAt(m.board, mv.to);
          // En passant lands on an empty square, so the board alone cannot
          // tell it from a quiet move — the SAN carries the capture ("x").
          dests[mv.to] = (target || (mv.san && mv.san.indexOf("x") !== -1)) ? "capture" : "move";
        });
        battleSel = { from: sq, dests: dests, moves: moves };
        if (!Object.keys(dests).length) toast("That hero has no legal moves right now.", true);
        updateSelectionUI();
      } catch (e) { showError(e); }
      return;
    }
    // Click elsewhere -> clear selection.
    if (battleSel) { battleSel = null; updateSelectionUI(); }
  });
}

function cellAt(board, sq) {
  const f = FILES.indexOf(sq[0]);
  const r = parseInt(sq.slice(1), 10) - 1;
  return board && board[r] ? board[r][f] : null;
}

async function doBattleMove(from, to, kind) {
  battleBusy = true;
  try {
    // Promotion? Ask the move list (cached for this position): any move
    // from->to with a promotion means the player must choose the role first.
    const allMoves = await getMoves();
    const options = allMoves.filter((mv) => mv.from === from && mv.to === to);
    let promotion = null;
    if (options.some((mv) => mv.promotion)) {
      promotion = await pickPromotion();
      if (!promotion) return; // cancelled — keep selection
      battleSel = null;
    } else {
      battleSel = null;
    }
    // Castle or plain stride? A range-2 warlord stepping two squares toward
    // its archer is also a castling move, and the server defaults to
    // castling — so ask the player which one they mean when both exist.
    let castle = null;
    if (options.some((mv) => mv.castle) && options.some((mv) => !mv.castle)) {
      castle = await pickCastleOrStride();
      if (castle === null) return; // cancelled — keep selection
      battleSel = null;
    }
    // A new player move clears the previous AI-move highlight.
    lastAiMove = null;
    const body = { from: from, to: to, promotion: promotion };
    if (castle !== null) body.castle = castle;
    const out = await api("/api/match/move", {
      method: "POST",
      body: JSON.stringify(body),
    });
    // No AI reply (the player's own move ended the game): show the final
    // position at once.
    if (!out.aiMove) {
      if (out.gameOver && out.settlement) {
        lastSettlement = out.settlement;
        lastResultDiff = S.activeMatch ? S.activeMatch.difficultyId : lastResultDiff;
        toast(out.settlement.result === "win" ? "Victory! +" + out.settlement.goldAwarded + " gold" :
          out.settlement.result === "draw" ? "Draw — +" + out.settlement.goldAwarded + " gold" : "Defeat. Better luck next time.");
      }
      await refreshState();
      return;
    }
    // 1. Render the board with ONLY the player's move applied, so it lands
    //    instantly and the player sees what they just did.
    const prevMatch = S.activeMatch;
    if (out.boardAfterPlayer && prevMatch) {
      const hist = out.match ? out.match.history.slice(0, -1)
        : [...(prevMatch.history || []), { from: from, to: to }];
      S.activeMatch = {
        ...prevMatch,
        board: out.boardAfterPlayer, turn: "b", status: "active",
        history: hist, check: !!out.checkAfterPlayer,
      };
      renderBattle();
    }
    // 2. A beat while "the enemy is thinking", then slide its chip.
    await sleep(AI_THINK_MS);
    await animateAiMove(out.aiMove, out.boardAfterPlayer);
    // 3. Show the final position (and the result screen if the game ended).
    lastAiMove = { from: out.aiMove.from, to: out.aiMove.to };
    if (out.gameOver && out.settlement) {
      lastSettlement = out.settlement;
      lastResultDiff = prevMatch ? prevMatch.difficultyId : lastResultDiff;
      toast(out.settlement.result === "win" ? "Victory! +" + out.settlement.goldAwarded + " gold" :
        out.settlement.result === "draw" ? "Draw — +" + out.settlement.goldAwarded + " gold" : "Defeat. Better luck next time.");
    }
    await refreshState();
    // An enemy promotion pops as it lands.
    if (out.aiMove.promotion) {
      const sq = document.querySelector('#tab-battle .board [data-square="' + out.aiMove.to + '"] .chip');
      if (sq) sq.classList.add("promo-pop");
    }
  } catch (e) {
    showError(e);
    battleSel = null; lastAiMove = null;
    // Re-sync from the server: the synthetic mid-move board above must not linger.
    try { await refreshState(); } catch (e2) { renderBattle(); }
  } finally { battleBusy = false; }
}

/* Animate the AI's reply on the board that currently shows the position
   after the player's move only (boardBefore). The moving chip is cloned
   and slid from its origin square to its destination; captures fade out,
   castling slides the rook too, teleports blink, and the from/to squares
   stay highlighted. Pure presentation — the position itself is unchanged
   until the caller re-renders the final board. Returns true if the
   animation ran, false if anything was missing (caller just renders). */
async function animateAiMove(aiMove, boardBefore) {
  const boardEl = $("#tab-battle .board");
  if (!boardEl || !boardBefore || !aiMove) return false;
  const fromCell = cellAt(boardBefore, aiMove.from);
  if (!fromCell) return false;
  const fromSq = boardEl.querySelector('[data-square="' + aiMove.from + '"]');
  const toSq = boardEl.querySelector('[data-square="' + aiMove.to + '"]');
  if (!fromSq || !toSq) return false;
  const size = boardEl.clientWidth / 8;
  if (!size) return false;
  const pos = (sq) => {
    const f = FILES.indexOf(sq[0]);
    const r = parseInt(sq.slice(1), 10) - 1;
    return { x: f * size, y: (7 - r) * size };
  };
  const rarityOf = (cell) => {
    const hero = cell && cell.hero ? heroById(cell.hero) : null;
    return hero ? hero.rarity : "common";
  };
  // The live board must still show the staged position (boardBefore). If
  // something re-rendered it mid-animation — e.g. a stipend claim during
  // the think pause — the live board already shows the final position:
  // the origin square is empty and the mover already sits on its
  // destination. Sliding a clone in then would duplicate the piece, so
  // skip the animation and let the caller render the final board.
  const liveFromChip = fromSq.querySelector(".chip");
  if (!liveFromChip || !liveFromChip.classList.contains(fromCell.color)) return false;
  const liveToChip = toSq.querySelector(".chip");
  if (liveToChip && liveToChip.classList.contains(fromCell.color)) return false;
  // Highlight the squares so the eye finds the move even after the slide.
  fromSq.classList.add("ai-from");
  toSq.classList.add("ai-to");
  const toCell = cellAt(boardBefore, aiMove.to);
  // The piece being captured, if any: on the destination square, or — for
  // en passant only — the pawn on the origin rank, destination file.
  // Use the server's explicit enPassant flag. A soldier with Steady Step
  // (diagStep) may also step one square diagonally into an EMPTY square;
  // that is not a capture, and inferring en passant from the geometry
  // would wrongly fade whatever piece sits on the adjacent square.
  let capturedSqEl = null;
  if (toCell && toCell.color === "w") {
    capturedSqEl = toSq;
  } else if (aiMove.enPassant) {
    capturedSqEl = boardEl.querySelector('[data-square="' + aiMove.to[0] + aiMove.from[1] + '"]');
  }
  // Castling: the king slides two files and the rook hops over it.
  let rook = null;
  if (aiMove.castle) {
    const rank = aiMove.from[1];
    const kingside = aiMove.castle === "K";
    const rookFrom = (kingside ? "h" : "a") + rank;
    rook = { from: rookFrom, to: (kingside ? "f" : "d") + rank, cell: cellAt(boardBefore, rookFrom) };
  }
  // Hide the real chips at the origins; the clones will travel instead.
  const fromChip = fromSq.querySelector(".chip");
  if (fromChip) fromChip.classList.add("chip-gone");
  let rookChip = null;
  if (rook && rook.cell) {
    const rookSq = boardEl.querySelector('[data-square="' + rook.from + '"]');
    rookChip = rookSq ? rookSq.querySelector(".chip") : null;
    if (rookChip) rookChip.classList.add("chip-gone");
  }
  const makeClone = (cell, sq) => {
    const p = pos(sq);
    const wrap = document.createElement("span");
    wrap.className = "anim-clone";
    wrap.style.left = p.x + "px";
    wrap.style.top = p.y + "px";
    wrap.style.width = size + "px";
    wrap.style.height = size + "px";
    const chip = document.createElement("span");
    chip.className = "chip " + cell.color + (cell.role === "warlord" ? " warlord" : "");
    chip.style.setProperty("--rarity-color", "var(--rarity-" + rarityOf(cell) + ")");
    chip.innerHTML = silhouette(cell.role);
    wrap.appendChild(chip);
    boardEl.appendChild(wrap);
    return wrap;
  };
  const clone = makeClone(fromCell, aiMove.from);
  const rookClone = (rook && rook.cell) ? makeClone(rook.cell, rook.from) : null;
  if (capturedSqEl) {
    const capChip = capturedSqEl.querySelector(".chip");
    if (capChip) capChip.classList.add("chip-fading");
  }
  // Let the browser lay the clones out at their origins, then move them.
  void clone.offsetWidth;
  if (aiMove.teleport) {
    // Teleports don't slide: the piece blinks out here and back in there.
    clone.classList.add("teleport-out");
    await sleep(180);
    const p = pos(aiMove.to);
    clone.style.transition = "none";
    clone.style.left = p.x + "px";
    clone.style.top = p.y + "px";
    void clone.offsetWidth;
    clone.style.transition = "";
    clone.classList.remove("teleport-out");
    await sleep(240);
  } else {
    const fromP = pos(aiMove.from);
    const toP = pos(aiMove.to);
    clone.style.transform = "translate(" + (toP.x - fromP.x) + "px," + (toP.y - fromP.y) + "px)";
    if (rookClone) {
      const rFrom = pos(rook.from);
      const rTo = pos(rook.to);
      rookClone.style.transform = "translate(" + (rTo.x - rFrom.x) + "px," + (rTo.y - rFrom.y) + "px)";
    }
    await sleep(AI_SLIDE_MS);
  }
  clone.remove();
  if (rookClone) rookClone.remove();
  return true;
}

/* ---------------- Gallery tab ---------------- */
function ownedMap() {
  const map = {};
  (S.collection || []).forEach((c) => { map[c.characterId] = c; });
  return map;
}

function renderGallery() {
  const el = $("#tab-gallery");
  const owned = ownedMap();
  const ownedCount = S.collection.length;
  const perRarity = {};
  RARITY_ORDER.forEach((r) => { perRarity[r] = 0; });
  S.collection.forEach((c) => {
    const h = heroById(c.characterId);
    if (h) perRarity[h.rarity]++;
  });
  const totalPerRarity = {};
  RARITY_ORDER.forEach((r) => { totalPerRarity[r] = S.catalog.filter((h) => h.rarity === r).length; });
  const pct = S.catalog.length ? Math.round((ownedCount / S.catalog.length) * 100) : 0;

  let html = '<div class="panel"><h2>Your Collection</h2>' +
    "<p><strong>" + ownedCount + " / " + S.catalog.length + " heroes collected</strong> (" + pct + "%)</p>" +
    '<div class="progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="rarity-counts">' + RARITY_ORDER.map((r) =>
      '<span class="rarity-count" style="--rarity-color: var(--rarity-' + r + ')">' + RARITY_LABEL[r] + ": " + perRarity[r] + "/" + totalPerRarity[r] + "</span>").join("") +
    "</div>" +
    "<h3 style='margin-top:1rem'>On the field</h3>" +
    fieldStripHTML(S.equipped, "w") +
    '<p class="small muted">Tap an owned card below to equip it into your warband.</p></div>';

  html += '<div class="panel"><div class="filters">' +
    '<span class="filter-group-label">Role:</span>' +
    filterBtn("role", "all", "All") +
    ROLES.map((r) => filterBtn("role", r, ROLE_LABEL[r])).join("") +
    "</div><div class='filters'>" +
    '<span class="filter-group-label">Rarity:</span>' +
    filterBtn("rarity", "all", "All") +
    RARITY_ORDER.map((r) => filterBtn("rarity", r, RARITY_LABEL[r])).join("") +
    "</div>";

  const shown = S.catalog.filter((h) =>
    (galleryRole === "all" || h.role === galleryRole) &&
    (galleryRarity === "all" || h.rarity === galleryRarity));
  html += '<p class="small muted">Showing ' + shown.length + " of " + S.catalog.length + " heroes.</p>" +
    '<div class="card-grid">' + shown.map((h) => heroCardHTML(h, owned[h.id], false)).join("") + "</div></div>";

  el.innerHTML = html;
  $$(".filter-btn", el).forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.kind === "role") galleryRole = b.dataset.value;
    else galleryRarity = b.dataset.value;
    renderGallery();
  }));
  $$(".tcg-card", el).forEach((c) => c.addEventListener("click", () => openHeroDetail(c.dataset.heroId)));
}

function filterBtn(kind, value, label) {
  const active = (kind === "role" ? galleryRole : galleryRarity) === value;
  return '<button class="filter-btn' + (active ? " active" : "") + '" data-kind="' + kind + '" data-value="' + value + '">' + esc(label) + "</button>";
}

/* Hero portrait: the generated anime portrait image when the hero has one
   (heroes.js `portrait` field), falling back to the illustrated monogram
   (rarity gradient + large role icon + initial) when it does not. */
function portraitHTML(hero, big) {
  const cls = "portrait rarity-" + hero.rarity + (big ? " detail-portrait" : "");
  /* Card grids use the small thumbnail (~40KB); only the detail modal loads
     the full portrait (~500KB). 72 full portraits is ~47MB of page weight. */
  const src = (!big && hero.portraitThumb) ? hero.portraitThumb : hero.portrait;
  if (src) {
    return '<div class="' + cls + '" aria-hidden="true"><img src="' + esc(src) + '" alt="" loading="lazy"></div>';
  }
  const initial = (hero.name || "?").trim().charAt(0);
  return '<div class="' + cls + '" aria-hidden="true">' +
    '<span class="portrait-initial">' + esc(initial) + "</span>" +
    '<span class="portrait-icon">' + icon(hero.role) + "</span></div>";
}

function heroCardHTML(hero, ownedEntry, inResult) {
  const isOwned = !!ownedEntry;
  const isEquipped = S.equipped && S.equipped[hero.role] === hero.id;
  const cls = "tcg-card rarity-" + hero.rarity + (isOwned ? "" : " locked");
  return '<button type="button" class="' + cls + '" data-hero-id="' + esc(hero.id) + '">' +
    (isOwned ? "" : '<span class="lock-badge">🔒 Locked</span>') +
    '<div class="card-head"><span class="card-name">' + esc(hero.name) + '</span>' +
    '<span class="rarity-tag">' + RARITY_LABEL[hero.rarity] + "</span></div>" +
    portraitHTML(hero, false) +
    '<div class="card-body">' +
    '<div class="role-line">' + icon(hero.role) + esc(ROLE_LABEL[hero.role]) + "</div>" +
    '<div class="ability">' + esc(hero.ability) + "</div>" +
    '<div class="flavor">“' + esc(hero.flavor) + "”</div>" +
    '<div class="card-foot"><span class="power">⚡ Power ' + hero.power + "</span>" +
    (isOwned
      ? '<span class="owned-tag">Lv ' + ownedEntry.level + " · ×" + ownedEntry.copies + (isEquipped ? ' <span class="equipped-tag">Equipped</span>' : "") + "</span>"
      : '<span class="muted">Not collected</span>') +
    "</div></div></button>";
}

function openHeroDetail(heroId) {
  const hero = heroById(heroId);
  if (!hero) return;
  const ownedEntry = ownedMap()[heroId];
  const isOwned = !!ownedEntry;
  const isEquipped = S.equipped && S.equipped[hero.role] === heroId;
  const root = $("#modal-root");
  root.innerHTML =
    '<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(hero.name) + '">' +
    '<div class="tcg-card rarity-' + hero.rarity + '" style="cursor:default">' +
    '<div class="card-head"><span class="card-name">' + esc(hero.name) + '</span><span class="rarity-tag">' + RARITY_LABEL[hero.rarity] + "</span></div>" +
    portraitHTML(hero, true) +
    '<div class="card-body">' +
    '<div class="role-line">' + icon(hero.role) + esc(ROLE_LABEL[hero.role]) + ' · <span class="power">⚡ Power ' + hero.power + "</span></div>" +
    '<div class="ability">' + esc(hero.ability) + "</div>" +
    '<div class="flavor">“' + esc(hero.flavor) + "”</div>" +
    (isOwned ? "<p><strong>Level " + ownedEntry.level + "</strong> · " + ownedEntry.copies + " " + (ownedEntry.copies === 1 ? "copy" : "copies") + " owned.</p>"
      : "<p><strong>Not collected yet.</strong> Win battles to add this hero to your collection.</p>") +
    "</div></div>" +
    '<div class="modal-actions">' +
    (isOwned && !isEquipped ? '<button class="btn btn-gold" id="equip-hero">Equip to your warband</button>' : "") +
    (isEquipped ? '<span class="ok-text">Equipped in your warband ✓</span>' : "") +
    '<button class="btn btn-ghost" id="close-hero">Close</button>' +
    "</div></div></div>";
  $("#close-hero").addEventListener("click", () => { root.innerHTML = ""; });
  root.querySelector(".modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("modal-backdrop")) root.innerHTML = ""; });
  const eq = $("#equip-hero");
  if (eq) eq.addEventListener("click", async () => {
    try {
      await api("/api/collection/equip", { method: "POST", body: JSON.stringify({ characterId: heroId }) });
      root.innerHTML = "";
      toast(hero.name + " equipped!");
      await refreshState();
    } catch (e) { showError(e); }
  });
}

/* ---------------- Shop tab ---------------- */
function renderShop() {
  const el = $("#tab-shop");
  const cfg = S.shop || { configured: false, env: null, packs: [] };
  let html = '<div class="panel"><h2>Gold Shop</h2>' +
    '<div class="shop-status"><span class="status-dot ' + (cfg.configured ? "on" : "off") + '"></span>' +
    "<strong>" + (cfg.configured ? "Connected to PayPal (" + esc(cfg.env || "") + ")" : "PayPal not connected yet") + "</strong>" +
    '<span class="muted small">Balance: <strong>' + S.gold + ' gold</strong></span></div>' +
    (cfg.configured ? "" : '<p class="muted">Gold packs are disabled until the shop owner connects PayPal below.</p>') +
    '<div class="pack-grid">' + cfg.packs.map((p) => packCardHTML(p, cfg.configured)).join("") + "</div></div>";

  if (pendingOrder) {
    html += '<div class="panel pending-panel"><h2>Payment pending</h2>' +
      "<p>You started buying <strong>" + esc(pendingOrder.packName) + "</strong> (" + esc(pendingOrder.priceLabel) + ").</p>" +
      '<p><a href="' + esc(pendingOrder.approveUrl) + '" target="_blank" rel="noopener">Open PayPal &amp; approve ' + esc(pendingOrder.priceLabel) + "</a> — approve the payment in the PayPal tab, then come back here.</p>" +
      '<p class="small muted">Nothing is charged until you approve on PayPal, and gold is only added after the server verifies the payment.</p>' +
      '<p><button class="btn btn-gold" id="verify-order">I approved it — verify my payment &amp; add my gold</button> ' +
      '<button class="btn btn-ghost" id="cancel-order">Cancel</button></p>' +
      '<p id="pending-msg" class="small"></p></div>';
  }

  html += '<div class="panel"><h2>Store Owner Setup</h2>' +
    '<p class="muted small">Only the store owner can connect PayPal. Your Client ID and Secret are stored on the server — they are never shown back to the browser.</p>' +
    '<div class="shop-status"><span class="status-dot ' + (cfg.configured ? "on" : "off") + '"></span>' +
    "<span>" + (cfg.configured ? "PayPal connected — environment: <strong>" + esc(cfg.env || "?") + "</strong>" : "Not connected") + "</span></div>" +
    '<div class="form-grid">' +
    '<div><label for="pp-client">PayPal Client ID</label><input id="pp-client" type="text" autocomplete="off" placeholder="Client ID"></div>' +
    '<div><label for="pp-secret">PayPal Secret</label><input id="pp-secret" type="password" autocomplete="off" placeholder="Secret"></div>' +
    '<div><label for="pp-env">Environment</label><select id="pp-env"><option value="sandbox">Sandbox (test)</option><option value="live">Live (real money)</option></select></div>' +
    '<div><label for="pp-token">Owner token</label><input id="pp-token" type="password" autocomplete="off" placeholder="Owner setup token"></div>' +
    "</div>" +
    '<p style="margin-top:.9rem"><button class="btn" id="save-shop-config">Save PayPal setup</button> ' +
    (cfg.configured ? '<button class="btn btn-danger" id="remove-shop-config">Remove / Disconnect PayPal</button>' : "") + "</p>" +
    '<p id="shop-config-msg" class="small"></p>' +
    '<p class="small muted">If in-app setup is disabled on this server, configure PayPal with environment variables on the server instead (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).</p>' +
    "</div>";

  el.innerHTML = html;

  $$(".pack-buy", el).forEach((b) => b.addEventListener("click", () => buyPack(b.dataset.pack)));
  const verify = $("#verify-order");
  if (verify) verify.addEventListener("click", verifyOrder);
  const cancel = $("#cancel-order");
  if (cancel) cancel.addEventListener("click", () => { pendingOrder = null; localStorage.removeItem("fc_pending_order"); renderShop(); });
  const save = $("#save-shop-config");
  if (save) save.addEventListener("click", saveShopConfig);
  const remove = $("#remove-shop-config");
  if (remove) remove.addEventListener("click", removeShopConfig);
  if (shopConfig && shopConfig.env) { const sel = $("#pp-env"); if (sel) sel.value = shopConfig.env; }
}

function packCardHTML(p, configured) {
  return '<div class="pack-card tier-' + esc(p.id) + '">' +
    (p.badge ? '<span class="pack-badge">' + esc(p.badge) + "</span>" : "") +
    '<div class="pack-art"><img src="pack-' + esc(p.id) + '.webp" alt="" loading="lazy"></div>' +
    "<h3>" + esc(p.name) + "</h3>" +
    '<div class="pack-gold">🪙 ' + p.gold + " gold</div>" +
    '<div class="pack-price">' + esc(p.priceLabel) + "</div>" +
    '<div class="pack-tagline">' + esc(p.tagline || "") + "</div>" +
    '<button class="btn btn-gold pack-buy" data-pack="' + esc(p.id) + '" ' + (configured ? "" : "disabled") + ">" +
    (configured ? "Buy — " + esc(p.priceLabel) : "PayPal not connected") + "</button>" +
    "</div>";
}

async function buyPack(packId) {
  try {
    const pack = (S.shop.packs || []).find((p) => p.id === packId);
    const r = await api("/api/shop/create-order", { method: "POST", body: JSON.stringify({ packId: packId }) });
    pendingOrder = { orderId: r.orderId, approveUrl: r.approveUrl, packId: packId, packName: pack ? pack.name : packId, priceLabel: pack ? pack.priceLabel : "" };
    localStorage.setItem("fc_pending_order", JSON.stringify(pendingOrder));
    window.open(r.approveUrl, "_blank", "noopener");
    renderShop();
    toast("PayPal opened in a new tab — approve there, then press verify.");
  } catch (e) { showError(e); }
}

async function verifyOrder() {
  if (!pendingOrder) return;
  const msg = $("#pending-msg");
  try {
    const r = await api("/api/shop/complete-order", { method: "POST", body: JSON.stringify({ orderId: pendingOrder.orderId }) });
    pendingOrder = null;
    localStorage.removeItem("fc_pending_order");
    toast("Payment verified! +" + r.credited + " gold — new balance: " + r.gold + " gold.");
    await refreshState();
  } catch (e) {
    if (msg) { msg.textContent = e.message || "Not approved yet."; msg.className = "small error-text"; }
    showError(e);
  }
}

async function saveShopConfig() {
  const msg = $("#shop-config-msg");
  const body = {
    clientId: $("#pp-client").value.trim(),
    secret: $("#pp-secret").value,
    env: $("#pp-env").value,
    ownerToken: $("#pp-token").value,
  };
  try {
    const r = await api("/api/shop/config", { method: "POST", body: JSON.stringify(body) });
    if (msg) { msg.textContent = "PayPal connected (" + r.env + "). The shop is now live for buyers."; msg.className = "small ok-text"; }
    $("#pp-secret").value = ""; $("#pp-token").value = "";
    await refreshState();
  } catch (e) {
    if (e.code === "setup_disabled" || e.status === 409) {
      if (msg) { msg.textContent = "In-app setup is disabled — configure PayPal with environment variables on the server."; msg.className = "small error-text"; }
    } else if (msg) { msg.textContent = e.message; msg.className = "small error-text"; }
    showError(e);
  }
}

async function removeShopConfig() {
  const token = $("#pp-token").value;
  if (!token) { toast("Enter your owner token to disconnect PayPal.", true); return; }
  if (!confirm("Disconnect PayPal from the shop? Buyers will not be able to buy gold until it is reconnected.")) return;
  try {
    await api("/api/shop/remove-config", { method: "POST", body: JSON.stringify({ ownerToken: token }) });
    toast("PayPal disconnected.");
    await refreshState();
  } catch (e) { showError(e); }
}

/* ---------------- Training tab ---------------- */
function renderTraining() {
  const el = $("#tab-training");
  if (training) { renderTrainingSession(el); return; }
  const lessons = S.lessons || [];
  let html = '<div class="panel"><h2>Training Grounds</h2>' +
    '<p>Coach Pell the Drillmaster teaches you how to play — free, always. Training never costs gold and never touches your battle record.</p>' +
    '<p><strong>Your team score: ' + (S.teamScore || 0) + "</strong> <span class='muted small'>(rarity points from your equipped heroes, +1 per Lv 3+ hero — rarer, stronger teams unlock advanced lessons)</span></p></div>" +
    '<div class="lesson-list">' +
    lessons.map((l) => {
      const locked = !l.unlocked;
      return '<div class="lesson-row' + (locked ? " locked" : "") + '">' +
        '<div style="display:flex;gap:1rem;align-items:center"><span class="lesson-num">' + (locked ? "🔒" : l.id) + "</span>" +
        "<div><h3>" + esc(l.title) + "</h3><p>" + esc(l.text || "") + "</p>" +
        (locked ? '<p class="error-text">Locked — requires team score ' + l.minScore + " (yours: " + (S.teamScore || 0) + ")</p>" : "") +
        "</div></div>" +
        '<button class="btn lesson-start" data-lesson="' + l.id + '" ' + (locked ? "disabled" : "") + ">Start lesson</button>" +
        "</div>";
    }).join("") + "</div>";
  el.innerHTML = html;
  $$(".lesson-start", el).forEach((b) => b.addEventListener("click", () => startLesson(parseInt(b.dataset.lesson, 10))));
}

async function startLesson(lessonId) {
  try {
    const r = await api("/api/training/start", { method: "POST", body: JSON.stringify({ lessonId: lessonId }) });
    const lesson = (S.lessons || []).find((l) => l.id === lessonId);
    training = {
      sessionId: r.sessionId, lessonId: r.lessonId, lessonTitle: r.lessonTitle,
      step: r.step, stepsTotal: r.stepsTotal, instruction: r.instruction,
      board: r.board, intro: lesson ? lesson.text : "",
      feedback: null, feedbackGood: null, done: false,
    };
    trainingSel = null;
    renderTraining();
  } catch (e) { showError(e); }
}

function renderTrainingSession(el) {
  const t = training;
  let html = '<div class="panel"><h2>' + esc(t.lessonTitle) + "</h2>" +
    '<div class="coach-line"><span class="coach-avatar">' + icon("wizard") + "</span><div>" +
    "<p><strong>Coach Pell:</strong> " + esc(t.intro || "") + "</p></div></div>" +
    '<p class="step-progress">Step ' + (t.step + 1) + " of " + t.stepsTotal + "</p>" +
    '<p><strong>Your task:</strong> ' + esc(t.instruction || "") + "</p>";
  if (t.feedback) {
    html += '<div class="feedback ' + (t.feedbackGood ? "good" : "bad") + '">' + esc(t.feedback) + "</div>";
  }
  html += '<div class="match-wrap"><div class="board-col">' +
    boardHTML(t.board, { playable: !t.done, selectedFrom: trainingSel ? trainingSel.from : null }) +
    '<p class="small muted" style="text-align:center">Tap one of your ivory heroes, then tap where it should go.</p>' +
    "</div><div class='side-col'>" +
    (t.done
      ? '<div class="banner"><p><strong>Lesson complete!</strong> Well played — Coach Pell is proud.</p></div><p><button class="btn btn-gold" id="training-done">Back to lessons</button></p>'
      : '<p class="muted">Training is free and never touches your gold or battle record.</p><p><button class="btn btn-ghost" id="training-quit">Leave lesson</button></p>') +
    "</div></div></div>";
  el.innerHTML = html;
  const done = $("#training-done");
  if (done) done.addEventListener("click", () => { training = null; trainingSel = null; renderTraining(); });
  const quit = $("#training-quit");
  if (quit) quit.addEventListener("click", () => { training = null; trainingSel = null; renderTraining(); });
  const boardEl = $("#tab-training .board");
  if (boardEl && !t.done) {
    boardEl.addEventListener("click", async (ev) => {
      const sqEl = ev.target.closest("[data-square]");
      if (!sqEl) return;
      const sq = sqEl.dataset.square;
      const cell = cellAt(t.board, sq);
      if (trainingSel && trainingSel.from !== sq) {
        await doTrainingMove(trainingSel.from, sq);
        return;
      }
      if (cell && cell.color === "w") {
        trainingSel = (trainingSel && trainingSel.from === sq) ? null : { from: sq };
        renderTraining();
        return;
      }
      if (trainingSel) { trainingSel = null; renderTraining(); }
    });
  }
}

async function doTrainingMove(from, to) {
  const t = training;
  try {
    let promotion = null;
    const cell = cellAt(t.board, from);
    if (cell && cell.role === "soldier" && to[1] === "8") {
      promotion = await pickPromotion();
      if (!promotion) return;
    }
    trainingSel = null;
    const r = await api("/api/training/move", {
      method: "POST",
      body: JSON.stringify({ sessionId: t.sessionId, from: from, to: to, promotion: promotion }),
    });
    t.feedback = r.message || (r.correct ? "Correct!" : "Not quite — try again.");
    t.feedbackGood = !!r.correct;
    if (r.board) t.board = r.board;
    if (r.done) {
      t.done = true;
    } else if (r.correct && r.instruction) {
      t.step = r.step; t.stepsTotal = r.stepsTotal; t.instruction = r.instruction;
    }
    renderTraining();
  } catch (e) { showError(e); }
}

/* ---------------- Guide tab ---------------- */
function renderGuide() {
  const el = $("#tab-guide");
  const econRows = S.difficulties.map((d) =>
    "<tr><td><strong>" + esc(d.name) + "</strong><br><span class='muted small'>vs " + esc(d.opponent) + "</span></td>" +
    '<td class="econ-gold">' + d.cost + "</td>" +
    '<td class="econ-gold">' + d.winGold + "</td>" +
    '<td class="econ-gold">' + d.drawGold + "</td>" +
    "<td>" + esc(d.rewardNote || "") + "</td></tr>").join("");
  el.innerHTML =
    '<div class="panel"><h2>How to play</h2>' +
    "<p>Fantasy Chess is chess — same board, same check and checkmate — but every piece is a fantasy hero with its own ability. Your warband's heroes decide how each piece moves.</p>" +
    '<table class="guide-table"><thead><tr><th>Hero</th><th>Fights like</th><th>How it moves</th></tr></thead><tbody>' +
    "<tr><td><span class='role-icon-inline'>" + icon("soldier") + "</span> <strong>Soldier</strong></td><td>Pawn</td><td>Marches forward one square (two on its first move), captures diagonally. Your soldier hero's ability may add diagonal steps, straight captures, or longer marches.</td></tr>" +
    "<tr><td><span class='role-icon-inline'>" + icon("archer") + "</span> <strong>Archer</strong></td><td>Rook</td><td>Slides along ranks and files. Archer abilities may add diagonal shots, leaps, or shooting past friendly pieces.</td></tr>" +
    "<tr><td><span class='role-icon-inline'>" + icon("wizard") + "</span> <strong>Wizard</strong></td><td>Bishop</td><td>Glides along diagonals. Wizard abilities may add orthogonal steps, knight-leaps, or even teleporting.</td></tr>" +
    "<tr><td><span class='role-icon-inline'>" + icon("knight") + "</span> <strong>Knight</strong></td><td>Knight</td><td>Leaps in an L, jumping over everything. Knight abilities add longer leaps and extra steps.</td></tr>" +
    "<tr><td><span class='role-icon-inline'>" + icon("witch") + "</span> <strong>Witch</strong></td><td>Queen</td><td>Sweeps along ranks, files and diagonals. Witch abilities add leaps and sliding past pieces — and some can teleport.</td></tr>" +
    "<tr><td><span class='role-icon-inline'>" + icon("warlord") + "</span> <strong>Warlord</strong></td><td>King</td><td>Moves one square in any direction — but warlord heroes stride two or three squares, and some castle through attacked squares or after moving.</td></tr>" +
    "</tbody></table>" +
    "<h3>Abilities</h3><p>Every hero card shows its ability. Abilities are enforced by the game itself — in legal moves, check, checkmate and castling — for both you and the enemy. Read your equipped heroes' cards in the Gallery before a hard battle.</p>" +
    "<h3>Check &amp; checkmate</h3><p>Check means your warlord is under attack: you must move it, capture the attacker, or block the line. Checkmate is check with no answer — and that ends the battle. A battle with no legal moves and no check is stalemate: a draw.</p>" +
    "<h3>Castling</h3><p>When your warlord and an archer have never moved and the squares between them are clear (and the warlord is not in check, passing through check, or landing in check), you can castle: the warlord moves two squares toward the archer and the archer hops over it. Some warlords castle through attacked squares or even after moving — check your warlord's gift.</p>" +
    "<h3>Promotion</h3><p>March a soldier to the far rank and it promotes — choose an Archer, Wizard, Knight or Witch. A promoted soldier fights as its new role for the rest of the battle.</p>" +
    "<h3>En passant</h3><p>If an enemy soldier marches two squares forward and lands beside yours, you may capture it on the very next move as if it had only marched one square — your soldier moves diagonally onto the square it skipped.</p>" +
    "</div>" +
    '<div class="panel"><h2>Economy</h2>' +
    '<table class="guide-table"><thead><tr><th>Battle</th><th>Entry</th><th>Win</th><th>Draw</th><th>Reward card</th></tr></thead><tbody>' + econRows + "</tbody></table>" +
    "<p>New players start with <strong>100 gold</strong>. A win pays the full win amount and a new hero card; a draw refunds part of the entry fee; a loss pays nothing.</p>" +
    "<h3>King's Stipend</h3><p>If your gold ever falls below " + S.stipend.threshold + ", you can claim <strong>" + S.stipend.amount + " free gold once a day</strong> from the Battle tab — so you are never stuck with no way back.</p>" +
    "<h3>How the Shop works</h3><p>Buy gold packs with real money through PayPal. The shop opens PayPal in a full browser tab — you approve there, then press the verify button here and the server checks the payment with PayPal before crediting your gold. No gold is ever added without a verified PayPal capture, and each payment can only credit once.</p>" +
    "</div>" +
    '<div class="panel"><h2>Your progress</h2>' +
    "<p>Your profile is identified by a cookie in this browser — no account or password. Clearing cookies or switching browsers starts a fresh profile (100 gold, 6 starter heroes).</p>" +
    '<p><button class="btn btn-danger" id="reset-progress">Reset progress</button></p>' +
    '<p class="small muted">Reset wipes your gold, battle record, collection and matches, and restores the fresh start. This cannot be undone.</p>' +
    "</div>";
  $("#reset-progress").addEventListener("click", async () => {
    if (!confirm("Reset ALL progress? Gold, record, collection and matches will be wiped and you will start over with 100 gold and the 6 starter heroes.")) return;
    try {
      await api("/api/profile/reset", { method: "POST", body: JSON.stringify({}) });
      lastSettlement = null; lastResultDiff = null; training = null; trainingSel = null; battleSel = null; lastAiMove = null;
      pendingOrder = null; localStorage.removeItem("fc_pending_order");
      await refreshState();
      toast("Progress reset — fresh start!");
    } catch (e) { showError(e); }
  });
}

/* ---------------- boot ---------------- */
$$(".tab-btn").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

(async function init() {
  // If PayPal sent the buyer back after approving, land on the Shop tab.
  const params = new URLSearchParams(location.search);
  if (params.get("shop") === "return" || params.get("shop") === "cancel") {
    currentTab = "shop";
    $$(".tab-btn").forEach((b) => {
      const on = b.dataset.tab === "shop";
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-shop"));
  }
  try {
    await refreshState();
    try { shopConfig = await api("/api/shop/config"); } catch (e) { /* status already in /api/state */ }
    if (pendingOrder && currentTab === "shop") {
      toast("You have a pending PayPal payment — approve it in the PayPal tab, then press verify.");
    }
  } catch (e) {
    ["battle", "gallery", "shop", "training", "guide"].forEach((t) => {
      $("#tab-" + t).innerHTML = '<div class="panel"><h2>Couldn\'t reach the game server</h2>' +
        "<p>" + esc(e.message || "The server did not answer.") + "</p>" +
        '<p class="muted">Check that the server is running, then <button class="btn btn-small" onclick="location.reload()">reload</button>.</p></div>';
    });
    showError(e);
  }
})();
