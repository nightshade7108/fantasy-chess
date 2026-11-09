// Fantasy Chess — chess engine with hero abilities.
// Roles map to base chess pieces: soldier=pawn, archer=rook, wizard=bishop,
// knight=knight, witch=queen, warlord=king. Each side fields the standard
// 16-piece starting position; every piece of a role uses that side's equipped
// hero of the role, whose ability (fx flags in server/data/heroes.js)
// modifies how the piece moves. Abilities are enforced in legal moves,
// check/checkmate/stalemate and castling, for both sides.

const { heroById } = require("./data/heroes");

const DIRS_ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS_DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIRS_ALL = [...DIRS_ORTHO, ...DIRS_DIAG];
const KNIGHT_JUMPS = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];

const PROMO_ROLES = ["archer", "wizard", "knight", "witch"];
const ROLE_LETTER = { soldier: "", archer: "R", wizard: "B", knight: "N", witch: "Q", warlord: "K" };

function idx(r, f) { return r * 8 + f; }
function inBoard(r, f) { return r >= 0 && r < 8 && f >= 0 && f < 8; }
function toAlgebraic(sq) { return "abcdefgh"[sq.f] + (sq.r + 1); }
function fromAlgebraic(s) {
  return { f: "abcdefgh".indexOf(s[0]), r: parseInt(s[1], 10) - 1 };
}
function other(color) { return color === "w" ? "b" : "w"; }

function fxOf(state, color, role) {
  const heroes = color === "w" ? state.heroesW : state.heroesB;
  const hero = heroById(heroes[role]);
  return (hero && hero.fx) || {};
}

function createGame(playerHeroes, enemyHeroes) {
  const board = new Array(64).fill(null);
  const backRank = ["archer", "knight", "wizard", "witch", "warlord", "wizard", "knight", "archer"];
  for (let f = 0; f < 8; f++) {
    board[idx(0, f)] = { role: backRank[f], color: "w", hero: playerHeroes[backRank[f]], moved: false };
    board[idx(1, f)] = { role: "soldier", color: "w", hero: playerHeroes.soldier, moved: false };
    board[idx(6, f)] = { role: "soldier", color: "b", hero: enemyHeroes.soldier, moved: false };
    board[idx(7, f)] = { role: backRank[f], color: "b", hero: enemyHeroes[backRank[f]], moved: false };
  }
  const state = {
    board, turn: "w",
    castling: { wk: true, wq: true, bk: true, bq: true },
    ep: null, halfmove: 0, fullmove: 1,
    heroesW: { ...playerHeroes }, heroesB: { ...enemyHeroes },
    keys: [],
  };
  state.keys.push(positionKey(state));
  return state;
}

function positionKey(state) {
  let s = state.turn;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    s += p ? `/${p.color}${p.role[0]}${i}` : "";
  }
  s += `|${state.castling.wk ? 1 : 0}${state.castling.wq ? 1 : 0}${state.castling.bk ? 1 : 0}${state.castling.bq ? 1 : 0}`;
  s += `|${state.ep === null ? "-" : state.ep}`;
  return s;
}

function findWarlord(state, color) {
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p && p.role === "warlord" && p.color === color) return { r: Math.floor(i / 8), f: i % 8 };
  }
  return null;
}

// ---- Sliding with pass-through rules ----
// Walk one ray from `from` along `dir`. Calls visit(sq, piece, skipped)
// for every square until blocked. A piece that can be skipped is reported
// with skipped=true (an enemy there may still be captured) and the ray
// continues past it; after one skip, the next piece blocks the ray.
function walkRay(state, from, dir, pass, visit) {
  let r = from.r + dir[0];
  let f = from.f + dir[1];
  let skipped = false;
  const moverColor = state.board[idx(from.r, from.f)].color;
  while (inBoard(r, f)) {
    const p = state.board[idx(r, f)];
    if (!p) { visit({ r, f }, null, false); r += dir[0]; f += dir[1]; continue; }
    const canSkip = !skipped && (pass.any || (pass.friendly && p.color === moverColor));
    if (canSkip) {
      visit({ r, f }, p, true);
      skipped = true;
      r += dir[0]; f += dir[1];
      continue;
    }
    visit({ r, f }, p, false);
    return;
  }
}

