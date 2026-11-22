// After a puzzle: zoom out from the board and let the pattern play on,
// so you can see where it was heading.
import { parse, step } from "./life.js";

const MAX_STEPS = 300;
const STEP_MS = 150;
const signature = (cells) => [...cells].sort().join(";");

export function createSim(canvas, caption) {
  const ctx = canvas.getContext("2d");
  let raf = 0, run = null, last = null;

  function colors() {
    const css = getComputedStyle(document.documentElement);
    const v = (n) => css.getPropertyValue("--" + n).trim();
    return { bg: v("panel"), grid: v("raised"), live: v("live"), accent: v("accent"), born: v("born") };
  }

  function stop() {
    cancelAnimationFrame(raf);
    run = null;
  }

  // cells: Set of "x,y" on a size×size board. The board starts filling the canvas.
  function play(cells, size) {
    stop();
    last = { cells: new Set(cells), size };
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    run = {
      start: new Set(cells), live: new Set(cells), born: new Set(), size, w, h,
      gen: 0, seen: new Map([[signature(cells), 0]]), done: null, settleAt: null,
      cell: w / size, cx: size / 2, cy: size / 2, // camera: cell size in px, world point at the centre
      t0: performance.now(), lastStep: 0, colors: colors(),
    };
    caption.textContent = "Watch where it goes…";
    raf = requestAnimationFrame(frame);
  }

  function frame(t) {
    const r = run;
    if (!r) return;
    const elapsed = t - r.t0;

    // Step the simulation (after a short pause on the solved board).
    if (!r.done && elapsed > 700 && t - r.lastStep >= STEP_MS) {
      r.lastStep = t;
      const next = step(r.live);
      r.born = new Set([...next].filter((k) => !r.live.has(k)));
      r.live = next;
      r.gen++;
      const sig = signature(next);
      if (!next.size) r.done = `Died out after ${r.gen} ${r.gen === 1 ? "step" : "steps"}`;
      else if (r.seen.has(sig) && r.settleAt === null) {
        const period = r.gen - r.seen.get(sig);
        const at = r.seen.get(sig);
        r.settleMsg = period === 1
          ? (at === 0 ? "A still life: it never changes" : `Settled into a still life after ${at} ${at === 1 ? "step" : "steps"}`)
          : `Settled into a loop that repeats every ${period} steps`;
        r.settleAt = r.gen + (period === 1 ? 0 : Math.max(8, period * 3));   // let a loop play a few times
      }
      if (r.settleAt !== null && r.gen >= r.settleAt) r.done = r.settleMsg;
      else if (r.gen >= MAX_STEPS) r.done = `Still going after ${MAX_STEPS} steps!`;
      if (!r.seen.has(sig)) r.seen.set(sig, r.gen);
      caption.textContent = r.done || `Step ${r.gen} · ${next.size} cells`;
    }

    // Camera: zoom out to about 3× the board, then keep everything in view.
    let minX = 0, minY = 0, maxX = r.size, maxY = r.size;
    for (const k of r.live) {
      const [x, y] = parse(k);
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x + 1 > maxX) maxX = x + 1; if (y + 1 > maxY) maxY = y + 1;
    }
    const zoomT = Math.min(1, Math.max(0, (elapsed - 300) / 1400));
    const ease = zoomT * zoomT * (3 - 2 * zoomT);
    const introCell = r.w / r.size + (r.w / (r.size * 3) - r.w / r.size) * ease;
    const fitCell = Math.min(r.w / (maxX - minX + 4), r.h / (maxY - minY + 4));
    const wantCell = Math.max(1.5, Math.min(introCell, fitCell));
    r.cell += (wantCell - r.cell) * (wantCell < r.cell ? 0.15 : 0.04);    // only zoom out quickly
    r.cx += ((minX + maxX) / 2 - r.cx) * 0.08;
    r.cy += ((minY + maxY) / 2 - r.cy) * 0.08;

    draw(r);
    if (!r.done || elapsed < 2500) raf = requestAnimationFrame(frame);
  }

  function draw(r) {
    const { w, h, cell, colors: c } = r;
    const sx = (x) => w / 2 + (x - r.cx) * cell;
    const sy = (y) => h / 2 + (y - r.cy) * cell;
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);

    if (cell >= 7) {
      ctx.strokeStyle = c.grid;
      ctx.lineWidth = 1;
      const x0 = Math.floor(r.cx - w / 2 / cell) - 1, x1 = Math.ceil(r.cx + w / 2 / cell) + 1;
      const y0 = Math.floor(r.cy - h / 2 / cell) - 1, y1 = Math.ceil(r.cy + h / 2 / cell) + 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) { const px = Math.round(sx(x)) + 0.5; ctx.moveTo(px, 0); ctx.lineTo(px, h); }
      for (let y = y0; y <= y1; y++) { const py = Math.round(sy(y)) + 0.5; ctx.moveTo(0, py); ctx.lineTo(w, py); }
      ctx.stroke();
    }

    // The puzzle's board, outlined.
    ctx.strokeStyle = c.accent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(sx(0), sy(0), r.size * cell, r.size * cell);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const pad = cell >= 6 ? Math.max(1, cell * 0.08) : 0;
    const s = Math.max(1, cell - pad * 2);
    for (const k of r.live) {
      const [x, y] = parse(k);
      ctx.fillStyle = r.born.has(k) && r.gen > 0 ? c.born : c.live;
      if (cell >= 6 && ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(sx(x) + pad, sy(y) + pad, s, s, s * 0.25);
        ctx.fill();
      } else ctx.fillRect(sx(x) + pad, sy(y) + pad, s, s);
    }
  }

  return { play, stop, replay: () => last && play(last.cells, last.size) };
}
