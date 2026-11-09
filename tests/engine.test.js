// Engine tests: classic perft numbers, ability spot-checks, mate/stalemate,
// and self-play games to checkmate. Run with: npm run test:engine
const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../server/engine");
const { heroById, STARTERS } = require("../server/data/heroes");
const { chooseMove } = require("../server/ai");

const { createGame, legalMoves, applyMove, gameStatus, isCheck, toAlgebraic, fromAlgebraic } = engine;

// Hero ids that do not exist in the catalog → fx {} → plain classic chess.
const PLAIN = {
  soldier: "plain-soldier", archer: "plain-archer", wizard: "plain-wizard",
  knight: "plain-knight", witch: "plain-witch", warlord: "plain-warlord",
};

function perft(state, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of engine.legalMovesFast(state)) {
    const undo = engine.doMove(state, m);
    nodes += perft(state, depth - 1);
    engine.undoMove(state, m, undo);
  }
  return nodes;
}

function findMove(state, from, to, promotion = null) {
  const f = typeof from === "string" ? fromAlgebraic(from) : from;
  const t = typeof to === "string" ? fromAlgebraic(to) : to;
  return legalMoves(state).find(
    (m) => m.from.r === f.r && m.from.f === f.f && m.to.r === t.r && m.to.f === t.f &&
      (promotion === null || m.promotion === promotion)
  );
}

function playMoves(state, list) {
  let s = state;
  for (const [from, to, promo] of list) {
    const m = findMove(s, from, to, promo || null);
    assert.ok(m, `expected legal move ${from}-${to} (turn ${s.turn})`);
    s = applyMove(s, m);
  }
  return s;
}

test("perft: plain heroes reproduce classic chess counts", () => {
  const g = createGame(PLAIN, PLAIN);
  assert.equal(perft(g, 1), 20);
  assert.equal(perft(g, 2), 400);
  assert.equal(perft(g, 3), 8902);
});

test("perft depth 4 (plain heroes)", () => {
  const g = createGame(PLAIN, PLAIN);
  assert.equal(perft(g, 4), 197281);
});

test("starter warband: ability moves add 19 opening moves", () => {
  const g = createGame(STARTERS, STARTERS);
  // 20 classic + 14 Bram diagonal steps + 2 Tomas knight leaps (b1-b3,
  // g1-g3) + 3 Mabel witch leaps (d1-d3/b3/f3) = 39.
  assert.equal(legalMoves(g).length, 39);
  assert.ok(findMove(g, "e2", "f3"), "Bram soldier steps diagonally into empty f3");
  assert.ok(findMove(g, "b1", "b3"), "Tomas knight leaps two squares to b3");
  assert.ok(findMove(g, "d1", "f3"), "Mabel witch leaps two squares to f3");
});

test("fool's mate is checkmate", () => {
  let g = createGame(PLAIN, PLAIN);
  g = playMoves(g, [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]]);
  assert.equal(gameStatus(g), "checkmate");
  assert.ok(isCheck(g, "w"));
});

test("stalemate is detected", () => {
  // Constructed stalemate: white king a6, white queen b6, black king a8
  // to move. The black king has no moves and is not in check.
  const g0 = createGame(PLAIN, PLAIN);
  const s = JSON.parse(JSON.stringify(g0));
  s.board = new Array(64).fill(null);
  const put = (r, f, role, color) => { s.board[r * 8 + f] = { role, color, hero: "x", moved: true }; };
  put(5, 0, "warlord", "w"); // a6
  put(5, 1, "witch", "w");    // b6
  put(7, 0, "warlord", "b");  // a8
  s.turn = "b";
  s.heroesW = { ...PLAIN };
  s.heroesB = { ...PLAIN };
  s.keys = [engine.positionKey(s)];
  assert.equal(legalMoves(s).length, 0, "black has no legal moves");
  assert.equal(isCheck(s, "b"), false, "black is not in check");
  assert.equal(gameStatus(s), "stalemate");
});

test("en passant works", () => {
  let g = createGame(PLAIN, PLAIN);
  g = playMoves(g, [["e2", "e4"], ["a7", "a6"], ["e4", "e5"], ["d7", "d5"]]);
  const ep = findMove(g, "e5", "d6");
  assert.ok(ep && ep.enPassant, "e5xd6 e.p. is legal");
  g = applyMove(g, ep);
  assert.equal(g.board[4 * 8 + 3], null, "captured soldier removed from d5");
});