// Generate sliding moves along `dirs` with optional pass rules and a
// maximum distance (Infinity = to the edge). `pass` applies to these rays.
function genSlides(moves, state, from, piece, dirs, pass, maxDist) {
  const limit = maxDist === undefined ? 7 : maxDist;
  for (const dir of dirs) {
    let dist = 0;
    walkRay(state, from, dir, pass, (sq, target, wasSkipped) => {
      dist++;
      if (dist > limit) return;
      if (!target) {
        moves.push(makeMove(state, from, sq, null));
        return;
      }
      // A skipped enemy may still be captured; the ray continues past it.
      if (target.color !== piece.color) moves.push(makeMove(state, from, sq, target));
    });
  }
}

// Generate jump/step moves to fixed offsets. `captureOnly` restricts to
// captures; `emptyOnly` restricts to empty squares.
function genJumps(moves, state, from, piece, offsets, opts = {}) {
  for (const [dr, df] of offsets) {
    const r = from.r + dr;
    const f = from.f + df;
    if (!inBoard(r, f)) continue;
    const target = state.board[idx(r, f)];
    if (!target) {
      if (!opts.captureOnly) moves.push(makeMove(state, from, { r, f }, null));
    } else if (target.color !== piece.color) {
      if (!opts.emptyOnly) moves.push(makeMove(state, from, { r, f }, target));
    }
  }
}

function makeMove(state, from, to, captured, extra = {}) {
  const piece = state.board[idx(from.r, from.f)];
  return {
    from: { ...from }, to: { ...to },
    piece: piece.role, color: piece.color,
    captured: captured ? captured.role : null,
    capturedHero: captured ? captured.hero : null,
    promotion: null, castle: null, enPassant: false, double: false, teleport: false,
    san: null, ...extra,
  };
}

// Soldier moves for the piece at `from`.
function genSoldier(moves, state, from, piece, fx) {
  const dir = piece.color === "w" ? 1 : -1;
  const startRank = piece.color === "w" ? 1 : 6;
  const lastRank = piece.color === "w" ? 7 : 0;
  const one = { r: from.r + dir, f: from.f };
  const two = { r: from.r + 2 * dir, f: from.f };

  function pushSoldierMove(to, captured, extra = {}) {
    if (to.r === lastRank) {
      for (const promo of PROMO_ROLES) {
        moves.push(makeMove(state, from, to, captured, { ...extra, promotion: promo }));
      }
    } else {
      moves.push(makeMove(state, from, to, captured, extra));
    }
  }

  // Forward step.
  if (inBoard(one.r, one.f) && !state.board[idx(one.r, one.f)]) {
    pushSoldierMove(one, null);
    // Two-square march: from the start rank, or from any rank with march2.
    const canDouble = from.r === startRank || fx.march2;
    if (canDouble && inBoard(two.r, two.f) && !state.board[idx(two.r, two.f)]) {
      pushSoldierMove(two, null, { double: true });
    }
  }
  // Diagonal captures.
  for (const df of [-1, 1]) {
    const sq = { r: from.r + dir, f: from.f + df };
    if (!inBoard(sq.r, sq.f)) continue;
    const target = state.board[idx(sq.r, sq.f)];
    if (target && target.color !== piece.color) pushSoldierMove(sq, target);
    // En passant. (An e.p. capture can never land on the last rank, so it
    // can never promote — but route it through pushSoldierMove anyway so a
    // promotion would be generated if that ever became reachable.)
    if (state.ep !== null && idx(sq.r, sq.f) === state.ep) {
      const victim = state.board[idx(from.r, sq.f)];
      if (victim && victim.role === "soldier" && victim.color !== piece.color) {
        pushSoldierMove(sq, victim, { enPassant: true });
      }
    }
    // Diagonal step into an empty square (empty only; never the ep square,
    // where the diagonal move is the en passant capture instead).
    if (fx.diagStep && !target && !(state.ep !== null && idx(sq.r, sq.f) === state.ep)) {
      pushSoldierMove(sq, null);
    }
    // Capture two squares diagonally forward.
    if (fx.cap2Diag) {
      const sq2 = { r: from.r + 2 * dir, f: from.f + 2 * df };
      if (inBoard(sq2.r, sq2.f)) {
        const t2 = state.board[idx(sq2.r, sq2.f)];
        if (t2 && t2.color !== piece.color) pushSoldierMove(sq2, t2);
      }
    }
  }
  // Capture straight ahead.
  if (fx.capStraight && inBoard(one.r, one.f)) {
    const target = state.board[idx(one.r, one.f)];
    if (target && target.color !== piece.color) pushSoldierMove(one, target);
  }
  // Step straight backward into an empty square (promotes if it reaches
  // the last rank, e.g. a black soldier stepping back onto rank 1).
  if (fx.stepBack) {
    const back = { r: from.r - dir, f: from.f };
    if (inBoard(back.r, back.f) && !state.board[idx(back.r, back.f)]) {
      pushSoldierMove(back, null);
    }
  }
}

