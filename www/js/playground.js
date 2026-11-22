// Playground: the original Color Life sandbox. An endless board you draw on,
// then watch it evolve, with colour hints for what happens next.
import { key, parse, step } from "./life.js";

const $ = (id) => document.getElementById(id);
let ui, canvas, ctx;
let ready = false, open = false;

// ---------- State ----------
let live = new Set();
let gen = 0;
const history = [];               // previous generations, for Undo
const MAX_HISTORY = 2000;
let running = false;
let delay = 200;                  // ms between steps
let lastStep = 0;
let forecast = null;              // { next, survive, die, born } for the current board
let dirty = true;
let colors = {};

// Camera: camX/camY = world cell at the screen's top-left.
let cell = 20, camX = 0, camY = 0;
const MIN_CELL = 2, MAX_CELL = 80;

function getForecast() {
  if (forecast) return forecast;
  const next = step(live);
  const survive = new Set(), die = new Set(), born = new Set();
  for (const k of live) (next.has(k) ? survive : die).add(k);
  for (const k of next) if (!live.has(k)) born.add(k);
  return (forecast = { next, survive, die, born });
}

function changed() { forecast = null; dirty = true; updateStats(); }

function stepOnce() {
  history.push(live);
  if (history.length > MAX_HISTORY) history.shift();
  live = getForecast().next;
  gen++;
  changed();
}

function undo() {
  if (!history.length) return;
  live = history.pop();
  gen--;
  changed();
}

function reset() {
  stop();
  live = new Set();
  history.length = 0;
  gen = 0;
  changed();
}

function randomFill() {
  const { w, h } = viewSize();
  const x0 = Math.floor(camX), y0 = Math.floor(camY);
  const x1 = Math.ceil(camX + w / cell), y1 = Math.ceil(camY + h / cell);
  if ((x1 - x0) * (y1 - y0) > 400000) return;
  for (let x = x0; x < x1; x++)
    for (let y = y0; y < y1; y++)
      if (Math.random() < 0.22) live.add(key(x, y));
  changed();
}

// ---------- Run loop (only while the playground is open) ----------
function start() { running = true; lastStep = 0; updateButtons(); }
function stop() { running = false; updateButtons(); }

function frame(t) {
  if (!open) return;
  if (running && t - lastStep >= delay) {
    lastStep = t;
    stepOnce();
    if (live.size === 0) stop();
  }
  if (dirty) { render(); dirty = false; }
  requestAnimationFrame(frame);
}

// ---------- Camera ----------
const viewSize = () => ({ w: canvas.clientWidth, h: canvas.clientHeight });

function setCell(newCell, sx, sy) {
  newCell = Math.min(MAX_CELL, Math.max(MIN_CELL, newCell));
  const wx = camX + sx / cell, wy = camY + sy / cell;
  cell = newCell;
  camX = wx - sx / cell; camY = wy - sy / cell;
  syncZoom();
  dirty = true;
}

// Sliders map exponentially so they feel even.
const sliderToCell = (v) => MIN_CELL * Math.pow(MAX_CELL / MIN_CELL, v / 100);
const cellToSlider = (c) => 100 * Math.log(c / MIN_CELL) / Math.log(MAX_CELL / MIN_CELL);
const sliderToDelay = (v) => Math.round(1000 * Math.pow(0.01, v / 100));   // 1000 → 10 ms
function syncZoom() { ui.zoom.value = cellToSlider(cell); }
function syncSpeed() { delay = sliderToDelay(+ui.speed.value); ui.speedLabel.textContent = `${delay} ms`; }

let lastW = 0, lastH = 0;
function resize() {
  const { w, h } = viewSize();
  if (!w || !h) return;
  const dpr = window.devicePixelRatio || 1;
  if (lastW) { camX += (lastW - w) / 2 / cell; camY += (lastH - h) / 2 / cell; }   // keep the centre in place
  lastW = w; lastH = h;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dirty = true;
}

// ---------- Render ----------
function readColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (n) => css.getPropertyValue("--" + n).trim();
  colors = { bg: v("bg"), grid: v("raised"), gridMajor: v("line"), plain: v("live"), survive: v("survive"), die: v("die"), born: v("born") };
}

function render() {
  const { w, h } = viewSize();
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);

  const x0 = Math.floor(camX) - 1, y0 = Math.floor(camY) - 1;
  const x1 = Math.ceil(camX + w / cell) + 1, y1 = Math.ceil(camY + h / cell) + 1;
  const visible = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const sx = (x) => (x - camX) * cell, sy = (y) => (y - camY) * cell;

  if (cell >= 6) {
    ctx.lineWidth = 1;
    for (let x = x0; x <= x1; x++) {
      ctx.strokeStyle = x % 10 === 0 ? colors.gridMajor : colors.grid;
      const px = Math.round(sx(x)) + 0.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    }
    for (let y = y0; y <= y1; y++) {
      ctx.strokeStyle = y % 10 === 0 ? colors.gridMajor : colors.grid;
      const py = Math.round(sy(y)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    }
  }

  const pad = cell >= 6 ? 1 : 0;
  const fillCell = (x, y, color) => {
    ctx.fillStyle = color;
    const size = cell - pad * 2 + (pad ? 1 : 0);
    if (cell >= 6 && ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(sx(x) + pad, sy(y) + pad, size, size, size * 0.28);
      ctx.fill();
    } else ctx.fillRect(sx(x) + pad, sy(y) + pad, size, size);
  };

  const hints = ui.hints.checked;
  const f = hints ? getForecast() : null;
  for (const k of live) {
    const [x, y] = parse(k);
    if (visible(x, y)) fillCell(x, y, hints ? (f.die.has(k) ? colors.die : colors.survive) : colors.plain);
  }
  if (hints) {
    ctx.globalAlpha = 0.85;
    for (const k of f.born) { const [x, y] = parse(k); if (visible(x, y)) fillCell(x, y, colors.born); }
    ctx.globalAlpha = 1;
  }
}

