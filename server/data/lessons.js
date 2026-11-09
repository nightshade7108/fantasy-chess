// Fantasy Chess — Training Grounds lessons (Coach Pell).
// Each lesson is a sequence of steps. A step sets up a board position,
// optionally auto-plays a black move, then asks the player for a move.
// `accept` is either an exact {from, to, promotion?} or a predicate
// evaluated on the position after the player's move:
//   checkmate — the enemy warlord is checkmated
//   promoted  — the move promoted a soldier
//   castled   — the move castled
//   captured  — the move captured a piece
// Positions were checked against the engine (see tests/lessons.test.js).
// Lesson unlocks use the team score (rarity points + 1 per Lv 3+ hero).

const { STARTERS } = require("./heroes");

const LESSONS = [
  {
    id: 1,
    title: "How Each Hero Moves",
    minScore: 0,
    text: "Every hero fights like a chess piece with a twist. Soldiers march like pawns, archers shoot like rooks, wizards glide like bishops, knights leap like knights, witches sweep like queens, and your warlord commands like a king. Learn each hero's stride before you spend a single coin.",
    steps: [
      {
        instruction: "Slide your archer from a1 to a4, straight up the file.",
        pieces: [
          ["warlord", "w", "e1"], ["witch", "w", "d1"], ["archer", "w", "a1"],
          ["wizard", "w", "c1"], ["knight", "w", "b1"], ["soldier", "w", "e2"],
          ["warlord", "b", "e8"], ["soldier", "b", "e7"], ["soldier", "b", "d7"],
        ],
        accept: { from: "a1", to: "a4" },
      },
      {
        instruction: "Leap your knight from b1 to c3 — knights jump clean over the line.",
        pieces: [
          ["warlord", "w", "e1"], ["witch", "w", "d1"], ["archer", "w", "a1"],
          ["wizard", "w", "c1"], ["knight", "w", "b1"], ["soldier", "w", "e2"],
          ["warlord", "b", "e8"], ["soldier", "b", "e7"], ["soldier", "b", "d7"],
        ],
        accept: { from: "b1", to: "c3" },
      },
      {
        instruction: "Glide your wizard from c1 to g5, along the diagonal.",
        pieces: [
          ["warlord", "w", "e1"], ["witch", "w", "d1"], ["archer", "w", "a1"],
          ["wizard", "w", "c1"], ["knight", "w", "b1"], ["soldier", "w", "e2"],
          ["warlord", "b", "e8"], ["soldier", "b", "e7"], ["soldier", "b", "d7"],
        ],
        accept: { from: "c1", to: "g5" },
      },
    ],
  },
  {
    id: 2,
    title: "Captures & Trades",
    minScore: 0,
    text: "A capture is only good if the trade favors you. Count the power of what you take against what you lose — and remember, a hero's ability can turn a bad trade into a brilliant one.",
    steps: [
      {
        instruction: "Your soldier on e4 can take the black witch on d5 — a witch for a soldier. Take it.",
        pieces: [
          ["warlord", "w", "e1"], ["witch", "w", "d1"], ["soldier", "w", "e4"], ["archer", "w", "a1"],
          ["warlord", "b", "e8"], ["witch", "b", "d5"], ["soldier", "b", "e5"], ["archer", "b", "a8"],
        ],
        accept: { from: "e4", to: "d5" },
      },
    ],
  },
  {
    id: 3,
    title: "Check & Checkmate",
    minScore: 0,
    text: "Check means the enemy warlord is under attack. It must be answered: move the warlord, capture the attacker, or block the line. Checkmate is check with no answer — and that ends the battle.",
    steps: [
      {
        instruction: "Your witch stands on f7 beside the black warlord on h8. Play witch to g7 — checkmate.",
        pieces: [
          ["warlord", "w", "g6"], ["witch", "w", "f7"],
          ["warlord", "b", "h8"],
        ],
        accept: { from: "f7", to: "g7", predicate: "checkmate" },
      },
    ],
  },
  {
    id: 4,
    title: "Castling & the Warlord's Gifts",
    minScore: 2,
    text: "Castling tucks your warlord behind the archer and brings the archer into play. Some warlords castle through attacked squares or even after moving — know your warlord's gift before you need it.",
    steps: [
      {
        instruction: "Your warlord and archer have never moved, and the squares between them are clear. Castle kingside.",
        pieces: [
          ["warlord", "w", "e1"], ["archer", "w", "h1"], ["archer", "w", "a1"],
          ["knight", "w", "f3"], ["wizard", "w", "c4"], ["soldier", "w", "e2"],
          ["warlord", "b", "e8"], ["soldier", "b", "e7"],
        ],
        accept: { from: "e1", to: "g1", predicate: "castled" },
      },
    ],
  },
  {
    id: 5,
    title: "Promotion & En Passant",
    minScore: 4,
    text: "March a soldier to the far rank and it promotes — choose a witch, archer, wizard or knight. And if an enemy soldier marches two squares past yours, you may capture it as if it had only marched one: en passant.",
    steps: [
      {
        instruction: "March your soldier from a7 to a8 and promote it to a witch.",
        pieces: [
          ["soldier", "w", "a7"], ["warlord", "w", "e1"],
          ["warlord", "b", "e8"], ["soldier", "b", "h7"],
        ],
        accept: { from: "a7", to: "a8", promotion: "witch", predicate: "promoted" },
      },
      {
        instruction: "The black soldier just marched two squares, d7 to d5, past yours. Capture it en passant: e5 takes d6.",
        pieces: [
          ["soldier", "w", "e5"], ["warlord", "w", "e1"],
          ["soldier", "b", "d7"], ["warlord", "b", "e8"],
        ],
        blackMove: { from: "d7", to: "d5" },
        accept: { from: "e5", to: "d6" },
      },
    ],
  },
  {
    id: 6,
    title: "Forks, Pins & Mate in One",
    minScore: 6,
    text: "The advanced arts: fork two pieces with one move, pin a piece to its warlord so it cannot move, skewer a line to win the piece behind. Finish with a mate-in-one drill — one move, one crown.",
    steps: [
      {
        instruction: "Leap your knight from e4 to d6 — it attacks the black warlord on e8 and the black witch on c8 at once. A royal fork.",
        pieces: [
          ["knight", "w", "e4"], ["warlord", "w", "e1"],
          ["warlord", "b", "e8"], ["witch", "b", "c8"], ["soldier", "b", "e7"],
        ],
        accept: { from: "e4", to: "d6" },
      },
      {
        instruction: "Your witch on h6 can take the soldier on g7 — and the black warlord has nowhere to run. Mate in one.",
        pieces: [
          ["witch", "w", "h6"], ["soldier", "w", "f6"], ["warlord", "w", "e1"],
          ["warlord", "b", "h8"], ["soldier", "b", "g7"], ["soldier", "b", "f7"],
        ],
        accept: { from: "h6", to: "g7", predicate: "checkmate" },
      },
    ],
  },
];

