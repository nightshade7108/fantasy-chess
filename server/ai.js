// Fantasy Chess — minimax AI with alpha-beta pruning and iterative
// deepening. Difficulty sets search depth, time cap and randomness.
// Evaluation is material (the hero's power value) plus small positional
// bonuses. The search never runs longer than the difficulty's time cap
// (hard cap ~2.5s at the top difficulty).

const { legalMovesFast, doMove, undoMove, isCheck, insufficientMaterial, sanFor } = require("./engine");
const { heroById } = require("./data/heroes");

const MATE = 100000;

const DIFF_CONFIG = {
  squire: { depth: 1, random: 0.35, timeMs: 300 },
  knight: { depth: 2, random: 0.15, timeMs: 700 },
  warlord: { depth: 2, random: 0.05, timeMs: 1200 },
  dragon: { depth: 3, random: 0.0, timeMs: 2000 },
  celestial: { depth: 3, random: 0.0, timeMs: 2500 },
};

const TIMEOUT = Symbol("timeout");

function evaluate(state) {
  const us = state.turn;
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const hero = heroById(p.hero);
    const value = (hero ? hero.power : 10) * 10;
    const r = Math.floor(i / 8);
    const f = i % 8;
    const adv = p.color === "w" ? r : 7 - r;
    const centrality = 3 - Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
    let pst = 0;
    if (p.role === "soldier") pst = adv * 6;
    else if (p.role === "knight" || p.role === "witch") pst = centrality * 4;
    else if (p.role === "archer" || p.role === "wizard") pst = centrality * 3;
    else if (p.role === "warlord") pst = centrality * 2;
    const v = value + pst;
    score += p.color === us ? v : -v;
  }
  return score;
}

function orderMoves(moves) {
  // Captures first, most valuable victim first (MVV-LVA-ish on power).
  for (const m of moves) {
    let s = 0;
    if (m.captured) {
      const victim = m.capturedHero ? heroById(m.capturedHero) : null;
      const attacker = m.piece;
      s = 1000 + (victim ? victim.power : 10) * 10 - (attacker === "soldier" ? 0 : 50);
      if (m.promotion) s += 5000;
    } else if (m.promotion) {
      s += 5000;
    }
    m._order = s;
  }
  moves.sort((a, b) => b._order - a._order);
}

function search(state, depth, alpha, beta, deadline, ply) {
  if (Date.now() > deadline) throw TIMEOUT;
  if (state.halfmove >= 100) return 0;
  if (insufficientMaterial(state)) return 0;
  const moves = legalMovesFast(state);
  if (moves.length === 0) {
    return isCheck(state, state.turn) ? -MATE + ply : 0;
  }
  if (depth === 0) return evaluate(state);
  orderMoves(moves);
  let best = -Infinity;
  for (const m of moves) {
    const undo = doMove(state, m);
    let score;
    try {
      score = -search(state, depth - 1, -beta, -alpha, deadline, ply + 1);
    } catch (e) {
      undoMove(state, m, undo);
      throw e;
    }
    undoMove(state, m, undo);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Returns a legal move object (from legalMovesFast, with SAN filled in)
// or null.
function chooseMove(state, difficultyId) {
  const cfg = DIFF_CONFIG[difficultyId] || DIFF_CONFIG.squire;
  const deadline = Date.now() + cfg.timeMs;
  const rootMoves = legalMovesFast(state);
  if (rootMoves.length === 0) return null;
  // legalMovesFast does not compute SAN; fill it in so callers (history,
  // API responses) get a real move string instead of null.
  if (rootMoves.length === 1) {
    rootMoves[0].san = sanFor(state, rootMoves[0]);
    return rootMoves[0];
  }

  let bestList = rootMoves.map((m) => ({ move: m, score: 0 }));
  try {
    for (let depth = 1; depth <= cfg.depth; depth++) {
      const scored = [];
      let alpha = -Infinity;
      orderMoves(rootMoves);
      for (const m of rootMoves) {
        const undo = doMove(state, m);
        let score;
        try {
          score = -search(state, depth - 1, -Infinity, -alpha, deadline, 1);
        } catch (e) {
          undoMove(state, m, undo);
          throw e;
        }
        undoMove(state, m, undo);
        scored.push({ move: m, score });
        if (score > alpha) alpha = score;
      }
      scored.sort((a, b) => b.score - a.score);
      bestList = scored;
    }
  } catch (e) {
    if (e !== TIMEOUT) throw e;
    // Out of time: keep the best result from the last completed depth.
  }

  let chosen;
  if (cfg.random > 0 && Math.random() < cfg.random && bestList.length > 1) {
    const top = bestList.slice(0, Math.min(3, bestList.length));
    chosen = top[Math.floor(Math.random() * top.length)].move;
  } else {
    chosen = bestList[0].move;
  }
  chosen.san = sanFor(state, chosen);
  return chosen;
}

module.exports = { chooseMove, DIFF_CONFIG, evaluate };