test("legalMovesFor: moves for the non-turn side, no phantom en passant", () => {
  const g = createGame(PLAIN, PLAIN);
  const black = engine.legalMovesFor(g, "b");
  assert.equal(black.length, 20);
  assert.ok(black.every((m) => m.color === "b"));
  assert.ok(!black.some((m) => m.enPassant));
  assert.ok(black.every((m) => typeof m.san === "string" && m.san.length > 0));
  // Identity: asking for the side to move is the same set as legalMoves().
  const key = (m) => m.from.r + "," + m.from.f + ">" + m.to.r + "," + m.to.f + (m.promotion || "") + (m.castle || "");
  assert.deepEqual(
    engine.legalMovesFor(g, "w").map(key).sort(),
    legalMoves(g).map(key).sort()
  );
  // After 1.e4 a6 2.e5 d5 the white pawn on e5 can capture en passant on
  // d6 — but black, inspected from the same position, has no ep capture:
  // the right belongs to the side to move (it was created by black's own
  // double march, so the victim square is empty for black).
  const s = playMoves(createGame(PLAIN, PLAIN), [["e2", "e4"], ["a7", "a6"], ["e4", "e5"], ["d7", "d5"]]);
  assert.equal(s.ep, engine.idx(5, 3)); // d6
  const whiteEp = legalMoves(s).find((m) => m.enPassant);
  assert.ok(whiteEp);
  assert.equal(toAlgebraic(whiteEp.from), "e5");
  assert.equal(toAlgebraic(whiteEp.to), "d6");
  const blackMoves = engine.legalMovesFor(s, "b");
  assert.ok(blackMoves.length > 0);
  assert.ok(blackMoves.every((m) => m.color === "b"));
  assert.ok(!blackMoves.some((m) => m.enPassant), "no phantom ep capture for black");
});

test("castling: available when clear, blocked by check", () => {
  let g = createGame(PLAIN, PLAIN);
  // Clear kingside: Nf3, e3, Bc4, O-O.
  g = playMoves(g, [["g1", "f3"], ["e7", "e5"], ["e2", "e3"], ["d7", "d5"], ["f1", "c4"], ["b8", "c6"]]);
  const castle = legalMoves(g).find((m) => m.castle === "K");
  assert.ok(castle, "kingside castling available");
  assert.equal(castle.san, "O-O");
  // King in check cannot castle: 1. e4 e5 2. Qh5 Nc6 3. Qxe5+ — black in check, no castling.
  let g2 = createGame(PLAIN, PLAIN);
  g2 = playMoves(g2, [["e2", "e4"], ["e7", "e5"], ["d1", "h5"], ["b8", "c6"], ["h5", "e5"]]);
  assert.ok(isCheck(g2, "b"));
  assert.equal(legalMoves(g2).filter((m) => m.castle).length, 0, "no castling out of check");
});

test("Roland's warlord moves two squares", () => {
  let g = createGame(STARTERS, STARTERS);
  g = playMoves(g, [["e2", "e4"], ["e7", "e5"], ["d2", "d4"], ["d7", "d5"]]);
  // King e1: e2 and d2 are now empty; range 2 allows Ke1-e3 and Ke1-d3? d3
  // is occupied by the d4... no: d2 soldier moved to d4, so d2 empty, d3 empty.
  assert.ok(findMove(g, "e1", "e3"), "Roland strides two squares to e3");
  assert.ok(findMove(g, "e1", "d2"), "Roland steps to d2");
});

test("Sera captures straight ahead", () => {
  const sera = { ...STARTERS, soldier: "sera-shieldbearer" };
  let g = createGame(sera, PLAIN);
  g = playMoves(g, [["e2", "e4"], ["e7", "e5"]]);
  assert.ok(findMove(g, "e4", "e5"), "Sera's soldier captures straight ahead");
});

test("Kael's two-diagonal capture on a constructed position", () => {
  const kael = { ...STARTERS, soldier: "kael-pikeman" };
  let g = createGame(kael, PLAIN);
  // 1. e4 d6 2. e5: white soldier e5; black soldier d6 is diagonally adjacent.
  // For the 2-diagonal capture we need an enemy at d7: 2... Nc6 doesn't help.
  // Play 1. e4 e6 2. e5 d6 3. exd6 e.p.? No. Use: 1. e4 d5 2. e5 f5?? f5 is two
  // diagonally forward from e5? e5->f6/g7 is diagonal; f5 is not.
  // Direct: enemy on d7 is 2 diagonally forward from e5 (d6, c7)? e5->d6->c7:
  // d7 is NOT on that diagonal. Enemy on g7 is 2 diagonally from e5 (f6,g7).
  // Black: 1. e4 g6?? g-pawn to g6, then 2. e5 g5?? g5 not diagonal.
  // Enemy must sit on f6 or d6 (1 away, normal capture) or g7/c7 (2 away).
  // Black soldier g7 is there from the start. White soldier e5 -> g7 is a
  // 2-diagonal capture if g7 holds a black piece and f6 is empty... but g7
  // holds a black SOLDIER from setup. Path: e5-f6 (empty) -g7 (enemy soldier).
  g = playMoves(g, [["e2", "e4"], ["a7", "a6"], ["e4", "e5"], ["h7", "h6"]]);
  const cap = findMove(g, "e5", "g7");
  assert.ok(cap, "Kael's soldier captures two squares diagonally to g7");
});