module.exports = { LESSONS };

// ---- Lesson runtime helpers ----
const engine = require("../engine");

// Build the engine state for a lesson step (white to move; if the step
// has a blackMove, it is auto-played first).
function buildStepState(step) {
  const state = engine.createGame(STARTERS, STARTERS);
  state.board = new Array(64).fill(null);
  for (const [role, color, sq] of step.pieces) {
    const { r, f } = engine.fromAlgebraic(sq);
    state.board[engine.idx(r, f)] = { role, color, hero: STARTERS[role], moved: false };
  }
  state.turn = "w";
  state.castling = { wk: true, wq: true, bk: true, bq: true };
  state.ep = null;
  state.halfmove = 0;
  state.fullmove = 1;
  state.keys = [engine.positionKey(state)];
  if (step.blackMove) {
    state.turn = "b";
    const bm = engine.legalMoves(state).find(
      (m) => engine.toAlgebraic(m.from) === step.blackMove.from &&
             engine.toAlgebraic(m.to) === step.blackMove.to
    );
    if (!bm) throw new Error(`lesson blackMove ${step.blackMove.from}-${step.blackMove.to} is not legal`);
    return engine.applyMove(state, bm);
  }
  return state;
}

function moveMatchesAccept(move, accept) {
  if (engine.toAlgebraic(move.from) !== accept.from) return false;
  if (engine.toAlgebraic(move.to) !== accept.to) return false;
  if (accept.promotion && move.promotion !== accept.promotion) return false;
  return true;
}

function checkPredicate(stateAfter, move, accept) {
  if (!accept.predicate) return true;
  if (accept.predicate === "checkmate") return engine.gameStatus(stateAfter) === "checkmate";
  if (accept.predicate === "promoted") return !!move.promotion;
  if (accept.predicate === "castled") return !!move.castle;
  if (accept.predicate === "captured") return !!move.captured || !!move.enPassant;
  return true;
}

module.exports = { LESSONS, buildStepState, moveMatchesAccept, checkPredicate };
