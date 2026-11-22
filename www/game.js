// Color Life — Conway's Game of Life on an endless grid, with color hints
// and a "predict" mode for practising what happens next.
(() => {
  "use strict";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const ui = {
    gen: $("gen"), pop: $("pop"),
    start: $("startBtn"), stop: $("stopBtn"), undo: $("undoBtn"),
    next: $("nextBtn"), reset: $("resetBtn"), random: $("randomBtn"),
    speed: $("speed"), speedLabel: $("speedLabel"),
    zoom: $("zoom"), zoomLabel: $("zoomLabel"),
    hints: $("hints"), check: $("checkBtn"), clearGuess: $("clearGuessBtn"), editBlocks: $("editBlocksBtn"),
    score: $("score"), toast: $("toast"),
  };

  const COLORS = {
    bg: "#0f1115", grid: "#1f2430", gridMajor: "#2a3040",
    plain: "#d6dbe6",
    survive: "#22c55e", die: "#ef4444", born: "#facc15",
  };

  // ---------- State ----------
  // Live cells stored as "x,y" strings in a Set → the board is unlimited.
  let live = new Set();
  let gen = 0;
  const history = [];            // previous generations, for Undo
  const MAX_HISTORY = 2000;

  let running = false;
  let delay = 200;               // ms between iterations
  let lastStep = 0;

  let mode = "play";             // "play" | "predict"
  let brush = "born";
  const guesses = new Map();     // key -> "born" | "die" | "survive"
  let checked = false;
  // Predict mode runs in phases: "setup" (place white blocks) → "guess" (paint predictions)
  // → Guess pressed (checked = true) → Next applies the step and goes back to "guess".
  let phase = "setup";

  // Camera: camX/camY = world cell coordinate at the screen's top-left.
  let cell = 20;
  let camX = 0, camY = 0;
  const MIN_CELL = 2, MAX_CELL = 80;

  let forecast = null;           // cached { survive, die, born } for current gen
  let dirty = true;

  const key = (x, y) => x + "," + y;
  const parse = (k) => { const i = k.indexOf(","); return [+k.slice(0, i), +k.slice(i + 1)]; };

  // ---------- Rules ----------
  function nextGeneration(cells) {
    const counts = new Map();
    for (const k of cells) {
      const [x, y] = parse(k);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nk = key(x + dx, y + dy);
          counts.set(nk, (counts.get(nk) || 0) + 1);
        }
    }
    const next = new Set();
    for (const [k, n] of counts) {
      // 3 neighbours → born or survives; 2 neighbours → survives only if already alive.
      // 0–1 dies of solitude, 4+ dies of overpopulation.
      if (n === 3 || (n === 2 && cells.has(k))) next.add(k);
    }
    return next;
  }

  function getForecast() {
    if (forecast) return forecast;
    const next = nextGeneration(live);
    const survive = new Set(), die = new Set(), born = new Set();
    for (const k of live) (next.has(k) ? survive : die).add(k);
    for (const k of next) if (!live.has(k)) born.add(k);
    forecast = { next, survive, die, born };
    return forecast;
  }

  function changed() { forecast = null; dirty = true; updateStats(); }

  function step() {
    const { next } = getForecast();
    history.push(live);
    if (history.length > MAX_HISTORY) history.shift();
    live = next;
    gen++;
    clearGuesses(false);
    changed();
  }

  function undo() {
    if (!history.length) { toast("Nothing to undo"); return; }
    live = history.pop();
    gen--;
    clearGuesses(false);
    changed();
  }

  function reset() {
    stop();
    live = new Set();
    history.length = 0;
    gen = 0;
    phase = "setup";
    clearGuesses(false);
    changed();
  }

  function randomFill() {
    const { w, h } = viewSize();
    const x0 = Math.floor(camX), y0 = Math.floor(camY);
    const x1 = Math.ceil(camX + w / cell), y1 = Math.ceil(camY + h / cell);
    if ((x1 - x0) * (y1 - y0) > 400000) { toast("Zoom in a bit first"); return; }
    for (let x = x0; x < x1; x++)
      for (let y = y0; y < y1; y++)
        if (Math.random() < 0.22) live.add(key(x, y));
    changed();
  }

  // ---------- Run loop ----------
  function start() {
    if (mode === "predict") setMode("play");
    running = true; lastStep = 0; updateButtons();
  }
  function stop() { running = false; updateButtons(); }

  function frame(t) {
    if (running && t - lastStep >= delay) {
      lastStep = t;
      step();
      if (live.size === 0) { stop(); toast("Everything died"); }
    }
    if (dirty) { render(); dirty = false; }
    requestAnimationFrame(frame);
  }

  // ---------- Predict mode ----------
  function setMode(m) {
    mode = m;
    if (m === "predict") stop();
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    document.querySelector(".mode-play").hidden = m !== "play";
    document.querySelector(".mode-predict").hidden = m !== "predict";
    phase = "setup";
    clearGuesses(false);
    dirty = true;
  }

  function clearGuesses(redraw = true) {
    guesses.clear();
    checked = false;
    if (redraw) dirty = true;
    updatePredictUI();
  }

  // Next button: in predict mode it first starts the guessing, then waits for "Guess".
  function onNext() {
    stop();
    if (mode === "predict") {
      if (phase === "setup") {
        if (!live.size) { toast("Place some white blocks first"); return; }
        phase = "guess";
        clearGuesses();
        return;
      }
      if (!checked) { toast("Paint your prediction, then press Guess"); return; }
    }
    step();
  }

  function editBlocks() {
    phase = "setup";
    clearGuesses();
  }

  function updatePredictUI() {
    if (!ui.score) return;
    const setup = mode === "predict" && phase === "setup";
    const waiting = mode === "predict" && phase === "guess" && !checked;
    ui.next.innerHTML = setup ? "Start predicting ⟶" : "Next ⟶";
    ui.next.classList.toggle("primary", setup || (mode === "predict" && checked));
    ui.next.disabled = waiting;
    ui.check.disabled = mode !== "predict" || phase !== "guess" || checked;
    ui.editBlocks.disabled = setup;
    document.querySelectorAll(".brush").forEach((b) => (b.disabled = setup));
    if (mode !== "predict" || checked) return;
    ui.score.innerHTML = setup
      ? '<b>Step 1:</b> tap squares to place white blocks (or keep the ones on the board). Then press <b>Start predicting</b>.'
      : '<b>Step 2:</b> paint where cells will be <b class="y">born</b>, where they will <b class="r">die</b> and (optional) which <b class="g">survive</b>. Then press <b>Guess</b>.';
  }

  function paintGuess(x, y) {
    const k = key(x, y);
    if (checked) { toast("Press Next to see the next step"); return; }
    if (brush === "erase" || guesses.get(k) === brush) guesses.delete(k);
    else guesses.set(k, brush);
    dirty = true;
  }

  function checkGuess() {
    const f = getForecast();
    let correct = 0, wrong = 0, missed = 0;
    for (const [k, g] of guesses) (f[g].has(k) ? correct++ : wrong++);
    // Births and deaths must be found; marking survivors is optional.
    for (const k of f.born) if (guesses.get(k) !== "born") missed++;
    for (const k of f.die) if (guesses.get(k) !== "die") missed++;
    checked = true;
    dirty = true;
    updatePredictUI();
    const perfect = wrong === 0 && missed === 0;
    ui.score.innerHTML = perfect
      ? `<b class="g">Perfect!</b> ${correct} correct. Press <b>Next</b> to see it happen.`
      : `<b class="g">${correct} correct</b> · <b class="r">${wrong} wrong</b> (crossed out) · <b class="y">${missed} missed</b> (dashed outline). Press <b>Next</b> to see it happen.`;
  }

  // ---------- Camera ----------
  function viewSize() { return { w: canvas.clientWidth, h: canvas.clientHeight }; }

  function setCell(newCell, sx, sy) {
    newCell = Math.min(MAX_CELL, Math.max(MIN_CELL, newCell));
    const wx = camX + sx / cell, wy = camY + sy / cell;
    cell = newCell;
    camX = wx - sx / cell; camY = wy - sy / cell;
    syncZoomSlider();
    dirty = true;
  }

  // Slider 0..100 maps exponentially onto MIN_CELL..MAX_CELL so it feels even.
  const sliderToCell = (v) => MIN_CELL * Math.pow(MAX_CELL / MIN_CELL, v / 100);
  const cellToSlider = (c) => 100 * Math.log(c / MIN_CELL) / Math.log(MAX_CELL / MIN_CELL);
  function syncZoomSlider() {
    ui.zoom.value = cellToSlider(cell);
    ui.zoomLabel.textContent = cell.toFixed(cell < 10 ? 1 : 0) + " px";
  }

  // Speed slider 0..100 → 1000ms..10ms (right = faster)
  const sliderToDelay = (v) => Math.round(1000 * Math.pow(0.01, v / 100));
  function syncSpeed() {
    delay = sliderToDelay(+ui.speed.value);
    ui.speedLabel.textContent = delay + " ms / step";
  }

  let lastW = 0, lastH = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = viewSize();
    // keep whatever was in the middle of the screen in the middle
    if (lastW) { camX += (lastW - w) / 2 / cell; camY += (lastH - h) / 2 / cell; }
    lastW = w; lastH = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  // ---------- Render ----------
  function render() {
    const { w, h } = viewSize();
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    const x0 = Math.floor(camX) - 1, y0 = Math.floor(camY) - 1;
    const x1 = Math.ceil(camX + w / cell) + 1, y1 = Math.ceil(camY + h / cell) + 1;
    const visible = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const sx = (x) => (x - camX) * cell;
    const sy = (y) => (y - camY) * cell;

    // grid
    if (cell >= 6) {
      ctx.lineWidth = 1;
      for (let x = x0; x <= x1; x++) {
        ctx.strokeStyle = x % 10 === 0 ? COLORS.gridMajor : COLORS.grid;
        const px = Math.round(sx(x)) + 0.5;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
      }
      for (let y = y0; y <= y1; y++) {
        ctx.strokeStyle = y % 10 === 0 ? COLORS.gridMajor : COLORS.grid;
        const py = Math.round(sy(y)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
      }
    }

    const pad = cell >= 6 ? 1 : 0;
    const fillCell = (x, y, color, inset = 0) => {
      ctx.fillStyle = color;
      const i = pad + inset;
      const size = cell - i * 2 + (pad ? 1 : 0);
      if (cell >= 6 && ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(sx(x) + i, sy(y) + i, size, size, size * 0.28);
        ctx.fill();
      } else {
        ctx.fillRect(sx(x) + i, sy(y) + i, size, size);
      }
    };

    const showHints = mode === "play" && ui.hints.checked;
    const f = showHints || (mode === "predict" && checked) ? getForecast() : null;

    // live cells
    for (const k of live) {
      const [x, y] = parse(k);
      if (!visible(x, y)) continue;
      let color = COLORS.plain;
      if (showHints) color = f.die.has(k) ? COLORS.die : COLORS.survive;
      fillCell(x, y, color);
    }

    // cells about to be born (semi-transparent yellow)
    if (showHints) {
      ctx.globalAlpha = 0.85;
      for (const k of f.born) {
        const [x, y] = parse(k);
        if (visible(x, y)) fillCell(x, y, COLORS.born);
      }
      ctx.globalAlpha = 1;
    }

    if (mode === "predict") renderGuesses(f, visible, sx, sy, fillCell);
  }

  function renderGuesses(f, visible, sx, sy, fillCell) {
    const inset = Math.max(1, cell * 0.18);
    for (const [k, g] of guesses) {
      const [x, y] = parse(k);
      if (!visible(x, y)) continue;
      ctx.globalAlpha = 0.9;
      fillCell(x, y, COLORS[g], live.has(k) ? inset : 0);
      ctx.globalAlpha = 1;
      if (checked && !f[g].has(k)) {
        // wrong guess → cross it out
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1.5, cell / 10);
        const a = cell * 0.2, px = sx(x), py = sy(y);
        ctx.beginPath();
        ctx.moveTo(px + a, py + a); ctx.lineTo(px + cell - a, py + cell - a);
        ctx.moveTo(px + cell - a, py + a); ctx.lineTo(px + a, py + cell - a);
        ctx.stroke();
      }
    }
    if (!checked) return;
    // missed births/deaths → dashed outline in the right color
    ctx.setLineDash([Math.max(2, cell / 6), Math.max(2, cell / 8)]);
    ctx.lineWidth = Math.max(1.5, cell / 12);
    const outline = (set, type) => {
      ctx.strokeStyle = COLORS[type];
      for (const k of set) {
        if (guesses.get(k) === type) continue;
        const [x, y] = parse(k);
        if (!visible(x, y)) continue;
        const o = ctx.lineWidth / 2 + 1;
        const s = cell - o * 2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(sx(x) + o, sy(y) + o, s, s, s * 0.28);
        else ctx.rect(sx(x) + o, sy(y) + o, s, s);
        ctx.stroke();
      }
    };
    outline(f.born, "born");
    outline(f.die, "die");
    ctx.setLineDash([]);
  }

  // ---------- UI sync ----------
  function updateStats() {
    ui.gen.textContent = gen;
    ui.pop.textContent = live.size;
    updateButtons();
  }
  function updateButtons() {
    ui.start.disabled = running;
    ui.stop.disabled = !running;
    ui.undo.disabled = history.length === 0;
    updatePredictUI();
  }

  let toastTimer;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (ui.toast.hidden = true), 1600);
  }

  // ---------- Input: mouse, touch, pen ----------
  const pointers = new Map();
  let downPos = null, panning = false, pinch = null, multiTouch = false;

  const localPos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = localPos(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      downPos = p; panning = false; multiTouch = false;
    } else if (pointers.size === 2) {
      multiTouch = true;
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cell,
        wx: camX + mid.x / cell, wy: camY + mid.y / cell,
      };
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const p = localPos(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 1 && !multiTouch) {
      if (!panning && Math.hypot(p.x - downPos.x, p.y - downPos.y) > 6) {
        panning = true; canvas.classList.add("panning");
      }
      if (panning) {
        camX -= (p.x - prev.x) / cell;
        camY -= (p.y - prev.y) / cell;
        dirty = true;
      }
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      cell = Math.min(MAX_CELL, Math.max(MIN_CELL, pinch.cell * dist / pinch.dist));
      camX = pinch.wx - mid.x / cell;
      camY = pinch.wy - mid.y / cell;
      syncZoomSlider();
      dirty = true;
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = localPos(e);
    const wasClick = pointers.size === 1 && !panning && !multiTouch && e.type === "pointerup";
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { panning = false; canvas.classList.remove("panning"); }
    if (wasClick) handleTap(p);
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  function handleTap(p) {
    const x = Math.floor(camX + p.x / cell);
    const y = Math.floor(camY + p.y / cell);
    if (mode === "predict" && phase !== "setup") { paintGuess(x, y); return; }
    const k = key(x, y);
    if (live.has(k)) live.delete(k); else live.add(k);
    changed();
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const p = localPos(e);
    setCell(cell * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  // ---------- Buttons & keys ----------
  ui.start.onclick = start;
  ui.stop.onclick = stop;
  ui.next.onclick = onNext;
  ui.undo.onclick = () => { stop(); undo(); };
  ui.reset.onclick = reset;
  ui.random.onclick = randomFill;
  ui.hints.onchange = () => (dirty = true);
  ui.check.onclick = checkGuess;
  ui.clearGuess.onclick = () => clearGuesses();
  ui.editBlocks.onclick = editBlocks;
  ui.speed.oninput = syncSpeed;
  ui.zoom.oninput = () => {
    const { w, h } = viewSize();
    setCell(sliderToCell(+ui.zoom.value), w / 2, h / 2);
  };

  document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  document.querySelectorAll(".brush").forEach((b) => (b.onclick = () => {
    brush = b.dataset.brush;
    document.querySelectorAll(".brush").forEach((o) => o.classList.toggle("active", o === b));
  }));

  // ---------- Rules window ----------
  const rules = $("rules");
  const openRules = () => { rules.hidden = false; $("rulesOk").focus(); };
  const closeRules = () => {
    rules.hidden = true;
    try { localStorage.setItem("colorLifeRulesSeen", "1"); } catch (_) {}
  };
  $("rulesBtn").onclick = openRules;
  $("rulesClose").onclick = closeRules;
  $("rulesOk").onclick = closeRules;
  rules.addEventListener("click", (e) => { if (e.target === rules) closeRules(); });

  window.addEventListener("keydown", (e) => {
    if (!rules.hidden) { if (e.key === "Escape") closeRules(); return; }
    if (e.target.tagName === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox") return;
    switch (e.key) {
      case " ": e.preventDefault(); running ? stop() : start(); break;
      case "ArrowRight": case "n": case "N": onNext(); break;
      case "ArrowLeft": case "z": case "Z": stop(); undo(); break;
      case "+": case "=": { const { w, h } = viewSize(); setCell(cell * 1.2, w / 2, h / 2); break; }
      case "-": { const { w, h } = viewSize(); setCell(cell / 1.2, w / 2, h / 2); break; }
    }
  });

  window.addEventListener("resize", resize);
  new ResizeObserver(resize).observe(canvas);

  // ---------- Init ----------
  function init() {
    resize();
    syncSpeed();
    cell = sliderToCell(+ui.zoom.value);
    syncZoomSlider();
    const { w, h } = viewSize();
    camX = -w / cell / 2; camY = -h / cell / 2;
    // a few starter patterns: glider, blinker, toad
    [[1, -6], [2, -5], [0, -4], [1, -4], [2, -4]].forEach(([x, y]) => live.add(key(x - 10, y)));
    [[0, 0], [1, 0], [2, 0]].forEach(([x, y]) => live.add(key(x + 6, y - 3)));
    [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1]].forEach(([x, y]) => live.add(key(x - 3, y + 4)));
    changed();
    requestAnimationFrame(frame);
    let seen = false;
    try { seen = localStorage.getItem("colorLifeRulesSeen") === "1"; } catch (_) {}
    if (!seen) openRules();
  }
  init();

  // Offline support for the installable web app (not needed inside the Android app).
  if ("serviceWorker" in navigator && !window.Capacitor && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
