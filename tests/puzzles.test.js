import { test } from "node:test";
import assert from "node:assert/strict";
import { TUTORIAL, fromTutorial, levelPuzzle, levelConfig, dailyPuzzle, rushPuzzle, makeBefore, grade } from "../www/js/puzzles.js";
import { fromList, step, inBoard, sameCells } from "../www/js/life.js";

test("Life rules: blinker flips, block stays", () => {
  assert.ok(sameCells(step(fromList([[1, 0], [1, 1], [1, 2]])), fromList([[0, 1], [1, 1], [2, 1]])));
  const block = fromList([[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.ok(sameCells(step(block), block));
});

test("tutorial levels teach the intended rule and stay on the board", () => {
  const p = TUTORIAL.map(fromTutorial);
  const n = (i, t) => p[i].answer[t].length;
  assert.deepEqual([n(0, "survive"), n(0, "die"), n(0, "born")], [4, 0, 0]);   // survive only
  assert.ok(n(1, "die") >= 1 && n(1, "born") === 0);                            // lonely death
  assert.ok(n(2, "born") >= 1 && n(2, "die") === 0);                            // birth
  assert.ok(n(3, "die") >= 1);                                                  // crowding
  assert.ok(n(4, "survive") && n(4, "die") && n(4, "born"));                    // all three
  for (const q of p) assert.ok(inBoard(new Set(q.frames[1]), q.size));
});

test("generated levels are deterministic, fair and not boring", () => {
  for (let level = 6; level <= 120; level++) {
    const a = levelPuzzle(level, 0), b = levelPuzzle(level, 0);
    assert.deepEqual(a, b, `level ${level} not deterministic`);
    const cfg = levelConfig(level);
    if (a.kind === "before") {
      const target = new Set(a.target);
      const right = a.options.filter((o) => sameCells(step(new Set(o)), target));
      assert.equal(right.length, 1, `level ${level}: exactly one correct option`);
      assert.ok(sameCells(step(new Set(a.options[a.answer])), target));
      continue;
    }
    assert.equal(a.size, cfg.size);
    for (const f of a.frames) assert.ok(inBoard(new Set(f), a.size) && f.length > 0);
    const changes = a.answer.die.length + a.answer.born.length;
    assert.ok(changes >= cfg.minChanges && changes <= cfg.maxChanges, `level ${level}: ${changes} changes`);
    assert.ok(!sameCells(new Set(a.frames[0]), new Set(a.frames.at(-1))));
  }
});

test("daily puzzle depends only on the date", () => {
  assert.deepEqual(dailyPuzzle("2026-11-22"), dailyPuzzle("2026-11-22"));
  assert.notDeepEqual(dailyPuzzle("2026-11-22").frames, dailyPuzzle("2026-11-23").frames);
});

test("rush puzzles generate quickly", () => {
  const t = Date.now();
  for (let i = 0; i < 40; i++) assert.equal(rushPuzzle("run", i).kind, "predict");
  assert.ok(Date.now() - t < 2000);
});

test("grading counts wrong, missed and false births", () => {
  const p = fromTutorial(TUTORIAL[4]);   // blinker
  const perfect = new Map();
  for (const k of p.answer.survive) perfect.set(k, "survive");
  for (const k of p.answer.die) perfect.set(k, "die");
  for (const k of p.answer.born) perfect.set(k, "born");
  assert.equal(grade(p, perfect).stars, 3);
  const one = new Map(perfect); one.delete(p.answer.born[0]);
  assert.deepEqual([grade(p, one).mistakes, grade(p, one).stars], [1, 2]);
  const extra = new Map(perfect); extra.set("0,0", "born");
  assert.equal(grade(p, extra).mistakes, 1);
});