// ---------- UI sync ----------
function updateStats() { ui.gen.textContent = gen; ui.pop.textContent = live.size; updateButtons(); }
function updateButtons() {
  ui.run.textContent = running ? "⏸ Stop" : "▶ Start";
  ui.run.classList.toggle("primary", !running);
  ui.undo.disabled = history.length === 0;
}

// ---------- Input: tap to draw, drag to move, pinch / wheel to zoom ----------
function bindInput() {
  const pointers = new Map();
  let downPos = null, panning = false, pinch = null, multiTouch = false;
  const localPos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = localPos(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) { downPos = p; panning = false; multiTouch = false; }
    else if (pointers.size === 2) {
      multiTouch = true;
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cell, wx: camX + mid.x / cell, wy: camY + mid.y / cell };
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId), p = localPos(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1 && !multiTouch) {
      if (!panning && Math.hypot(p.x - downPos.x, p.y - downPos.y) > 6) panning = true;
      if (panning) { camX -= (p.x - prev.x) / cell; camY -= (p.y - prev.y) / cell; dirty = true; }
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      cell = Math.min(MAX_CELL, Math.max(MIN_CELL, pinch.cell * dist / pinch.dist));
      camX = pinch.wx - mid.x / cell;
      camY = pinch.wy - mid.y / cell;
      syncZoom();
      dirty = true;
    }
  });

  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = localPos(e);
    const tap = pointers.size === 1 && !panning && !multiTouch && e.type === "pointerup";
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) panning = false;
    if (tap) {
      const k = key(Math.floor(camX + p.x / cell), Math.floor(camY + p.y / cell));
      live.has(k) ? live.delete(k) : live.add(k);
      changed();
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = localPos(e);
    setCell(cell * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  window.addEventListener("keydown", (e) => {
    if (!open || document.querySelector(".modal:not([hidden])")) return;
    switch (e.key) {
      case " ": e.preventDefault(); running ? stop() : start(); break;
      case "ArrowRight": case "n": case "N": stop(); stepOnce(); break;
      case "ArrowLeft": case "z": case "Z": stop(); undo(); break;
    }
  });
}

function init() {
  ui = {
    gen: $("pgGen"), pop: $("pgPop"),
    run: $("pgRun"), undo: $("pgUndo"), next: $("pgNext"), random: $("pgRandom"), reset: $("pgReset"),
    speed: $("pgSpeed"), speedLabel: $("pgSpeedLabel"), zoom: $("pgZoom"), hints: $("pgHints"),
  };
  canvas = $("pgBoard");
  ctx = canvas.getContext("2d");
  ui.run.onclick = () => (running ? stop() : start());
  ui.next.onclick = () => { stop(); stepOnce(); };
  ui.undo.onclick = () => { stop(); undo(); };
  ui.random.onclick = randomFill;
  ui.reset.onclick = reset;
  ui.hints.onchange = () => (dirty = true);
  ui.speed.oninput = syncSpeed;
  ui.zoom.oninput = () => { const { w, h } = viewSize(); setCell(sliderToCell(+ui.zoom.value), w / 2, h / 2); };
  new ResizeObserver(resize).observe(canvas);
  bindInput();
  syncSpeed();

  // Start with a few classic patterns: a glider, a blinker and a toad.
  resize();
  const { w, h } = viewSize();
  cell = Math.min(sliderToCell(+ui.zoom.value), w / 24);   // starter patterns fit narrow phones
  syncZoom();
  camX = -w / cell / 2; camY = -h / cell / 2;
  [[1, -6], [2, -5], [0, -4], [1, -4], [2, -4]].forEach(([x, y]) => live.add(key(x - 10, y)));
  [[0, 0], [1, 0], [2, 0]].forEach(([x, y]) => live.add(key(x + 6, y - 3)));
  [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1]].forEach(([x, y]) => live.add(key(x - 3, y + 4)));
  changed();
  ready = true;
}

export function openPlayground() {
  open = true;
  readColors();
  if (!ready) init();
  else resize();
  dirty = true;
  updateStats();
  requestAnimationFrame(frame);
}

export function closePlayground() {
  open = false;
  if (ready) stop();     // nothing to stop if the playground was never opened
}
