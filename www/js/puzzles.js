// Puzzle generation. Every puzzle comes from a seed, so it can be rebuilt
// exactly (the daily puzzle uses the date as its seed).
import { makeRng } from "./rng.js";
import { key, parse, fromList, step, inBoard, sameCells, outcome, neighbours, shapeKey } from "./life.js";

// ---------- Difficulties ----------
// size: board width · area: the centred square where white blocks are placed
// live: how many white blocks (density) · changes: cells that die or are born
// slack: mistakes allowed per star (2★ ≤ slack, 1★ ≤ 2×slack)
export const DIFFICULTIES = [
  { id: "very-easy", name: "Very easy", size: 5, area: 3, live: [3, 4], changes: [1, 3], slack: 1 },
  { id: "easy", name: "Easy", size: 6, area: 4, live: [4, 6], changes: [2, 5], slack: 1 },
  { id: "medium", name: "Medium", size: 7, area: 5, live: [6, 9], changes: [4, 8], slack: 1 },
  { id: "hard", name: "Hard", size: 8, area: 6, live: [9, 13], changes: [7, 12], slack: 2 },
  { id: "very-hard", name: "Very hard", size: 9, area: 7, live: [13, 18], changes: [10, 16], slack: 3 },
  { id: "extreme", name: "Extreme", size: 10, area: 8, live: [18, 26], changes: [14, 24], slack: 3 },
];
export const difficulty = (id) => DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];

// ---------- Tutorial: one rule at a time ----------
export const TUTORIAL = [
  { title: "Survive", size: 5, cells: [[1, 1], [2, 1], [1, 2], [2, 2]] },
  { title: "Lonely cells die", size: 5, cells: [[0, 0], [1, 0], [0, 1], [1, 1], [3, 3]] },
  { title: "Birth", size: 5, cells: [[1, 1], [2, 1], [1, 2]] },
  { title: "Crowded cells die", size: 5, cells: [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]] },
  { title: "Put it together", size: 5, cells: [[2, 1], [2, 2], [2, 3]] },
];

// ---------- Board generation ----------
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Grows 1–3 connected clumps inside the centred area, so boards look like
// shapes, not scattered dots. The area leaves a 1-cell border, so births
// always stay on the board.
function randomPattern(rng, cfg) {
  const lo = Math.floor((cfg.size - cfg.area) / 2), hi = lo + cfg.area;   // cells live in [lo, hi)
  const [minLive, maxLive] = cfg.live;
  const want = minLive + rng.int(maxLive - minLive + 1);
  const blobs = 1 + rng.int(cfg.area >= 6 ? 3 : 2);
  const cells = new Set();
  for (let b = 0; b < blobs; b++) {
    const blob = [[lo + rng.int(hi - lo), lo + rng.int(hi - lo)]];
    cells.add(key(...blob[0]));
    const target = Math.ceil((want - cells.size) / (blobs - b)) + cells.size;
    for (let t = 0; t < 80 && cells.size < target; t++) {
      const [x, y] = blob[rng.int(blob.length)];
      const [dx, dy] = DIRS[rng.int(rng.chance(0.65) ? 4 : 8)];   // mostly orthogonal growth
      const nx = x + dx, ny = y + dy;
      if (nx < lo || ny < lo || nx >= hi || ny >= hi || cells.has(key(nx, ny))) continue;
      cells.add(key(nx, ny));
      blob.push([nx, ny]);
    }
  }
  return cells;
}

const lonelyCells = (cells) => [...cells].filter((k) => { const [x, y] = parse(k); return neighbours(cells, x, y) === 0; }).length;

// Rejects boring or off-spec boards: wrong number of blocks, nothing changes,
// mostly lonely cells, or (with 3+ changes) not all three outcomes to think about.
function acceptable(start, next, cfg) {
  if (start.size < cfg.live[0] || start.size > cfg.live[1]) return null;
  if (!next.size || !inBoard(next, cfg.size) || sameCells(start, next)) return null;
  if (lonelyCells(start) > 1) return null;
  const o = outcome(start, next);
  const changes = o.die.size + o.born.size;
  if (changes < cfg.changes[0] || changes > cfg.changes[1]) return null;
  if (changes >= 3 && (!o.survive.size || !o.die.size || !o.born.size)) return null;
  return o;
}