test("Xandor teleports to same-colour empty squares, never captures", () => {
  const xandor = { ...STARTERS, wizard: "xandor-archmage" };
  let g = createGame(xandor, PLAIN);
  // Free the c1 wizard: 1. d3 (opens c1-h6 diagonal not needed) — teleport
  // needs the wizard's own square colour: c1 is dark (r0+f2=2 even).
  g = playMoves(g, [["d2", "d3"], ["e7", "e5"]]);
  const moves = legalMoves(g).filter((m) => m.from.r === 0 && m.from.f === 2);
  const teleports = moves.filter((m) => m.teleport);
  assert.ok(teleports.length > 0, "wizard has teleport moves");
  assert.ok(teleports.every((m) => !m.captured), "teleports never capture");
  assert.ok(teleports.every((m) => (m.to.r + m.to.f) % 2 === 0), "same colour only");
  // Teleport cannot give check: a teleported wizard must not attack the king.
  const g2 = applyMove(g, teleports[0]);
  assert.equal(isCheck(g2, "b"), false, "teleport does not give check");
});

test("Valeria castles after the warlord has moved", () => {
  const valeria = { ...STARTERS, warlord: "valeria-warmarshal" };
  let g = createGame(valeria, PLAIN);
  g = playMoves(g, [["e2", "e4"], ["e7", "e5"], ["e1", "e2"], ["d7", "d5"], ["e2", "e1"], ["d5", "d4"], ["g1", "f3"], ["b8", "c6"], ["f1", "c4"], ["g8", "f6"]]);
  const castle = legalMoves(g).find((m) => m.castle === "K");
  assert.ok(castle, "Valeria castles even after the warlord moved");
});

