// Conway's rules on sets of "x,y" keys. The plane is unbounded; puzzles then
// check that everything stays inside their board, so no hidden cells matter.

export const key = (x, y) => x + "," + y;
export const parse = (k) => { const i = k.indexOf(","); return [+k.slice(0, i), +k.slice(i + 1)]; };

export function fromList(list) { return new Set(list.map(([x, y]) => key(x, y))); }
export function toList(cells) { return [...cells].map(parse).sort((a, b) => a[1] - b[1] || a[0] - b[0]); }

export function neighbours(cells, x, y) {
  let n = 0;
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      if ((dx || dy) && cells.has(key(x + dx, y + dy))) n++;
  return n;
}

export function step(cells) {
  const counts = new Map();
  for (const k of cells) {
    const [x, y] = parse(k);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nk = key(x + dx, y + dy);
        counts.set(nk, (counts.get(nk) || 0) + 1);
      }
  }
  const next = new Set();
  for (const [k, n] of counts) if (n === 3 || (n === 2 && cells.has(k))) next.add(k);
  return next;
}

export function inBoard(cells, size) {
  for (const k of cells) {
    const [x, y] = parse(k);
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
  }
  return true;
}

export function sameCells(a, b) {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}

// What happens to each cell between two boards.
export function outcome(before, after) {
  const survive = new Set(), die = new Set(), born = new Set();
  for (const k of before) (after.has(k) ? survive : die).add(k);
  for (const k of after) if (!before.has(k)) born.add(k);
  return { survive, die, born };
}

// Same key for a shape however it's moved, rotated or mirrored.
export function shapeKey(cells) {
  const pts = [...cells].map(parse);
  let best = null;
  for (let r = 0; r < 8; r++) {
    const p = pts.map(([x, y]) => {
      let a = x, b = y;
      for (let i = 0; i < r % 4; i++) [a, b] = [-b, a];
      return [r >= 4 ? -a : a, b];
    });
    const mx = Math.min(...p.map((q) => q[0])), my = Math.min(...p.map((q) => q[1]));
    const form = p.map(([a, b]) => `${a - mx},${b - my}`).sort().join(" ");
    if (best === null || form < best) best = form;
  }
  return best;
}