// Pseudo-legal moves for one piece (before the own-warlord-in-check filter).
// Castling is NOT generated here; see genCastling.
function genPieceMoves(moves, state, from, piece) {
  const fx = fxOf(state, piece.color, piece.role);
  switch (piece.role) {
    case "soldier":
      genSoldier(moves, state, from, piece, fx);
      break;
    case "archer": {
      const pass = { friendly: !!fx.passFriendly, any: !!fx.leapOne };
      genSlides(moves, state, from, piece, DIRS_ORTHO, pass);
      if (fx.diagStep) genJumps(moves, state, from, piece, DIRS_DIAG);
      if (fx.diagSlide) genSlides(moves, state, from, piece, DIRS_DIAG, { friendly: false, any: false }, fx.diagSlide);
      if (fx.leap2Ortho) genJumps(moves, state, from, piece, [[2, 0], [-2, 0], [0, 2], [0, -2]]);
      break;
    }
    case "wizard": {
      const pass = { friendly: !!fx.passFriendly, any: !!fx.passOne };
      genSlides(moves, state, from, piece, DIRS_DIAG, pass);
      if (fx.orthoStep) genJumps(moves, state, from, piece, DIRS_ORTHO);
      if (fx.orthoGlide) genSlides(moves, state, from, piece, DIRS_ORTHO, { friendly: false, any: false }, fx.orthoGlide);
      if (fx.knightLeap) genJumps(moves, state, from, piece, KNIGHT_JUMPS);
      if (fx.teleport) genTeleports(moves, state, from, piece);
      break;
    }
    case "knight": {
      genJumps(moves, state, from, piece, KNIGHT_JUMPS);
      if (fx.leap2Ortho) genJumps(moves, state, from, piece, [[2, 0], [-2, 0], [0, 2], [0, -2]]);
      if (fx.leap3Ortho) genJumps(moves, state, from, piece, [[3, 0], [-3, 0], [0, 3], [0, -3]]);
      if (fx.diagStep) genJumps(moves, state, from, piece, DIRS_DIAG);
      if (fx.orthoStep) genJumps(moves, state, from, piece, DIRS_ORTHO);
      if (fx.leap31) genJumps(moves, state, from, piece, [[3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]]);
      if (fx.leap32) genJumps(moves, state, from, piece, [[3, 2], [3, -2], [-3, 2], [-3, -2], [2, 3], [2, -3], [-2, 3], [-2, -3]]);
      if (fx.leap2Diag) genJumps(moves, state, from, piece, [[2, 2], [2, -2], [-2, 2], [-2, -2]]);
      if (fx.leap3Diag) genJumps(moves, state, from, piece, [[3, 3], [3, -3], [-3, 3], [-3, -3]]);
      break;
    }
    case "witch": {
      const pass = { friendly: !!fx.passFriendly, any: !!fx.passOne };
      genSlides(moves, state, from, piece, DIRS_ALL, pass);
      if (fx.leap2Any) genJumps(moves, state, from, piece, [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]]);
      if (fx.leap2Ortho) genJumps(moves, state, from, piece, [[2, 0], [-2, 0], [0, 2], [0, -2]]);
      if (fx.leap2Diag) genJumps(moves, state, from, piece, [[2, 2], [2, -2], [-2, 2], [-2, -2]]);
      if (fx.knightLeap) genJumps(moves, state, from, piece, KNIGHT_JUMPS);
      if (fx.leap31) genJumps(moves, state, from, piece, [[3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]]);
      if (fx.teleport) genTeleports(moves, state, from, piece);
      break;
    }
    case "warlord": {
      const range = fx.range || 1;
      genSlides(moves, state, from, piece, DIRS_ALL, { friendly: false, any: false }, range);
      break;
    }
    default:
      break;
  }
}