test("Dain castles through an attacked square, but not into check", () => {
  const dain = { ...STARTERS, warlord: "dain-ironlord" };
  let g = createGame(dain, PLAIN);
  // Black bishop on c5 attacks f2... we need f1 attacked but g1 safe.
  // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 (bishop c5 attacks f2, not f1).
  // f1 is attacked by... the c5 bishop attacks along diagonal c5-d4-e3-f2-g1:
  // f1 is not on it. Use black queen: 1. e4 d5 2. exd5 Qxd5 — queen d5 attacks
  // f... d5-h5 diagonal: f3. Not f1. Queen on d5 attacks d-file and rank 5.
  // Simplest: black rook? Needs open file. Use: 1. e4 e5 2. Bc4 d6 3. Nf3 Bg4
  // (bishop g4 attacks f3/e2... not f1). Bishop on b4 attacks e1? b4-e1 diagonal:
  // c3 d2 e1 — yes, e1. That puts the king in check, blocking castling entirely.
  // Instead: black bishop on a6 attacks f1: a6-b5-c4-d3-e2-f1. Get it there:
  // 1. d4 d5 2. Bf4? ... this is getting long; use a direct construction:
  // play 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O?? white castles first.
  // For the test, construct via moves: 1. e3 e5 2. Qf3?? no.
  // Alternative: test with the engine directly — build a position by playing
  // 1. g3 e5 2. Bg2 Nc6 3. e3 Bc5?? Bc5 attacks f2. Hmm.
  // Use black queen to a5: attacks f... a5-e1 diagonal: b4 c3 d2 e1 — check.
  // Queen to h4: h4-e1 diagonal: g3 f2 e1 — check if path clear.
  // Queen to d6: d6-h2 diagonal: e5 f4 g3 h2. Not f1.
  // Bishop to g4 pins Nf3; bishop on g4 attacks... d1? g4-f3-e2-d1: d1 attacked.
  // f1 attacked by a bishop on b5? b5-c4-d3-e2-f1: yes! 1. e4 e5 2. Nf3 Nc6
  // 3. Bb5 — black bishop cannot reach b5. White bishop b5 is white's.
  // Black bishop to b4: 1. e4 e5 2. c3?? blocks. 1. d4 d5 2. Nf3 Bg4 3. e3 e6
  // 4. Be2 Bd6?? Bd6 attacks h2. 4... Bb4+? check.
  // Give up the natural line: verify via a scripted sequence using the
  // engine's applyMove on a custom start — instead, test the rule directly:
  // place pieces by playing: 1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6
  // 5. Nc3 a6 6. Bg5 e6 7. Qd2 Be7 8. O-O-O?? queenside needs b8 knight moved:
  // Nc6 played. 8... Nbd7?? no. This is too long — test Dain differently:
  // kingside: clear f1/g1 (Nf3, Bc4), black queen goes to h5: Qd8-h5 attacks
  // f... h5-e2 diagonal: g4 f3 e2 — attacks e2 and f3, not f1.
  // Queen to d6 attacks f... d6-a3 diagonal, d6-h2 diagonal.
  // Queen to b6: b6-f2 diagonal: c5 d4 e3 f2 — attacks f2.
  // Rook on f8 attacks f1 if f-file opens: 1. e4 e5 2. Nf3 Nf6 3. Bc4 Nxe4??
  // Nxe4 opens... f7 pawn still blocks the f-file. 3... d6 4. d3 Bg4 5. h3 Bh5
  // 6. O-O?? white castles. Black: 6... exf?? no.
  // Pragmatic approach: use two plies to set up f1 attacked via a black
  // bishop on c4: 1. d4 d5 2. c4?? dxc4?? no. 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qd6
  // 4. d4?? Qxd4?? no...
  // FINAL approach: build the position with engine internals — create a game,
  // then manually move pieces by applying legal moves is too slow. Instead
  // directly test isSquareAttacked + genCastling on a hand-built board using
  // createGame + a series of legal moves that put a black bishop on c4
  // attacking f1: 1. e3 d5 2. d4 Bf5?? Bf5 attacks c2. 2... e6 3. Nf3 c5
  // 4. dxc5 Bxc5 5. Bd3?? blocks. 5. a3?? a6 6. b4?? Bb6?? no.
  // 1. e3 e6 2. d4 d5 3. c3?? c5 4. dxc5 Bxc5 5. Nf3 Nf6 6. Bd3?? blocks d-file.
  // Bishop c5 attacks f2 and g1 (diagonal c5-d4-e3-f2-g1). f1 is NOT on it.
  // Bishop on b4 attacks e1 (check) and d2/c3.
  // Bishop on a5 attacks e1 (check).
  // What attacks f1 but not e1/g1? Bishop on c4: c4-d3-e2-f1. Rook/queen on
  // f-file: rook f8 with f-pawn moved. Queen on f6: f6-f1 file! Queen d8-f6?
  // 1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O?? white castles first — no.
  // 1. e4 e5 2. d3 Nf6 3. Nf3 Nc6 4. Bg5?? h6 5. Bh4 Be7 6. Nc3 O-O?? black
  // castles. 7. Qd2 d6 8. O-O-O?? queenside for white: needs b1/c1/d1 clear
  // and b8 knight moved — Nc6 played, but Qd2 is on d1! No.
  // OK — direct unit test with a hand-built state:
  const eng = require("../server/engine");
  const g0 = createGame(PLAIN, PLAIN);
  // Manually arrange: white king e1, rook h1, pawns e2/f2/g2 gone; black
  // queen on f6 attacking f1 down the file. Build by clearing the board via
  // applyMove is impractical; instead mutate a clone (test-only).
  const s = JSON.parse(JSON.stringify(g0));
  s.board = new Array(64).fill(null);
  const put = (r, f, role, color) => { s.board[r * 8 + f] = { role, color, hero: "x", moved: false }; };
  put(0, 4, "warlord", "w");
  put(0, 7, "archer", "w");
  put(0, 0, "archer", "w");
  put(5, 5, "witch", "b"); // black queen f6 attacks f1
  put(7, 4, "warlord", "b");
  s.castling = { wk: true, wq: true, bk: true, bq: true };
  s.heroesW = { ...PLAIN, warlord: "dain-ironlord" };
  s.heroesB = { ...PLAIN };
  s.keys = [eng.positionKey(s)];
  const moves = eng.legalMoves(s);
  const castle = moves.find((m) => m.castle === "K");
  assert.ok(castle, "Dain castles through attacked f1");
  // And with a plain warlord the same position must NOT allow castling.
  s.heroesW = { ...PLAIN };
  const moves2 = eng.legalMoves(s);
  assert.equal(moves2.filter((m) => m.castle === "K").length, 0, "plain warlord cannot castle through check on f1");
});

test("random self-play games finish without illegal moves", () => {
  for (let game = 0; game < 3; game++) {
    let g = createGame(STARTERS, STARTERS);
    let plies = 0;
    while (gameStatus(g) === "active" && plies < 400) {
      const moves = engine.legalMovesFast(g);
      assert.ok(moves.length > 0, "active position must have legal moves");
      const m = moves[Math.floor(Math.random() * moves.length)];
      g = applyMove(g, m);
      plies++;
    }
    assert.ok(["checkmate", "stalemate", "draw"].includes(gameStatus(g)) || plies >= 400,
      `game ended: ${gameStatus(g)} after ${plies} plies`);
  }
});

test("AI vs AI game reaches checkmate", { timeout: 120000 }, () => {
  let g = createGame(STARTERS, STARTERS);
  let plies = 0;
  while (gameStatus(g) === "active" && plies < 200) {
    const diff = g.turn === "w" ? "knight" : "squire";
    const m = chooseMove(g, diff);
    assert.ok(m, "AI found a move");
    g = applyMove(g, m);
    plies++;
  }
  assert.equal(gameStatus(g), "checkmate", `AI game ended ${gameStatus(g)} after ${plies} plies`);
});