// `avoid`: shape keys of recent puzzles, so the same shape doesn't come back
// (even rotated or moved).
export function makePuzzle(seed, cfg, avoid = new Set()) {
  const rng = makeRng(seed);
  for (let tries = 0; tries < 6000; tries++) {
    const start = randomPattern(rng, cfg);
    if (avoid.has(shapeKey(start))) continue;
    const next = step(start);
    if (acceptable(start, next, cfg)) return build(start, next, cfg.size, cfg.slack);
  }
  return fromTutorial(TUTORIAL[4]);   // never expected; keeps the game playable
}

function build(start, next, size, slack = 1) {
  const o = outcome(start, next);
  return {
    size, slack,
    frames: [[...start], [...next]],
    answer: { survive: [...o.survive], die: [...o.die], born: [...o.born] },
  };
}

export function fromTutorial(t) {
  const start = fromList(t.cells);
  return { ...build(start, step(start), t.size), title: t.title };
}

export const puzzleShape = (p) => shapeKey(new Set(p.frames[0]));
export const dailyPuzzle = (dateStr) => makePuzzle(`daily-${dateStr}`, difficulty("medium"));

// Rush starts very easy and gets harder as you go.
export const rushConfig = (index) => difficulty(index < 5 ? "very-easy" : index < 12 ? "easy" : "medium");

// ---------- Endless: one pattern, step after step ----------
// The board edge is a wall: cells outside it never exist.
export const ENDLESS_SIZE = 8;
export const ENDLESS_SLACK = 2;

export function stepWalled(cells, size) {
  const next = step(cells);
  for (const k of next) {
    const [x, y] = parse(k);
    if (x < 0 || y < 0 || x >= size || y >= size) next.delete(k);
  }
  return next;
}

const signature = (cells) => [...cells].sort().join(";");

// How many steps a pattern keeps changing before it dies or repeats itself.
export function lifetime(cells, size, cap = 60) {
  const seen = new Set([signature(cells)]);
  let c = cells;
  for (let g = 0; g < cap; g++) {
    const next = stepWalled(c, size);
    const sig = signature(next);
    if (!next.size || seen.has(sig)) return g;
    seen.add(sig);
    c = next;
  }
  return cap;
}

// Picks a starting pattern that evolves for a long time (30–60 steps).
export function endlessStart(seed, size = ENDLESS_SIZE) {
  const rng = makeRng(seed);
  let best = null;
  for (let tries = 0, found = 0; tries < 400 && found < 6; tries++) {
    const cells = new Set();
    const want = Math.round(size * size * (0.2 + rng.next() * 0.12));
    for (let t = 0; t < 400 && cells.size < want; t++) cells.add(key(1 + rng.int(size - 2), 1 + rng.int(size - 2)));
    if (lonelyCells(cells) > 2) continue;
    const life = lifetime(cells, size);
    if (!best || life > best.life) best = { cells, life };
    if (life >= 30) found++;
  }
  return best.cells;
}

// One Endless round: predict the next step of `cells`. Null when the pattern has died out.
export function endlessRound(cells, size = ENDLESS_SIZE) {
  const next = stepWalled(cells, size);
  if (!next.size) return null;
  return build(cells, next, size, ENDLESS_SLACK);
}

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
    // Live cells count as surviving unless marked: an unmarked survivor is right
    // (no badge needed); green on a survivor is right too.
    if (t === "survive" && !m) continue;
    cells.set(k, m === t ? "ok" : m ? "wrong" : "missed");
  }
  for (const [k, m] of marks) if (!truth.has(k)) cells.set(k, "wrong");   // false birth
  let mistakes = 0;
  for (const v of cells.values()) if (v !== "ok") mistakes++;
  return { cells, mistakes, stars: starsFor(mistakes, puzzle.slack || 1) };
}

export function starsFor(mistakes, slack = 1) {
  if (mistakes === 0) return 3;
  if (mistakes <= slack) return 2;
  if (mistakes <= 2 * slack) return 1;
  return 0;
}