// Teleport: every empty square of the same colour. Never captures, so it
// can never give check — the attack detector ignores teleport moves.
function genTeleports(moves, state, from, piece) {
  const parity = (from.r + from.f) % 2;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      if ((r + f) % 2 !== parity) continue;
      if (r === from.r && f === from.f) continue;
      if (state.board[idx(r, f)]) continue;
      moves.push(makeMove(state, from, { r, f }, null, { teleport: true }));
    }
  }
}

function genPseudoMoves(state, color) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (!piece || piece.color !== color) continue;
    genPieceMoves(moves, state, { r: Math.floor(i / 8), f: i % 8 }, piece);
  }
  return moves;
}

module.exports = {
  DIRS_ORTHO, DIRS_DIAG, DIRS_ALL, KNIGHT_JUMPS, PROMO_ROLES,
  idx, inBoard, toAlgebraic, fromAlgebraic, other,
  createGame, positionKey, findWarlord, fxOf,
  genPseudoMoves, genPieceMoves, makeMove,
};

// ---- Attack detection ----
// Is `target` reachable as a capture by the piece at `from` along `dir`,
// honouring the slide's pass-through rules? `maxDist` caps the ray.
// The target must lie exactly on the ray (target == from + dir * dist).
function rayAttacks(state, from, target, dir, pass, maxDist) {
  const dr = target.r - from.r;
  const df = target.f - from.f;
  const dist = Math.max(Math.abs(dr), Math.abs(df));
  if (dist === 0 || dist > maxDist) return false;
  if (dr !== dir[0] * dist || df !== dir[1] * dist) return false;
  const mover = state.board[idx(from.r, from.f)];
  let skipped = false;
  for (let d = 1; d < dist; d++) {
    const p = state.board[idx(from.r + dir[0] * d, from.f + dir[1] * d)];
    if (!p) continue;
    if (!skipped && (pass.any || (pass.friendly && p.color === mover.color))) {
      skipped = true;
      continue;
    }
    return false;
  }
  return true;
}

function leapAttacks(from, target, offsets) {
  return offsets.some(([dr, df]) => from.r + dr === target.r && from.f + df === target.f);
}