// ---- Helpers for hand-built positions (test-only) ----

// Deterministic PRNG (mulberry32) so fuzz-style tests are reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a position from [square, role, color, moved?] entries. Test-only:
// mutates a clone the way the stalemate test does.
function handBuilt(setup, turn, heroesW = PLAIN, heroesB = PLAIN, ep = null, castling = null) {
  const g0 = createGame(PLAIN, PLAIN);
  const s = JSON.parse(JSON.stringify(g0));
  s.board = new Array(64).fill(null);
  for (const [sq, role, color, moved] of setup) {
    const f = fromAlgebraic(sq);
    s.board[f.r * 8 + f.f] = { role, color, hero: "x", moved: moved !== false };
  }
  s.turn = turn;
  s.ep = ep;
  s.castling = castling || { wk: true, wq: true, bk: true, bq: true };
  s.heroesW = { ...heroesW };
  s.heroesB = { ...heroesB };
  s.keys = [engine.positionKey(s)];
  return s;
}

function hasMove(state, from, to) {
  return legalMoves(state).some(
    (m) => toAlgebraic(m.from) === from && toAlgebraic(m.to) === to
  );
}

function moveKey(m) {
  return `${m.from.r},${m.from.f}>${m.to.r},${m.to.f}|${m.promotion || ""}|${m.castle || ""}|${m.enPassant ? "ep" : ""}|${m.teleport ? "tp" : ""}`;
}

function snapshotState(s) {
  return JSON.stringify({
    board: s.board.map((p) => (p ? [p.role, p.color, p.hero, p.moved] : null)),
    turn: s.turn, castling: s.castling, ep: s.ep,
    halfmove: s.halfmove, fullmove: s.fullmove, keys: s.keys,
  });
}

test("sanFor does not recurse through legalMoves (stack-overflow regression)", () => {
  // Before the fix, sanFor() decided "+" vs "#" by calling legalMoves(),
  // which re-entered sanFor() for every checking reply — one recursion
  // level per consecutive checking ply. Checking sequences can CYCLE
  // (a perpetual-check loop), so the recursion never terminated and the
  // stack overflowed inside structuredClone/applyMove, crashing the
  // request. This endgame position contains such a cycle and crashed the
  // old engine with RangeError (max sanFor depth 3670 in a fuzz run):
  //   a7-a8=Q+ Kg3 (the range-2 warlord itself attacks e3) Qf3+ Ke1
  //   Qe2+ Kg3 Qf3+ ... — queen and warlord checking each other forever.
  // The mate test now uses legalMovesFast(), which assigns no SANs and
  // cannot recurse, so this position resolves in milliseconds.
  const s = handBuilt([
    ["b2", "wizard", "w"], ["e3", "warlord", "w"], ["g4", "soldier", "w"], ["a7", "soldier", "w"],
    ["g2", "warlord", "b"], ["h3", "soldier", "b"], ["c5", "archer", "b"], ["h6", "soldier", "b"],
  ], "w", PLAIN, STARTERS, null, { wk: false, wq: false, bk: false, bq: false });
  const t0 = Date.now();
  const moves = legalMoves(s);
  assert.equal(moves.length, 17, "white has 17 legal moves");
  assert.equal(gameStatus(s), "active");
  assert.ok(Date.now() - t0 < 5000, `legalMoves on the perpetual-check position took ${Date.now() - t0}ms`);
  assert.equal(findMove(s, "a7", "a8", "witch").san, "a8=Q+", "promoting to witch gives check");
  assert.equal(findMove(s, "a7", "a8", "wizard").san, "a8=B+", "promoting to wizard gives check");
});

