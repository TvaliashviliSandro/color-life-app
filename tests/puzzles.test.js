import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTIES, TUTORIAL, fromTutorial, makePuzzle, dailyPuzzle, rushConfig, puzzleShape, grade, starsFor,
  endlessStart, endlessRound, lifetime, stepWalled, ENDLESS_SIZE,
} from "../www/js/puzzles.js";
import { fromList, step, inBoard, sameCells, neighbours, parse } from "../www/js/life.js";

test("Life rules: blinker flips, block stays", () => {
  assert.ok(sameCells(step(fromList([[1, 0], [1, 1], [1, 2]])), fromList([[0, 1], [1, 1], [2, 1]])));
  const block = fromList([[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.ok(sameCells(step(block), block));
});

test("tutorial boards teach the intended rule and stay on the board", () => {
  const p = TUTORIAL.map(fromTutorial);
  const n = (i, t) => p[i].answer[t].length;
  assert.deepEqual([n(0, "survive"), n(0, "die"), n(0, "born")], [4, 0, 0]);   // survive only
  assert.ok(n(1, "die") >= 1 && n(1, "born") === 0);                            // lonely death
  assert.ok(n(2, "born") >= 1 && n(2, "die") === 0);                            // birth
  assert.ok(n(3, "die") >= 1);                                                  // crowding
  assert.ok(n(4, "survive") && n(4, "die") && n(4, "born"));                    // all three
  for (const q of p) assert.ok(inBoard(new Set(q.frames[1]), q.size));
});

test("every difficulty makes puzzles that match its size, area and density", () => {
  for (const d of DIFFICULTIES) {
    const lo = Math.floor((d.size - d.area) / 2), hi = lo + d.area;
    for (let i = 0; i < 80; i++) {
      const p = makePuzzle(`${d.id}-${i}`, d);
      assert.deepEqual(p, makePuzzle(`${d.id}-${i}`, d), "same seed, same puzzle");
      assert.equal(p.size, d.size);
      const start = new Set(p.frames[0]);
      assert.ok(start.size >= d.live[0] && start.size <= d.live[1], `${d.id}: ${start.size} blocks`);
      for (const k of start) {
        const [x, y] = parse(k);
        assert.ok(x >= lo && x < hi && y >= lo && y < hi, `${d.id}: block outside its area`);
      }
      assert.ok(inBoard(new Set(p.frames[1]), d.size));
      const { survive, die, born } = p.answer;
      const changes = die.length + born.length;
      assert.ok(changes >= d.changes[0] && changes <= d.changes[1], `${d.id}: ${changes} changes`);
      if (changes >= 3) assert.ok(survive.length && die.length && born.length, `${d.id}: needs all three outcomes`);
      const lonely = [...start].filter((k) => { const [x, y] = parse(k); return neighbours(start, x, y) === 0; });
      assert.ok(lonely.length <= 1, `${d.id}: ${lonely.length} lonely cells`);
    }
  }
});

test("harder difficulties really are bigger and denser", () => {
  for (let i = 1; i < DIFFICULTIES.length; i++) {
    const a = DIFFICULTIES[i - 1], b = DIFFICULTIES[i];
    assert.ok(b.size > a.size && b.area > a.area && b.live[0] > a.live[0], `${b.id} vs ${a.id}`);
  }
});

test("avoiding recent shapes works", () => {
  const d = DIFFICULTIES[2];
  const avoid = new Set();
  for (let i = 0; i < 30; i++) {
    const p = makePuzzle(`avoid-${i}`, d, avoid);
    assert.ok(!avoid.has(puzzleShape(p)));
    avoid.add(puzzleShape(p));
  }
});

test("daily puzzle depends only on the date", () => {
  assert.deepEqual(dailyPuzzle("2026-11-22"), dailyPuzzle("2026-11-22"));
  assert.notDeepEqual(dailyPuzzle("2026-11-22").frames, dailyPuzzle("2026-11-23").frames);
});

test("rush ramps from very easy upwards", () => {
  assert.equal(rushConfig(0).id, "very-easy");
  assert.equal(rushConfig(30).id, "medium");
});

test("endless: walled board, long-lived start, rounds chain together", () => {
  // a blinker against the wall loses the half that would be outside
  assert.ok(sameCells(stepWalled(fromList([[0, 0], [0, 1], [0, 2]]), 5), fromList([[0, 1], [1, 1]])));
  for (let i = 0; i < 8; i++) {
    const start = endlessStart(`run-${i}`);
    assert.ok(inBoard(start, ENDLESS_SIZE));
    assert.ok(lifetime(start, ENDLESS_SIZE) >= 30, "start pattern evolves for at least 30 steps");
    let cells = start;
    for (let r = 0; r < 10; r++) {
      const round = endlessRound(cells);
      assert.ok(round, "pattern still alive");
      assert.ok(sameCells(new Set(round.frames[0]), cells), "each round starts from the last answer");
      cells = new Set(round.frames[1]);
    }
  }
});

test("grading counts wrong, missed and false births; stars scale with slack", () => {
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
  assert.deepEqual([0, 1, 2, 3].map((m) => starsFor(m, 1)), [3, 2, 1, 0]);

  // Live cells survive by default: leaving a survivor unmarked is right, green is right too.
  const s = p.answer.survive[0];
  const noGreen = new Map(perfect); noGreen.delete(s);
  assert.deepEqual([grade(p, noGreen).mistakes, grade(p, noGreen).cells.has(s)], [0, false]);
  // Red on a survivor is wrong; an unmarked death is a missed change.
  const killed = new Map(perfect); killed.set(s, "die");
  assert.deepEqual([grade(p, killed).cells.get(s), grade(p, killed).mistakes], ["wrong", 1]);
  const d = p.answer.die[0];
  const missedDeath = new Map(perfect); missedDeath.delete(d);
  assert.deepEqual([grade(p, missedDeath).cells.get(d), grade(p, missedDeath).mistakes], ["missed", 1]);
  // An all-survive board is solved without marking anything.
  assert.equal(grade(fromTutorial(TUTORIAL[0]), new Map()).stars, 3);
  assert.deepEqual([0, 3, 6, 7].map((m) => starsFor(m, 3)), [3, 2, 1, 0]);
});

test("shared puzzle links: round trip, sender's stars, and junk is rejected", async () => {
  const { encodePuzzle, decodePuzzle, findPuzzleCode } = await import("../www/js/puzzles.js");
  for (const d of DIFFICULTIES) {
    for (let i = 0; i < 20; i++) {
      const p = makePuzzle(`share-${d.id}-${i}`, d);
      const code = encodePuzzle(p, d.id, i % 4);
      const back = decodePuzzle(code);
      assert.ok(back, `${d.id}: decodes`);
      assert.equal(back.diffId, d.id);
      assert.equal(back.stars, i % 4);
      assert.deepEqual(new Set(back.puzzle.frames[0]), new Set(p.frames[0]), "same board");
      assert.deepEqual(new Set(back.puzzle.answer.born), new Set(p.answer.born), "same answer");
      assert.ok(/^[A-Za-z0-9._-]+$/.test(code), "URL-safe");
    }
  }
  const p = makePuzzle("x", DIFFICULTIES[3]);
  const code = encodePuzzle(p, "hard");
  assert.equal(decodePuzzle(code).stars, null, "stars are optional");
  assert.equal(findPuzzleCode(`https://example.com/app/#puzzle=${code}`), code);
  assert.equal(findPuzzleCode(`Can you solve this? https://x.y/#puzzle=${code}.3`), code + ".3");
  for (const junk of ["", "hello", "v2.1.5.AAAA", "v1.99.5.AAAA", "v1.0.5.@@@@", "v1.0.5.AA"]) assert.equal(decodePuzzle(junk), null, junk);
  // a board whose births would land outside the edge is refused
  const edge = encodePuzzle({ size: 5, frames: [["0,0", "1,0", "2,0"]] }, "very-easy");
  assert.equal(decodePuzzle(edge), null);
});