const LEAP31 = [[3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [1, -3], [-1, 3], [-1, -3]];
const LEAP32 = [[3, 2], [3, -2], [-3, 2], [-3, -2], [2, 3], [2, -3], [-2, 3], [-2, -3]];

// Does the piece at `from` attack `target`? Teleport never attacks.
function pieceAttacksSquare(state, from, piece, target) {
  const fx = fxOf(state, piece.color, piece.role);
  switch (piece.role) {
    case "soldier": {
      const dir = piece.color === "w" ? 1 : -1;
      if (target.r === from.r + dir && Math.abs(target.f - from.f) === 1) return true;
      if (fx.capStraight && target.r === from.r + dir && target.f === from.f) return true;
      if (fx.cap2Diag && target.r === from.r + 2 * dir && Math.abs(target.f - from.f) === 2) return true;
      // En passant: the soldier attacks the ep square from the side.
      if (state.ep !== null && idx(target.r, target.f) === state.ep &&
          target.r === from.r + dir && Math.abs(target.f - from.f) === 1) return true;
      return false;
    }
    case "archer": {
      const pass = { friendly: !!fx.passFriendly, any: !!fx.leapOne };
      if (DIRS_ORTHO.some((d) => rayAttacks(state, from, target, d, pass, 7))) return true;
      if (fx.diagStep && Math.abs(target.r - from.r) === 1 && Math.abs(target.f - from.f) === 1) return true;
      if (fx.diagSlide && DIRS_DIAG.some((d) => rayAttacks(state, from, target, d, { friendly: false, any: false }, fx.diagSlide))) return true;
      if (fx.leap2Ortho && leapAttacks(from, target, [[2, 0], [-2, 0], [0, 2], [0, -2]])) return true;
      return false;
    }
    case "wizard": {
      const pass = { friendly: !!fx.passFriendly, any: !!fx.passOne };
      if (DIRS_DIAG.some((d) => rayAttacks(state, from, target, d, pass, 7))) return true;
      if (fx.orthoStep && ((Math.abs(target.r - from.r) === 1 && target.f === from.f) || (Math.abs(target.f - from.f) === 1 && target.r === from.r))) return true;
      if (fx.orthoGlide && DIRS_ORTHO.some((d) => rayAttacks(state, from, target, d, { friendly: false, any: false }, fx.orthoGlide))) return true;
      if (fx.knightLeap && leapAttacks(from, target, KNIGHT_JUMPS)) return true;
      return false;
    }
    case "knight": {
      if (leapAttacks(from, target, KNIGHT_JUMPS)) return true;
      if (fx.leap2Ortho && leapAttacks(from, target, [[2, 0], [-2, 0], [0, 2], [0, -2]])) return true;
      if (fx.leap3Ortho && leapAttacks(from, target, [[3, 0], [-3, 0], [0, 3], [0, -3]])) return true;
      if (fx.diagStep && Math.abs(target.r - from.r) === 1 && Math.abs(target.f - from.f) === 1) return true;
      if (fx.orthoStep && ((Math.abs(target.r - from.r) === 1 && target.f === from.f) || (Math.abs(target.f - from.f) === 1 && target.r === from.r))) return true;
      if (fx.leap31 && leapAttacks(from, target, LEAP31)) return true;
      if (fx.leap32 && leapAttacks(from, target, LEAP32)) return true;
      if (fx.leap2Diag && leapAttacks(from, target, [[2, 2], [2, -2], [-2, 2], [-2, -2]])) return true;
      if (fx.leap3Diag && leapAttacks(from, target, [[3, 3], [3, -3], [-3, 3], [-3, -3]])) return true;
      return false;
    }
    case "witch": {
      const pass = { friendly: !!fx.passFriendly, any: !!fx.passOne };
      if (DIRS_ALL.some((d) => rayAttacks(state, from, target, d, pass, 7))) return true;
      if (fx.leap2Any && leapAttacks(from, target, [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [2, -2], [-2, 2], [-2, -2]])) return true;
      if (fx.leap2Ortho && leapAttacks(from, target, [[2, 0], [-2, 0], [0, 2], [0, -2]])) return true;
      if (fx.leap2Diag && leapAttacks(from, target, [[2, 2], [2, -2], [-2, 2], [-2, -2]])) return true;
      if (fx.knightLeap && leapAttacks(from, target, KNIGHT_JUMPS)) return true;
      if (fx.leap31 && leapAttacks(from, target, LEAP31)) return true;
      return false;
    }
    case "warlord": {
      const range = fx.range || 1;
      return DIRS_ALL.some((d) => rayAttacks(state, from, target, d, { friendly: false, any: false }, range));
    }
    default:
      return false;
  }
}

function isSquareAttacked(state, sq, byColor) {
  for (let i = 0; i < 64; i++) {
    const piece = state.board[i];
    if (!piece || piece.color !== byColor) continue;
    if (pieceAttacksSquare(state, { r: Math.floor(i / 8), f: i % 8 }, piece, sq)) return true;
  }
  return false;
}

function isCheck(state, color) {
  const sq = findWarlord(state, color);
  if (!sq) return false;
  return isSquareAttacked(state, sq, other(color));
}

// ---- Castling ----
function genCastling(moves, state, color) {
  const rank = color === "w" ? 0 : 7;
  const fx = fxOf(state, color, "warlord");
  const kingSq = { r: rank, f: 4 };
  const king = state.board[idx(rank, 4)];
  if (!king || king.role !== "warlord" || king.color !== color) return;
  if (isSquareAttacked(state, kingSq, other(color))) return; // never out of check
  const rights = state.castling;
  const rightKey = color === "w" ? { K: "wk", Q: "wq" } : { K: "bk", Q: "bq" };

  function trySide(side) {
    const rookFile = side === "K" ? 7 : 0;
    const rook = state.board[idx(rank, rookFile)];
    if (!rook || rook.role !== "archer" || rook.color !== color) return;
    if (!fx.castleAfterMove && !rights[rightKey[side]]) return;
    const between = side === "K" ? [5, 6] : [1, 2, 3];
    for (const f of between) if (state.board[idx(rank, f)]) return;
    const passSq = { r: rank, f: side === "K" ? 5 : 3 };
    const destSq = { r: rank, f: side === "K" ? 6 : 2 };
    if (!fx.castleThrough && isSquareAttacked(state, passSq, other(color))) return;
    if (isSquareAttacked(state, destSq, other(color))) return; // never into check
    moves.push(makeMove(state, kingSq, destSq, null, { castle: side }));
  }
  trySide("K");
  trySide("Q");
}

// ---- Applying moves ----
// doMove mutates `state` in place and returns an undo record; undoMove
// reverses it. The AI search uses do/undo (fast); applyMove clones first
// and is the safe public API for game flow.
function doMove(state, move) {
  const fromI = idx(move.from.r, move.from.f);
  const toI = idx(move.to.r, move.to.f);
  const piece = state.board[fromI];
  const undo = {
    captured: state.board[toI],
    capturedEp: null,
    movedBefore: piece.moved,
    rookFrom: null, rookTo: null, rookMovedBefore: null,
    prevRole: null, prevHero: null,
    ep: state.ep, castling: { ...state.castling },
    halfmove: state.halfmove, fullmove: state.fullmove,
    keysLength: state.keys.length,
  };

  if (move.enPassant) {
    const capI = idx(move.from.r, move.to.f);
    undo.capturedEp = state.board[capI];
    state.board[capI] = null;
  }
  state.board[toI] = piece;
  state.board[fromI] = null;
  piece.moved = true;

  if (move.castle) {
    const rank = move.from.r;
    if (move.castle === "K") { undo.rookFrom = idx(rank, 7); undo.rookTo = idx(rank, 5); }
    else { undo.rookFrom = idx(rank, 0); undo.rookTo = idx(rank, 3); }
    const rook = state.board[undo.rookFrom];
    undo.rookMovedBefore = rook ? rook.moved : null;
    state.board[undo.rookTo] = rook;
    state.board[undo.rookFrom] = null;
    if (rook) rook.moved = true;
  }
  if (move.promotion) {
    undo.prevRole = piece.role;
    undo.prevHero = piece.hero;
    const heroes = piece.color === "w" ? state.heroesW : state.heroesB;
    piece.role = move.promotion;
    piece.hero = heroes[move.promotion];
  }
  if (move.double) {
    state.ep = idx((move.from.r + move.to.r) / 2, move.from.f);
  } else {
    state.ep = null;
  }

  // Castling rights.
  const c = state.castling;
  if (move.piece === "warlord") {
    if (piece.color === "w") { c.wk = false; c.wq = false; } else { c.bk = false; c.bq = false; }
  }
  if (move.piece === "archer") {
    if (move.from.r === 0 && move.from.f === 0) c.wq = false;
    if (move.from.r === 0 && move.from.f === 7) c.wk = false;
    if (move.from.r === 7 && move.from.f === 0) c.bq = false;
    if (move.from.r === 7 && move.from.f === 7) c.bk = false;
  }
  const captured = undo.captured;
  if (captured && captured.role === "archer") {
    if (move.to.r === 0 && move.to.f === 0) c.wq = false;
    if (move.to.r === 0 && move.to.f === 7) c.wk = false;
    if (move.to.r === 7 && move.to.f === 0) c.bq = false;
    if (move.to.r === 7 && move.to.f === 7) c.bk = false;
  }

  if (move.piece === "soldier" || move.captured || move.enPassant) state.halfmove = 0;
  else state.halfmove++;
  if (state.turn === "b") state.fullmove++;
  state.turn = other(state.turn);
  state.keys = [...state.keys, positionKey(state)];
  return undo;
}

function undoMove(state, move, undo) {
  const fromI = idx(move.from.r, move.from.f);
  const toI = idx(move.to.r, move.to.f);
  const piece = state.board[toI];
  if (move.promotion) {
    piece.role = undo.prevRole;
    piece.hero = undo.prevHero;
  }
  if (move.castle && undo.rookFrom !== null) {
    const rook = state.board[undo.rookTo];
    state.board[undo.rookFrom] = rook;
    state.board[undo.rookTo] = null;
    if (rook) rook.moved = undo.rookMovedBefore;
  }
  state.board[fromI] = piece;
  state.board[toI] = undo.captured;
  piece.moved = undo.movedBefore;
  if (move.enPassant) {
    state.board[idx(move.from.r, move.to.f)] = undo.capturedEp;
  }
  state.ep = undo.ep;
  state.castling = undo.castling;
  state.halfmove = undo.halfmove;
  state.fullmove = undo.fullmove;
  state.turn = other(state.turn);
  state.keys.length = undo.keysLength;
}

function applyMove(state, move) {
  const next = structuredClone(state);
  doMove(next, move);
  return next;
}

// Fast legal-move generation for the search: same result as legalMoves()
// but with in-place make/unmake instead of cloning per candidate.
function legalMovesFast(state) {
  const color = state.turn;
  const pseudo = genPseudoMoves(state, color);
  const legal = [];
  for (const move of pseudo) {
    const undo = doMove(state, move);
    if (!isCheck(state, color)) legal.push(move);
    undoMove(state, move, undo);
  }
  const castleMoves = [];
  genCastling(castleMoves, state, color);
  for (const move of castleMoves) {
    const undo = doMove(state, move);
    if (!isCheck(state, color)) legal.push(move);
    undoMove(state, move, undo);
  }
  return legal;
}

// ---- Legal moves, status, SAN ----
function legalMoves(state) {
  const color = state.turn;
  const pseudo = genPseudoMoves(state, color);
  const legal = [];
  for (const move of pseudo) {
    const next = applyMove(state, move);
    if (!isCheck(next, color)) legal.push(move);
  }
  const castleMoves = [];
  genCastling(castleMoves, state, color);
  for (const move of castleMoves) {
    const next = applyMove(state, move);
    if (!isCheck(next, color)) legal.push(move);
  }
  for (const move of legal) move.san = sanFor(state, move);
  return legal;
}

// Legal moves for one side from the current position, even when it is not
// that side's turn — read-only inspection (e.g. viewing an enemy hero's
// possible moves). The en-passant right belongs to the side to move (it
// was created by the other side's double march), so the inspected side has
// no ep capture; clearing the square also keeps its diagStep moves onto
// that (empty) square from being wrongly suppressed.
function legalMovesFor(state, color) {
  if (color === state.turn) return legalMoves(state);
  const probe = structuredClone(state);
  probe.turn = color;
  probe.ep = null;
  return legalMoves(probe);
}

function sanFor(state, move) {
  if (move.castle === "K") return "O-O";
  if (move.castle === "Q") return "O-O-O";
  let s = ROLE_LETTER[move.piece];
  if (move.captured || move.enPassant) {
    if (move.piece === "soldier") s += "abcdefgh"[move.from.f] + "x";
    else s += "x";
  }
  s += toAlgebraic(move.to);
  if (move.promotion) s += "=" + ROLE_LETTER[move.promotion];
  const next = applyMove(state, move);
  const enemy = other(move.color);
  if (isCheck(next, enemy)) {
    // Use the fast generator here: legalMoves() assigns SANs via sanFor(),
    // so calling it would recurse (sanFor -> legalMoves -> sanFor ...) and
    // overflow the stack on long checking sequences / perpetual check.
    // legalMovesFast() returns the same move set without SANs.
    s += legalMovesFast(next).length === 0 ? "#" : "+";
  }
  return s;
}

function insufficientMaterial(state) {
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p && p.role !== "warlord") return false;
  }
  return true;
}