test("sanFor stays fast on a long checking chain in a full middlegame", () => {
  // A second checking-rich position: a 7-ply chain of consecutive checking
  // moves (h3-g4+ f4-e3 g4-f3+ e3-f3 b5-f5+ f1-f5 c5-f5+) in a knight-band
  // middlegame, found by fuzzing. Pre-fix this took ~10x longer than
  // post-fix because every checking move re-ran a full legalMoves.
  const band = { soldier: "sera-shieldbearer", archer: "liana-longshot", wizard: "mira-frostweaver", knight: "brienne-oathbound", witch: "morwen-hexweaver", warlord: "dain-ironlord" };
  const s = handBuilt([
    ["d1", "witch", "w"], ["e1", "wizard", "w"], ["f1", "archer", "w"], ["g1", "wizard", "w"],
    ["b2", "soldier", "w"], ["c2", "soldier", "w"], ["g2", "soldier", "w"], ["h2", "soldier", "w"],
    ["f3", "soldier", "w"], ["g3", "soldier", "b"], ["h3", "wizard", "b"],
    ["a4", "soldier", "w"], ["b4", "knight", "w"], ["c4", "soldier", "b"], ["d4", "soldier", "w"],
    ["e4", "soldier", "w"], ["f4", "warlord", "w"],
    ["b5", "archer", "b"], ["c5", "archer", "b"], ["b6", "soldier", "b"],
    ["a7", "soldier", "b"], ["d7", "soldier", "b"], ["e7", "soldier", "b"],
    ["f7", "warlord", "b"], ["g7", "soldier", "b"], ["h7", "soldier", "b"],
    ["b8", "knight", "b"], ["f8", "wizard", "b"],
  ], "b", band, band, 20, { wk: false, wq: false, bk: false, bq: false });
  const t0 = Date.now();
  const moves = legalMoves(s);
  assert.equal(moves.length, 50, "black has 50 legal moves");
  assert.equal(gameStatus(s), "active");
  assert.ok(Date.now() - t0 < 5000, `legalMoves on a checking-rich position took ${Date.now() - t0}ms`);
  const checking = moves.find((m) => toAlgebraic(m.from) === "h3" && toAlgebraic(m.to) === "g4");
  assert.ok(checking, "black wizard h3-g4 is legal");
  assert.equal(checking.san, "Bg4+", "checking move gets + (not # — white has replies)");
});

// ---- Pawn/bishop regression: a soldier must never move like a bishop ----
// Open position used for every soldier hero: white soldiers on d4/e4/f4,
// black soldiers on the 1-diagonal squares (c5, g5) and the 2-diagonal
// squares (b6, d6, f6, h6); the 1-diagonal squares d5/e5/f5 and the
// 2-diagonal squares c6/g6 are EMPTY, and e6 is empty for the march.
function soldierProbePosition(soldierHero) {
  const heroesW = { ...PLAIN, soldier: soldierHero };
  return handBuilt([
    ["a1", "warlord", "w"], ["d4", "soldier", "w"], ["e4", "soldier", "w"], ["f4", "soldier", "w"],
    ["h8", "warlord", "b"], ["c5", "soldier", "b"], ["g5", "soldier", "b"],
    ["b6", "soldier", "b"], ["d6", "soldier", "b"], ["f6", "soldier", "b"], ["h6", "soldier", "b"],
  ], "w", heroesW, PLAIN);
}

const SOLDIER_HEROES = {
  "bram-footman": { diagStep: true },
  "sera-shieldbearer": { capStraight: true },
  "kael-pikeman": { cap2Diag: true },
  "aurora-dawnblade": { march2: true, diagStep: true },
  "fenn-shepherd": { stepBack: true },
  "odric-torchbearer": { diagStep: true },
  "petra-sapper": { capStraight: true, diagStep: true },
  "jory-lancer": { march2: true },
  "selene-duelist": { capStraight: true, cap2Diag: true },
  "cato-veteran": { march2: true, capStraight: true },
  "isolde-stormblade": { march2: true, cap2Diag: true },
  "theron-sunmarshal": { march2: true, diagStep: true, capStraight: true },
};

test("soldiers never move multi-square diagonally to an empty square (all 12 heroes)", () => {
  for (const [hero, fx] of Object.entries(SOLDIER_HEROES)) {
    const s = soldierProbePosition(hero);
    const soldierMoves = legalMoves(s).filter((m) => m.piece === "soldier");
    assert.ok(soldierMoves.length > 0, `${hero} has soldier moves`);
    for (const m of soldierMoves) {
      const dr = Math.abs(m.to.r - m.from.r);
      const df = Math.abs(m.to.f - m.from.f);
      // Headline invariant: a multi-square diagonal soldier move is only
      // ever a capture (cap2Diag); it never lands on an empty square.
      if (dr >= 2 && df >= 1) {
        assert.ok(m.captured, `${hero}: soldier ${toAlgebraic(m.from)}-${toAlgebraic(m.to)} goes ${dr}x${df} diagonally without capturing`);
      }
    }
    // Empty 2-diagonal squares are never reachable.
    assert.equal(hasMove(s, "e4", "c6"), false, `${hero}: no e4-c6 to an empty square`);
    assert.equal(hasMove(s, "e4", "g6"), false, `${hero}: no e4-g6 to an empty square`);
    // 2-diagonal captures exist exactly for cap2Diag heroes, and only as captures.
    for (const [from, to] of [["d4", "b6"], ["d4", "f6"], ["f4", "d6"], ["f4", "h6"]]) {
      assert.equal(hasMove(s, from, to), !!fx.cap2Diag, `${hero}: ${from}-${to} (cap2Diag=${!!fx.cap2Diag})`);
    }
    // 2-square march from a non-start rank exists exactly for march2 heroes.
    assert.equal(hasMove(s, "e4", "e6"), !!fx.march2, `${hero}: e4-e6 (march2=${!!fx.march2})`);
    // 1-diagonal steps into empty squares exist exactly for diagStep heroes.
    for (const [from, to] of [["d4", "e5"], ["e4", "d5"], ["e4", "f5"], ["f4", "e5"]]) {
      assert.equal(hasMove(s, from, to), !!fx.diagStep, `${hero}: ${from}-${to} (diagStep=${!!fx.diagStep})`);
    }
    // 1-square backward step exists exactly for Fenn.
    assert.equal(hasMove(s, "e4", "e3"), !!fx.stepBack, `${hero}: e4-e3 (stepBack=${!!fx.stepBack})`);
  }
});

