// Puzzle generation. Every puzzle comes from a seed, so it can be rebuilt
// exactly (daily puzzle = date seed, levels = level + attempt seed).
import { makeRng } from "./rng.js";
import { key, parse, fromList, step, inBoard, sameCells, outcome, neighbours } from "./life.js";

// ---------- Tutorial: one rule at a time ----------
export const TUTORIAL = [
  {
    title: "Survive",
    hint: "A live cell with <b>2 or 3</b> live neighbours <b>survives</b>. Tap each white cell until it's 🟢.",
    size: 5, cells: [[1, 1], [2, 1], [1, 2], [2, 2]],
  },
  {
    title: "Lonely cells die",
    hint: "A live cell with <b>0 or 1</b> live neighbours <b>dies</b>. Tap a white cell twice for 🔴.",
    size: 5, cells: [[0, 0], [1, 0], [0, 1], [1, 1], [3, 3]],
  },
  {
    title: "Birth",
    hint: "An empty cell with <b>exactly 3</b> live neighbours is <b>born</b>. Tap an empty cell for 🟡.",
    size: 5, cells: [[1, 1], [2, 1], [1, 2]],
  },
  {
    title: "Crowded cells die",
    hint: "A live cell with <b>4 or more</b> live neighbours <b>dies</b> too. Count carefully!",
    size: 5, cells: [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]],
  },
  {
    title: "Put it together",
    hint: "Use all three rules: what survives 🟢, what dies 🔴, and what is born 🟡?",
    size: 5, cells: [[2, 1], [2, 2], [2, 3]],
  },
];

// ---------- Difficulty curve ----------
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

export function levelConfig(level) {
  if (level <= TUTORIAL.length) return { type: "tutorial" };
  if (level <= 15) return predict(5, 1, 2, 5, (level - 6) / 9);
  if (level <= 30) return predict(6, 1, 4, 8, (level - 16) / 14);
  if (level <= 50) {
    if (level % 4 === 0) return predict(5, 2, 2, 6, (level - 31) / 19);
    return predict(7, 1, 6, 11, (level - 31) / 19);
  }
  if (level % 5 === 0) return { type: "before", size: 6, minChanges: 3, maxChanges: 8 };
  if (level % 3 === 0) return predict(6, 2, 3, 8, (level - 51) / 50);
  return predict(8, 1, 8, 15, (level - 51) / 50);
}

function predict(size, steps, minChanges, maxChanges, t) {
  return { type: "predict", size, steps, minChanges, maxChanges, target: lerp(minChanges, maxChanges, t) };
}

export const DAILY_CONFIG = predict(6, 1, 5, 9, 0.5);

export function rushConfig(index) {
  if (index < 4) return predict(5, 1, 2, 4, index / 4);
  if (index < 10) return predict(5, 1, 3, 6, (index - 4) / 6);
  return predict(6, 1, 4, 8, (index - 10) / 10);
}

// ---------- Generators ----------
function randomPattern(rng, size) {
  const margin = size >= 6 ? 1 : 0;
  const lo = margin, hi = size - margin;          // fill [lo, hi)
  const density = 0.25 + rng.next() * 0.2;
  const cells = new Set();
  for (let y = lo; y < hi; y++)
    for (let x = lo; x < hi; x++)
      if (rng.chance(density)) cells.add(key(x, y));
  return cells;
}

// How hard a puzzle feels: more changes, more births (harder to spot) and
// more crowding (more counting) all make it harder.
export function difficulty(start, end) {
  const o = outcome(start, end);
  let crowd = 0;
  for (const k of start) { const [x, y] = parse(k); crowd += neighbours(start, x, y); }
  crowd = start.size ? crowd / start.size : 0;
  const changes = o.die.size + o.born.size;
  return { changes, births: o.born.size, crowd, score: changes + 0.5 * o.born.size + 0.4 * crowd };
}

function frames(start, steps, size) {
  const out = [start];
  for (let i = 0; i < steps; i++) {
    const next = step(out[out.length - 1]);
    if (!next.size || !inBoard(next, size)) return null;
    out.push(next);
  }
  return out;
}

// Rejects boring boards: too small, dies out, or nothing changes.
function acceptable(fr, cfg) {
  const start = fr[0], end = fr[fr.length - 1];
  if (start.size < 3) return null;
  if (sameCells(start, end)) return null;
  for (let i = 1; i < fr.length; i++) if (sameCells(fr[i - 1], fr[i])) return null;
  const d = difficulty(start, end);
  if (d.changes < cfg.minChanges || d.changes > cfg.maxChanges) return null;
  return d;
}

