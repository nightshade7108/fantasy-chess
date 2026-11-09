// Training lesson tests: every step's setup is legal, the accepted move
// exists, and predicates hold after applying it. Run with:
//   node --test tests/lessons.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../server/engine");
const { LESSONS, buildStepState, moveMatchesAccept, checkPredicate } = require("../server/data/lessons");

test("every lesson step is solvable as specified", () => {
  for (const lesson of LESSONS) {
    assert.ok(lesson.steps.length >= 1, `lesson ${lesson.id} has steps`);
    for (let i = 0; i < lesson.steps.length; i++) {
      const step = lesson.steps[i];
      const state = buildStepState(step);
      assert.equal(state.turn, "w", `lesson ${lesson.id} step ${i}: white to move`);
      const moves = engine.legalMoves(state);
      const accepted = moves.filter((m) => moveMatchesAccept(m, step.accept));
      assert.ok(accepted.length >= 1,
        `lesson ${lesson.id} step ${i}: accept move ${step.accept.from}-${step.accept.to} must be legal`);
      const move = accepted.find((m) => m.castle) || accepted.find((m) => m.enPassant) || accepted[0];
      const next = engine.applyMove(state, move);
      assert.ok(checkPredicate(next, move, step.accept),
        `lesson ${lesson.id} step ${i}: predicate ${step.accept.predicate} must hold after the move`);
    }
  }
});

test("lesson unlock thresholds", () => {
  const byId = Object.fromEntries(LESSONS.map((l) => [l.id, l.minScore]));
  assert.deepEqual(byId, { 1: 0, 2: 0, 3: 0, 4: 2, 5: 4, 6: 6 });
});