test("en passant pin: capturing e.p. must not expose the warlord", () => {
  // White king a5 and black archer h5 share rank 5 with the white soldier
  // e5 and the black soldier d5 (which just double-marched, ep=d6). The
  // e.p. capture would remove both soldiers and open the rank.
  const s = handBuilt([
    ["a5", "warlord", "w"], ["e5", "soldier", "w"],
    ["h8", "warlord", "b"], ["d5", "soldier", "b"], ["h5", "archer", "b"],
  ], "w", PLAIN, PLAIN, fromAlgebraic("d6").r * 8 + fromAlgebraic("d6").f);
  assert.equal(hasMove(s, "e5", "d6"), false, "e.p. capture is illegal: it exposes the warlord");
  assert.equal(hasMove(s, "e5", "e6"), true, "the forward step stays legal: d5 still blocks the rank");
});

test("promotion by capture offers all four pieces and swaps role and hero", () => {
  const s = handBuilt([
    ["e1", "warlord", "w"], ["g7", "soldier", "w"],
    ["e8", "warlord", "b"], ["h8", "archer", "b"],
  ], "w");
  for (const promo of ["archer", "wizard", "knight", "witch"]) {
    assert.ok(findMove(s, "g7", "g8", promo), `g7-g8=${promo} is legal`);
    assert.ok(findMove(s, "g7", "h8", promo), `g7xh8=${promo} is legal`);
  }
  const m = findMove(s, "g7", "h8", "witch");
  const next = applyMove(s, m);
  const promoted = next.board[fromAlgebraic("h8").r * 8 + fromAlgebraic("h8").f];
  assert.equal(promoted.role, "witch", "soldier became a witch");
  assert.equal(promoted.hero, PLAIN.witch, "promoted piece takes the equipped witch hero");
  assert.equal(next.board[fromAlgebraic("g7").r * 8 + fromAlgebraic("g7").f], null, "origin vacated");
});

test("Dain cannot castle into check even though he castles through it", () => {
  // Black queen g6 attacks g1 (destination) down the file but not f1.
  const dain = { ...PLAIN, warlord: "dain-ironlord" };
  const s = handBuilt([
    ["e1", "warlord", "w"], ["h1", "archer", "w"], ["a1", "archer", "w"],
    ["e8", "warlord", "b"], ["g6", "witch", "b"],
  ], "w", dain, PLAIN);
  assert.ok(engine.isSquareAttacked(s, fromAlgebraic("g1"), "b"), "g1 is attacked");
  assert.ok(!engine.isSquareAttacked(s, fromAlgebraic("f1"), "b"), "f1 is safe");
  assert.equal(legalMoves(s).filter((m) => m.castle === "K").length, 0, "no castling into check");
});

test("Liana's archers pass a friendly piece but never land on it", () => {
  const liana = { ...PLAIN, archer: "liana-longshot" };
  const s = handBuilt([
    ["g1", "warlord", "w"], ["a1", "archer", "w"], ["a3", "soldier", "w"],
    ["h8", "warlord", "b"], ["a5", "soldier", "b"],
  ], "w", liana, PLAIN);
  assert.ok(hasMove(s, "a1", "a4"), "slides past the friendly soldier to a4");
  assert.ok(hasMove(s, "a1", "a5"), "captures beyond the friendly soldier");
  assert.ok(!hasMove(s, "a1", "a3"), "cannot land on the friendly soldier");
  // Attack detection matches: the archer attacks through its own soldier.
  const s2 = handBuilt([
    ["g1", "warlord", "w"], ["a1", "archer", "w"], ["a3", "soldier", "w"],
    ["h8", "warlord", "b"], ["a5", "warlord", "b"],
  ], "w", liana, PLAIN);
  assert.ok(isCheck(s2, "b"), "black warlord on a5 is in check through the friendly soldier");
});

test("Sabine's wizards pass exactly one piece on a diagonal", () => {
  const sabine = { ...PLAIN, wizard: "sabine-voidseer" };
  const s = handBuilt([
    ["g1", "warlord", "w"], ["c1", "wizard", "w"],
    ["h8", "warlord", "b"], ["d2", "soldier", "b"], ["e3", "soldier", "b"],
  ], "w", sabine, PLAIN);
  assert.ok(hasMove(s, "c1", "e3"), "captures past the one piece on d2");
  assert.ok(hasMove(s, "c1", "d2"), "captures the piece itself");
  assert.ok(!hasMove(s, "c1", "f4"), "cannot pass two pieces to reach f4");
});