function gameStatus(state) {
  const moves = legalMoves(state);
  if (moves.length === 0) {
    return isCheck(state, state.turn) ? "checkmate" : "stalemate";
  }
  if (insufficientMaterial(state)) return "draw";
  if (state.halfmove >= 100) return "draw";
  const key = positionKey(state);
  if (state.keys.filter((k) => k === key).length >= 3) return "draw";
  return "active";
}

// Serialize the board for the API: ranks 0..7 (rank 1 first).
function serializeBoard(state) {
  const ranks = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let f = 0; f < 8; f++) {
      const p = state.board[idx(r, f)];
      row.push(p ? { role: p.role, color: p.color, hero: p.hero } : null);
    }
    ranks.push(row);
  }
  return ranks;
}

function deserializeBoard(ranks, heroesW, heroesB) {
  const board = new Array(64).fill(null);
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = ranks[r][f];
      if (cell) board[idx(r, f)] = { role: cell.role, color: cell.color, hero: cell.hero, moved: true };
    }
  }
  return board;
}

module.exports = {
  ...module.exports,
  isSquareAttacked, isCheck, genCastling, doMove, undoMove, applyMove,
  legalMoves, legalMovesFast, legalMovesFor, sanFor,
  insufficientMaterial, gameStatus, serializeBoard, deserializeBoard,
  pieceAttacksSquare,
};