export function makePredict(seed, cfg) {
  const rng = makeRng(seed);
  let best = null;
  const target = cfg.target ?? (cfg.minChanges + cfg.maxChanges) / 2;
  for (let tries = 0, found = 0; tries < 3000 && found < 24; tries++) {
    const start = randomPattern(rng, cfg.size);
    const fr = frames(start, cfg.steps, cfg.size);
    if (!fr) continue;
    const d = acceptable(fr, cfg);
    if (!d) continue;
    found++;
    const dist = Math.abs(d.changes - target) + d.score * 0.01;
    if (!best || dist < best.dist) best = { fr, d, dist };
  }
  if (!best) return fromTutorial(TUTORIAL[4]);       // never expected; keeps the game playable
  return build(best.fr, cfg.size, cfg.steps, best.d);
}

export function fromTutorial(t) {
  const start = fromList(t.cells);
  const fr = frames(start, 1, t.size);
  return { ...build(fr, t.size, 1, difficulty(fr[0], fr[1])), title: t.title, hint: t.hint };
}

function build(fr, size, steps, d) {
  const start = fr[0], end = fr[fr.length - 1];
  const o = outcome(start, end);
  return {
    kind: "predict", size, steps,
    frames: fr.map((s) => [...s]),
    answer: { survive: [...o.survive], die: [...o.die], born: [...o.born] },
    difficulty: d,
  };
}

// "Which of these 4 boards came before this one?"
export function makeBefore(seed, cfg) {
  const rng = makeRng(seed);
  for (let tries = 0; tries < 3000; tries++) {
    const start = randomPattern(rng, cfg.size);
    const fr = frames(start, 1, cfg.size);
    if (!fr || !acceptable(fr, cfg)) continue;
    const target = fr[1];
    const options = [start];
    for (let t = 0; t < 400 && options.length < 4; t++) {
      const d = new Set(start);
      const flips = 1 + rng.int(2);
      for (let f = 0; f < flips; f++) {
        const k = key(rng.int(cfg.size), rng.int(cfg.size));
        d.has(k) ? d.delete(k) : d.add(k);
      }
      if (d.size < 3) continue;
      if (sameCells(step(d), target)) continue;            // must not also be a right answer
      if (options.some((o) => sameCells(o, d))) continue;
      options.push(d);
    }
    if (options.length < 4) continue;
    const order = rng.shuffle([0, 1, 2, 3]);
    return {
      kind: "before", size: cfg.size,
      target: [...target],
      options: order.map((i) => [...options[i]]),
      answer: order.indexOf(0),
    };
  }
  return null;
}

export function makePuzzle(seed, cfg) {
  if (cfg.type === "before") return makeBefore(seed, cfg) || makePredict(seed, predict(6, 1, 3, 8, 0.5));
  return makePredict(seed, cfg);
}

export function levelPuzzle(level, attempt = 0) {
  const cfg = levelConfig(level);
  if (cfg.type === "tutorial") return fromTutorial(TUTORIAL[level - 1]);
  return makePuzzle(`level-${level}-${attempt}`, cfg);
}

export const dailyPuzzle = (dateStr) => makePredict(`daily-${dateStr}`, DAILY_CONFIG);
export const rushPuzzle = (runSeed, index) => makePredict(`rush-${runSeed}-${index}`, rushConfig(index));

// ---------- Scoring ----------
// marks: Map<"x,y", "survive" | "die" | "born">
export function grade(puzzle, marks) {
  const ans = puzzle.answer;
  const truth = new Map();
  for (const k of ans.survive) truth.set(k, "survive");
  for (const k of ans.die) truth.set(k, "die");
  for (const k of ans.born) truth.set(k, "born");
  const cells = new Map();          // "x,y" -> "ok" | "wrong" | "missed"
  for (const [k, t] of truth) {
    const m = marks.get(k);
    cells.set(k, m === t ? "ok" : m ? "wrong" : "missed");
  }
  for (const [k, m] of marks) if (!truth.has(k)) cells.set(k, "wrong");   // false birth
  let mistakes = 0;
  for (const v of cells.values()) if (v !== "ok") mistakes++;
  return { cells, mistakes, stars: starsFor(mistakes) };
}

export const starsFor = (mistakes) => (mistakes === 0 ? 3 : mistakes === 1 ? 2 : mistakes === 2 ? 1 : 0);