test("Roland's warlord cannot jump over a piece to use its range", () => {
  const s = handBuilt([
    ["e1", "warlord", "w"], ["e2", "soldier", "w"], ["e8", "warlord", "b"],
  ], "w", STARTERS, PLAIN);
  assert.ok(!hasMove(s, "e1", "e3"), "friendly soldier on e2 blocks the 2-square stride");
  assert.ok(!hasMove(s, "e1", "e2"), "cannot land on a friendly soldier");
  const s2 = handBuilt([
    ["e1", "warlord", "w"], ["e2", "soldier", "b"], ["e8", "warlord", "b"],
  ], "w", STARTERS, PLAIN);
  assert.ok(hasMove(s2, "e1", "e2"), "captures the blocking enemy soldier");
  assert.ok(!hasMove(s2, "e1", "e3"), "still cannot jump past it to e3");
});

test("Aurora's two-square march sets en passant, and it can be captured", () => {
  const aurora = { ...STARTERS, soldier: "aurora-dawnblade" };
  // Black soldier sits beside the DESTINATION (d6), as in classic e.p.
  const s = handBuilt([
    ["e1", "warlord", "w"], ["e4", "soldier", "w"],
    ["e8", "warlord", "b"], ["d6", "soldier", "b"],
  ], "w", aurora, PLAIN);
  assert.ok(hasMove(s, "e4", "e6"), "marches two squares from a non-start rank");
  const m = findMove(s, "e4", "e6");
  const s2 = applyMove(s, m);
  assert.equal(s2.ep, fromAlgebraic("e5").r * 8 + fromAlgebraic("e5").f, "ep square is the skipped e5");
  assert.ok(hasMove(s2, "d6", "e5"), "black captures en passant");
  const epm = findMove(s2, "d6", "e5");
  assert.ok(epm.enPassant, "flagged as en passant");
  const s3 = applyMove(s2, epm);
  assert.equal(s3.board[fromAlgebraic("e6").r * 8 + fromAlgebraic("e6").f], null, "marched soldier is removed");
  assert.equal(s3.board[fromAlgebraic("e5").r * 8 + fromAlgebraic("e5").f].role, "soldier", "capturer lands on e5");
});

test("doMove/undoMove perfectly restores state (castling, en passant, promotion)", () => {
  const positions = [
    // Both castles available.
    handBuilt([["e1", "warlord", "w"], ["a1", "archer", "w"], ["h1", "archer", "w"], ["e8", "warlord", "b"]], "w"),
    // En passant available.
    handBuilt([["e1", "warlord", "w"], ["e5", "soldier", "w"], ["e8", "warlord", "b"], ["d5", "soldier", "b"]],
      "w", PLAIN, PLAIN, fromAlgebraic("d6").r * 8 + fromAlgebraic("d6").f),
    // Promotions available (quiet + capture).
    handBuilt([["e1", "warlord", "w"], ["g7", "soldier", "w"], ["e8", "warlord", "b"], ["h8", "archer", "b"]], "w"),
  ];
  for (const s of positions) {
    for (const m of legalMoves(s)) {
      const before = snapshotState(s);
      const undo = engine.doMove(s, m);
      engine.undoMove(s, m, undo);
      assert.equal(snapshotState(s), before, `undo restores state after ${m.piece} ${toAlgebraic(m.from)}-${toAlgebraic(m.to)}`);
    }
  }
  // Seeded random games: every do/undo round-trips, fast and slow agree.
  const rand = rng(20261109);
  const bands = [PLAIN, STARTERS];
  for (let game = 0; game < 4; game++) {
    let g = createGame(bands[game % 2], bands[(game + 1) % 2]);
    for (let ply = 0; ply < 120 && gameStatus(g) === "active"; ply++) {
      const fast = engine.legalMovesFast(g);
      const slow = legalMoves(g);
      assert.deepEqual(
        new Set(fast.map(moveKey)), new Set(slow.map(moveKey)),
        `legalMoves vs legalMovesFast agree (game ${game} ply ${ply})`
      );
      assert.ok(fast.length > 0, "active position has legal moves");
      const m = fast[Math.floor(rand() * fast.length)];
      const before = snapshotState(g);
      const undo = engine.doMove(g, m);
      assert.equal(isCheck(g, m.color), false, "no move leaves the mover's warlord in check");
      engine.undoMove(g, m, undo);
      assert.equal(snapshotState(g), before, `undo restores state (game ${game} ply ${ply})`);
      g = applyMove(g, m);
    }
  }
});
