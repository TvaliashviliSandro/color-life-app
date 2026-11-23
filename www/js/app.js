// Color Life — "predict the next step" puzzle game.
// PLAYTEST BUILD: ads and purchases are mocked (fake ad screen, fake Google Play sheet),
// and every player gets a big pile of coins to try abilities and continues.
import {
  DIFFICULTIES, difficulty, TUTORIAL, fromTutorial, makePuzzle, puzzleShape, dailyPuzzle, rushConfig, grade,
  endlessStart, endlessRound, ENDLESS_SIZE,
} from "./puzzles.js";
import { key, parse, neighbours } from "./life.js";
import * as store from "./store.js";
import { THEMES, APPEARANCES, FREE, applyTheme, previewVars } from "./themes.js";
import { openPlayground, closePlayground } from "./playground.js";
import { createSim } from "./sim.js";
import { icon, hydrateIcons } from "./icons.js";

const $ = (id) => document.getElementById(id);
const SITE = "https://tvaliashvilisandro.github.io/color-life-app/";
const RUSH_MS = 60_000;
const HEARTS = 3;
const AD_COINS = 50, AD_COINS_PER_DAY = 5, DAILY_BONUS = 100;
const PLAY_COINS = { "very-easy": 6, easy: 8, medium: 12, hard: 18, "very-hard": 25, extreme: 35 };

hydrateIcons();
const S = store.load();
applyTheme(S.theme);
store.save(S);

let G = null;              // the puzzle / run being played
let current = "home";
let rushTimer = null;

// ---------- Helpers ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch (_) {} };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const coinsHTML = (n) => `<span class="coins-val">${icon("coin", "coin")}${n.toLocaleString()}</span>`;
const heartsRow = (n, max = HEARTS) =>
  icon("heart", "fill heart-on").repeat(Math.max(0, n)) + icon("heart", "heart-off").repeat(Math.max(0, max - n));
const setStars = (el, n) => {
  el.hidden = n === null;
  [...el.children].forEach((s, i) => s.classList.toggle("on", n !== null && i < n));
};

let toastTimer;
function toast(msg, ms = 1900) {
  const t = $("toast");
  t.innerHTML = msg;
  t.hidden = false;
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}
function spend(cost) {
  if (S.coins < cost) return false;
  S.coins -= cost;
  store.save(S);
  refreshCoins();
  return true;
}
function earn(n) {
  S.coins += n;
  store.save(S);
  refreshCoins();
}

// ---------- Navigation (also makes Android's back button work) ----------
const SCREENS = ["home", "game", "themes", "playground", "difficulty", "shop"];
const MODALS = ["rules", "lesson", "continueModal", "endModal", "buyModal"];
// Page changes: a transparent layer blocks extra taps for a moment, and a spinner
// appears if the change takes longer than a blink (e.g. rewinding history on Android).
let navTimer, navGuard, awaitingPop = false;
function navBusy(maxMs = 1200) {
  const l = $("loader");
  l.hidden = false;
  l.classList.remove("visible");
  clearTimeout(navTimer); clearTimeout(navGuard);
  navTimer = setTimeout(() => l.classList.add("visible"), 250);
  navGuard = setTimeout(navDone, maxMs);
}
function navDone() {
  clearTimeout(navTimer); clearTimeout(navGuard);
  awaitingPop = false;
  $("loader").hidden = true;
  $("loader").classList.remove("visible");
}
function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  current = id;
  refresh();
  if (!awaitingPop) { clearTimeout(navGuard); navGuard = setTimeout(navDone, 220); }
}
function go(id) {
  navBusy();
  if (id !== current) history.pushState({ s: id, d: (history.state?.d || 0) + 1 }, "");
  show(id);
}
function back() {
  navBusy();
  awaitingPop = true;
  history.back();
}
function leaveScreen() {
  stopRush();
  closePlayground();
  endSim.stop();
  G = null;
  for (const m of MODALS) $(m).hidden = true;
}
// Home shows instantly; the browser history catches up in the background.
function goHomeNow() {
  const d = history.state?.d || 0;
  navBusy();
  leaveScreen();
  if (d > 0) awaitingPop = true;
  show("home");
  if (d > 0) history.go(-d);
}
history.replaceState({ s: "home", d: 0 }, "");
window.addEventListener("popstate", (e) => {
  if (awaitingPop) setTimeout(navDone, 150);
  const target = e.state?.s || "home";
  if (target === "game" && G) {             // back from the shop to a puzzle in progress
    show("game");
    if (G.reopenContinue) { G.reopenContinue = false; showContinue(); }
    return;
  }
  leaveScreen();
  show(["home", "difficulty", "themes", "shop"].includes(target) ? target : "home");
});
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = back));
document.querySelectorAll("[data-shop]").forEach((b) => (b.onclick = openShop));

// ---------- Status ----------
function refreshCoins() {
  for (const id of ["homeCoins", "diffCoins", "themeCoins", "shopCoins"]) $(id).innerHTML = coinsHTML(S.coins);
  if (current === "game" && G) renderAbilities();
}

function refresh() {
  refreshCoins();
  if (current === "home") refreshHome();
  if (current === "themes") renderThemes();
  if (current === "difficulty") renderDifficulties();
  if (current === "shop") renderShop();
  if (current === "game" && G?.puzzle) updateBar();
}

function refreshHome() {
  $("playSub").textContent = S.tutorialDone
    ? `Choose a difficulty · last: ${difficulty(S.lastDifficulty).name}`
    : "Starts with a quick 5-step tutorial";
  const d = store.today(), n = store.dailyNumber(d), done = S.daily.results[d];
  $("dailySub").textContent = done ? `#${n} done · ${done.stars}/3 stars · new one tomorrow` : `#${n} · today's puzzle is ready`;
  $("dailyBtn").classList.toggle("done", !!done);
  $("endlessSub").textContent = S.endlessBest ? `One pattern, step after step · best ${plural(S.endlessBest, "step")}` : "One pattern, step after step";
  $("rushSub").textContent = `60 seconds · best ${S.rushBest}`;
  $("statDaily").textContent = store.currentDailyStreak(S, d);
  $("statPerfect").textContent = S.perfectStreak;
  $("statStars").textContent = S.totalStars;
}

// ---------- Board rendering ----------
const outcomeMap = (p) => {
  const m = new Map();
  for (const t of ["survive", "die", "born"]) for (const k of p.answer[t]) m.set(k, t);
  return m;
};
const changedCells = (a, b) => {
  const out = new Set();
  for (const k of a) if (!b.has(k)) out.add(k);
  for (const k of b) if (!a.has(k)) out.add(k);
  return out;
};
const BADGE = { ok: "check", wrong: "close", missed: "plus" };

function renderBoard(el, size, live, o = {}) {
  el.style.setProperty("--n", size);
  let html = "";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = key(x, y);
      let cls = "cell";
      if (live.has(k)) cls += " live";
      const m = o.marks?.get(k); if (m) cls += " m-" + m;
      const out = o.outcome?.get(k); if (out) cls += " o-" + out;
      if (o.flip?.has(k)) cls += " flip";
      if (o.locked?.has(k)) cls += " locked";
      if (o.scan?.has(k)) cls += " scan";
      const r = o.results?.get(k) || (o.flags?.has(k) ? "wrong" : null);
      if (r === "missed") cls += " missed";
      if (r === "wrong") cls += " is-wrong";
      let inner = r ? `<span class="badge ${r}">${icon(BADGE[r])}</span>` : "";
      if (o.locked?.has(k)) inner += `<span class="lock-dot">${icon("lock")}</span>`;
      if (o.counts) inner += `<span class="count">${neighbours(o.counts, x, y)}</span>`;
      html += `<div class="${cls}" data-k="${k}" style="--d:${(x + y) * 35}ms">${inner}</div>`;
    }
  el.innerHTML = html;
}

function renderSolve() {
  renderBoard($("board"), G.puzzle.size, G.start, {
    marks: G.marks, flags: G.flags, locked: G.locked,
    scan: G.scan ? new Set(G.puzzle.answer.born) : null,
    counts: Date.now() < G.countUntil ? G.start : null,
  });
}

// ---------- Tutorial lessons (popup before each of the 5 tutorial puzzles) ----------
// Example grids are 3×3, middle cell = index 4. "on" = live, "" = empty.
const TAP = {
  survive: `<span class="tap-demo"><span class="on"></span>${icon("chevron", "tiny")}<span class="survive">●</span></span><span>Tap a white cell <b>once</b>: it survives</span>`,
  die: `<span class="tap-demo"><span class="on"></span>${icon("chevron", "tiny")}<span class="die">✕</span></span><span>Tap a white cell <b>twice</b>: it dies</span>`,
  born: `<span class="tap-demo"><span></span>${icon("chevron", "tiny")}<span class="born">+</span></span><span>Tap an <b>empty</b> cell: it's born</span>`,
};
const LESSONS = [
  { title: "Survive",
    before: ["", "on", "", "", "on", "on", "", "", ""], result: "survive",
    body: "Your job: predict what every cell does in the <b>next step</b>.<br>Each cell counts its <b>8 neighbours</b> (diagonals too). A live cell with <b>2 or 3</b> live neighbours <b>survives</b>.",
    how: ["survive"] },
  { title: "Lonely cells die",
    before: ["on", "", "", "", "on", "", "", "", ""], result: "die",
    body: "A live cell with <b>0 or 1</b> live neighbours <b>dies</b> of loneliness.",
    how: ["survive", "die"] },
  { title: "Birth",
    before: ["on", "", "on", "", "", "", "", "on", ""], result: "born",
    body: "An <b>empty</b> cell with <b>exactly 3</b> live neighbours is <b>born</b>.",
    how: ["survive", "born"] },
  { title: "Crowded cells die",
    before: ["on", "", "on", "", "on", "", "on", "", "on"], result: "die",
    body: "A live cell with <b>4 or more</b> live neighbours <b>dies</b> from overcrowding.",
    how: ["survive", "die", "born"] },
  { title: "Put it all together",
    rules: true,
    body: "Use every rule at once. Check each white cell, then look for empty cells with exactly 3 neighbours. A wrong Check flags your mistakes so you can fix them.",
    how: ["survive", "die", "born"] },
];
const GLYPH = { survive: "●", die: "✕", born: "+" };

function lessonExample(L) {
  if (L.rules) {
    return `<ul class="lesson-rules">
      <li><i class="sw die"></i><span><b>0–1</b> neighbours: dies</span></li>
      <li><i class="sw survive"></i><span><b>2–3</b> neighbours: survives</span></li>
      <li><i class="sw die"></i><span><b>4+</b> neighbours: dies</span></li>
      <li><i class="sw born"></i><span>empty + <b>exactly 3</b>: born</span></li></ul>`;
  }
  const grid = (cells) => `<div class="mini big">${cells.map((c) => `<i class="${c}">${GLYPH[c] || ""}</i>`).join("")}</div>`;
  const after = L.before.map((c, i) => (i === 4 ? L.result : c ? "ghost" : ""));
  return `<div class="lesson-grids"><div>${grid(L.before)}<small>now</small></div><span class="arrow">${icon("next")}</span><div>${grid(after)}<small>next step</small></div></div>`;
}

function showLesson(n) {
  const L = LESSONS[n - 1];
  showPopup({
    step: `Lesson ${n} of ${LESSONS.length}`, title: L.title, example: lessonExample(L),
    body: L.body, how: L.how.map((t) => `<p>${TAP[t]}</p>`).join(""), button: "Let's try",
  });
}

function showPopup({ step, title, example = "", body, how, button }) {
  $("lessonStep").textContent = step;
  $("lessonTitle").textContent = title;
  $("lessonExample").innerHTML = example;
  $("lessonBody").innerHTML = body;
  $("lessonHow").innerHTML = how;
  $("lessonGo").textContent = button;
  const m = $("lesson");
  m.hidden = false;
  m.firstElementChild.style.animation = "none"; void m.offsetWidth; m.firstElementChild.style.animation = "";
  $("lessonGo").focus();
}
const closeLesson = () => { $("lesson").hidden = true; };
$("lessonGo").onclick = closeLesson;

// ---------- Abilities ----------
const ABILITIES = [
  { id: "peek", name: "Peek", icon: "search", cost: 15, target: "cell", desc: "Reveals the answer for one cell." },
  { id: "counter", name: "Counter", icon: "hash", cost: 20, desc: "Shows every cell's live-neighbour count for 6 seconds." },
  { id: "paintball", name: "Paintball", icon: "splat", cost: 40, target: "cell", desc: "Reveals a 3×3 area around the cell you tap." },
  { id: "rocket", name: "Rocket", icon: "rocket", cost: 45, target: "line", desc: "Reveals a whole row or column." },
  { id: "scan", name: "Birth scan", icon: "radar", cost: 50, desc: "Outlines every cell that will be born." },
  { id: "shield", name: "Shield", icon: "shield", cost: 30, desc: "Your next wrong Check doesn't cost a heart." },
];
const abilityById = (id) => ABILITIES.find((a) => a.id === id);
const abilitiesOn = () => G && ["play", "daily", "endless"].includes(G.mode);

$("abilityHelp").innerHTML = ABILITIES.map((a) =>
  `<li><span class="mode-dot">${icon(a.icon)}</span><span><b>${a.name}</b> ${a.desc} <span class="cost">${coinsHTML(a.cost)}</span></span></li>`).join("")
  + `<li><span class="mode-dot">${icon("bolt")}</span><span>Abilities can't be used in Rush. A shared Daily result says how many you used.</span></li>`;

function renderAbilities() {
  const bar = $("abilities");
  bar.hidden = !abilitiesOn() || G.phase === "target" || G.phase === "done";
  if (bar.hidden) return;
  const busy = G.phase !== "solve";
  bar.innerHTML = ABILITIES.map((a) => {
    const active = (a.id === "shield" && G.shield) || (a.id === "scan" && G.scan) || (a.id === "counter" && Date.now() < G.countUntil);
    return `<button class="ability${active ? " active" : ""}" data-ability="${a.id}" ${busy ? "disabled" : ""}>
      ${icon(a.icon)}<span class="ab-name">${a.name}</span><span class="ab-cost">${coinsHTML(a.cost)}</span></button>`;
  }).join("");
  bar.querySelectorAll("[data-ability]").forEach((b) => (b.onclick = () => useAbility(b.dataset.ability)));
}

function useAbility(id) {
  const a = abilityById(id);
  if (G.phase !== "solve") return;
  if ((id === "shield" && G.shield) || (id === "scan" && G.scan)) { toast(`${a.name} is already active`); return; }
  if (S.coins < a.cost) { toast("Not enough coins"); openShop(); return; }
  if (a.target) {
    G.phase = "target";
    G.target = { id, orient: "row" };
    $("targetText").innerHTML = `${icon(a.icon)}<span>${id === "rocket" ? "Tap a cell to reveal its whole" : id === "paintball" ? "Tap the centre of a 3×3 area" : "Tap a cell to reveal it"}</span>`;
    $("targetFlip").hidden = id !== "rocket";
    $("targetFlip").textContent = "row";
    $("targetBanner").hidden = false;
    renderAbilities();
    return;
  }
  charge(a);
  if (id === "counter") {
    G.countUntil = Date.now() + 6000;
    const game = G;
    setTimeout(() => { if (G === game && G.phase !== "done") { renderSolve(); renderAbilities(); } }, 6050);
  }
  if (id === "scan") G.scan = true;
  if (id === "shield") { G.shield = true; updateBar(); }
  toast(`${a.name}: ${a.desc}`);
  renderSolve();
  renderAbilities();
}

function charge(a) {
  spend(a.cost);
  G.used.push(a.id);
  S.abilityUses[a.id] = (S.abilityUses[a.id] || 0) + 1;
  store.save(S);
}

$("targetFlip").onclick = () => {
  G.target.orient = G.target.orient === "row" ? "column" : "row";
  $("targetFlip").textContent = G.target.orient;
};
$("targetCancel").onclick = cancelTarget;
function cancelTarget() {
  if (!G || G.phase !== "target") return;
  G.phase = "solve";
  $("targetBanner").hidden = true;
  renderAbilities();
}

function applyTarget(k) {
  const a = abilityById(G.target.id), n = G.puzzle.size;
  const [x, y] = parse(k);
  let cells = [];
  if (a.id === "peek") cells = [k];
  if (a.id === "paintball") for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push(key(x + dx, y + dy));
  if (a.id === "rocket") for (let i = 0; i < n; i++) cells.push(G.target.orient === "row" ? key(i, y) : key(x, i));
  cells = cells.filter((c) => { const [cx, cy] = parse(c); return cx >= 0 && cy >= 0 && cx < n && cy < n && !G.locked.has(c); });
  if (!cells.length) { toast("Those cells are already revealed"); return; }
  charge(a);
  for (const c of cells) {
    const t = G.truth.get(c);
    t ? G.marks.set(c, t) : G.marks.delete(c);
    G.locked.add(c);
    G.flags.delete(c);
  }
  G.phase = "solve";
  $("targetBanner").hidden = true;
  toast(`${a.name} revealed ${plural(cells.length, "cell")}`);
  renderSolve();
  renderAbilities();
}

// ---------- Puzzle setup ----------
function startPuzzle(puzzle) {
  Object.assign(G, {
    puzzle, start: new Set(puzzle.frames[0]), truth: outcomeMap(puzzle),
    marks: new Map(), flags: new Set(), locked: new Set(), scan: false, countUntil: 0,
    phase: "solve", target: null,
  });
  for (const m of ["endModal", "continueModal"]) $(m).hidden = true;
  endSim.stop();
  $("controls").hidden = false;
  $("targetBanner").hidden = true;
  $("board").classList.remove("locked");
  renderSolve();
  renderAbilities();
  $("hint").innerHTML = hintFor();
  updateBar();
  if (G.mode === "tutorial") showLesson(G.step + 1);
}

function hintFor() {
  if (G.mode === "endless" && G.endless.steps === 0)
    return "Your answer becomes the next board. The edge is a wall: nothing exists outside it.";
  if (G.mode === "daily" || (G.mode === "play" && (S.diffStats[G.diff]?.solved || 0) < 2))
    return 'Mark every white cell <i class="sw survive"></i> or <i class="sw die"></i>, and the empty cells that will be born <i class="sw born"></i>. Each wrong Check costs a heart.';
  return "";
}

function updateBar() {
  const p = G.puzzle;
  // Hearts sit right above the board; the top bar keeps the title and a short status.
  const showHearts = ["play", "daily", "endless"].includes(G.mode);
  $("heartsRow").hidden = !showHearts;
  if (showHearts) $("heartsRow").innerHTML = heartsRow(G.hearts)
    + (G.shield ? `<span class="shield-on">${icon("shield")}Shield</span>` : "");
  if (G.mode === "tutorial") {
    $("gameTitle").textContent = "Tutorial";
    $("gameSub").textContent = `Lesson ${G.step + 1} of ${TUTORIAL.length} · ${TUTORIAL[G.step].title}`;
    $("gameStatus").innerHTML = icon("book");
  } else if (G.mode === "play") {
    const d = difficulty(G.diff);
    $("gameTitle").textContent = d.name;
    $("gameSub").textContent = `${p.size}×${p.size} board · ${p.frames[0].length} blocks`;
    $("gameStatus").innerHTML = "";
  } else if (G.mode === "endless") {
    $("gameTitle").textContent = "Endless";
    $("gameSub").textContent = `Step ${G.endless.steps + 1}` + (S.endlessBest ? ` · best ${S.endlessBest}` : "");
    $("gameStatus").innerHTML = "";
  } else if (G.mode === "daily") {
    $("gameTitle").textContent = `Daily #${store.dailyNumber(G.date)}`;
    $("gameSub").textContent = new Date(G.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    $("gameStatus").innerHTML = `${icon("flame")}${store.currentDailyStreak(S, G.date)}`;
  } else {
    $("gameTitle").textContent = "Rush";
    $("gameSub").textContent = `Solved ${G.rush.score} · no abilities`;
    const now = G.rush.pausedAt || Date.now();
    $("gameStatus").innerHTML = `${icon("timer")}${Math.ceil(Math.max(0, G.rush.endAt - now) / 1000)}`;
  }
  $("gameStatus").hidden = !$("gameStatus").innerHTML.trim();   // no empty pill where the hearts used to be
}

// ---------- Painting ----------
$("board").addEventListener("click", (e) => {
  const c = e.target.closest(".cell");
  if (!c || !G) return;
  const k = c.dataset.k;
  if (G.phase === "target") { applyTarget(k); return; }
  if (G.phase !== "solve") return;
  if (G.locked.has(k)) { toast("Revealed by an ability"); return; }
  const cur = G.marks.get(k);
  // Live cell: survive → die → unmarked.  Empty cell: born → unmarked.
  const next = G.start.has(k)
    ? (cur === undefined ? "survive" : cur === "survive" ? "die" : undefined)
    : (cur ? undefined : "born");
  next ? G.marks.set(k, next) : G.marks.delete(k);
  G.flags.delete(k);
  buzz(5);
  renderSolve();
});

$("clearBtn").onclick = () => {
  if (G?.phase !== "solve") return;
  for (const k of [...G.marks.keys()]) if (!G.locked.has(k)) G.marks.delete(k);
  G.flags.clear();
  renderSolve();
};

// ---------- Checking ----------
$("checkBtn").onclick = check;

async function check() {
  if (!G || G.phase !== "solve") return;
  const p = G.puzzle;
  const unmarked = [...G.start].filter((k) => !G.marks.has(k));
  if (unmarked.length) {
    for (const k of unmarked) $("board").querySelector(`[data-k="${k}"]`)?.classList.add("need");
    toast(`Mark every white cell first (${unmarked.length} left)`);
    return;
  }
  const res = grade(p, G.marks);
  if (G.mode === "rush") return rushChecked(res);
  if (res.mistakes === 0) return solved();

  // A wrong Check: flag the wrong marks (missed births only as a count) and take a heart.
  const wrong = [], missed = [];
  for (const [k, v] of res.cells) (v === "wrong" ? wrong : v === "missed" ? missed : []).push(k);
  G.attempts.push({
    label: G.mode === "endless" ? `Step ${G.endless.steps + 1}` : "",
    start: [...G.start], size: p.size, marks: [...G.marks], wrong, missed,
  });
  G.flags = new Set(wrong);
  buzz([30, 40, 30]);
  const msg = [wrong.length ? `${plural(wrong.length, "wrong cell")} flagged` : "", missed.length ? `${plural(missed.length, "birth")} missed somewhere` : ""].filter(Boolean).join(" · ");
  if (G.mode === "tutorial") {
    toast(`${msg}. Fix them and check again.`, 2600);
  } else if (G.shield) {
    G.shield = false;
    toast(`${icon("shield")} Shield saved your heart · ${msg}`, 2600);
  } else {
    G.hearts--;
    toast(`${msg} · −1 ${icon("heart", "fill heart-on")}`, 2600);
  }
  renderSolve();
  renderAbilities();
  updateBar();
  if (G.hearts <= 0) {
    G.phase = "out";
    renderAbilities();
    setTimeout(showContinue, 700);
  }
}

// ---------- Out of hearts: continue (ad first, then rising coin cost) ----------
const continueCost = () => 50 * 2 ** Math.max(0, G.continues - 1);

function showContinue() {
  if (!G || G.phase !== "out") return;
  const free = G.continues === 0;
  const cost = continueCost();
  $("continueText").textContent = free
    ? "Watch a short ad to get 1 more heart."
    : "Get 1 more heart. Each continue on this puzzle costs more.";
  const btn = $("continueBtn");
  btn.innerHTML = free ? `${icon("tv")}Watch ad · +1 heart` : S.coins >= cost ? `+1 heart for ${coinsHTML(cost)}` : `${icon("bag")}Get coins (need ${coinsHTML(cost)})`;
  btn.onclick = () => {
    if (free) {
      $("continueModal").hidden = true;
      showAd(() => restoreHearts(), "1 heart");
    } else if (spend(cost)) {
      $("continueModal").hidden = true;
      restoreHearts();
    } else {
      openShop();
    }
  };
  $("giveUpBtn").textContent = G.mode === "endless" ? "End the run" : "Give up and see the answer";
  $("continueModal").hidden = false;
}
function restoreHearts() {
  G.hearts = 1;
  G.continues++;
  G.phase = "solve";
  updateBar();
  renderAbilities();
  toast(`${icon("heart", "fill heart-on")} +1 heart`);
}
$("giveUpBtn").onclick = () => {
  $("continueModal").hidden = true;
  if (G.mode === "endless") endEndless();
  else finish(false);
};

// ---------- Mock rewarded ad ----------
const FAKE_ADS = [
  ["Totally Real Game 3", "Build your dream farm. Then build another one. Then another."],
  ["Crunchy Snacks Co.", "Snacks so crunchy you can hear them from here."],
  ["Mega Merge Saga", "Merge two things into a slightly bigger thing!"],
  ["Cloud Storage Pro", "Your photos, safely somewhere else."],
];
let adTimer;
function showAd(onReward, reward) {
  const [title, text] = FAKE_ADS[Math.floor(Math.random() * FAKE_ADS.length)];
  $("adTitle").textContent = title;
  $("adText").textContent = `${text} (Test ad: in the real app a 15–30 second video plays here.)`;
  const close = $("adClose");
  close.disabled = true;
  let left = 5;
  $("adTimer").textContent = `Reward in ${left}`;
  close.textContent = `Reward: ${reward}`;
  $("adModal").hidden = false;
  clearInterval(adTimer);
  adTimer = setInterval(() => {
    left--;
    $("adTimer").textContent = left > 0 ? `Reward in ${left}` : "Reward ready";
    if (left <= 0) { clearInterval(adTimer); close.disabled = false; close.innerHTML = `${icon("close")}Close ad · get ${reward}`; }
  }, 1000);
  close.onclick = () => { $("adModal").hidden = true; onReward(); };
}

// ---------- Finishing a puzzle ----------
const endSim = createSim($("endSim"), $("endSimCaption"));

function revealAnswer() {
  const p = G.puzzle;
  const last = grade(p, G.marks);
  renderBoard($("board"), p.size, new Set(p.frames[1]), {
    outcome: G.truth, results: last.cells, flip: changedCells(G.start, new Set(p.frames[1])),
  });
  $("board").classList.add("locked");
  $("controls").hidden = true;
  $("abilities").hidden = true;
  $("targetBanner").hidden = true;
}

function solved() {
  if (G.mode === "endless") return endlessSolved();
  finish(true);
}

function finish(win) {
  G.phase = "done";
  revealAnswer();
  const stars = !win ? 0 : G.mode === "tutorial" ? Math.max(1, 3 - G.attempts.length) : G.continues ? 1 : G.hearts;
  const lines = [];
  let title = win ? (stars === 3 ? "Perfect!" : "Solved!") : "Puzzle failed";
  if (win && G.continues) title = "Solved with a continue";
  let buttons;

  if (G.mode === "tutorial") {
    const last = G.step === TUTORIAL.length - 1;
    if (last) { S.tutorialDone = true; title = "Tutorial complete"; }
    lines.push(["Lesson reward", 5]);
    buttons = last
      ? [["Home", goHomeNow, false, "back"], ["Choose difficulty", () => { goHomeNow(); setTimeout(() => go("difficulty"), 80); }, true, "next"]]
      : [["Skip tutorial", skipTutorial], ["Next lesson", () => playTutorial(G.step + 1), true, "next"]];
  }

  if (G.mode === "play") {
    store.recordPerfect(S, stars === 3);
    store.recordDifficulty(S, G.diff, stars);
    S.totalStars += stars;
    if (win) {
      lines.push([`Solved ${difficulty(G.diff).name}`, PLAY_COINS[G.diff]]);
      if (stars === 3) lines.push(["Perfect bonus", Math.round(PLAY_COINS[G.diff] / 2)]);
      if (stars === 3 && S.perfectStreak >= 3) lines.push([`${S.perfectStreak} perfect in a row`, 5]);
    }
    buttons = [["Home", goHomeNow, false, "back"], ["Next puzzle", () => playDifficulty(G.diff), true, "next"]];
  }

  if (G.mode === "daily") {
    store.recordPerfect(S, stars === 3);
    S.totalStars += stars;
    if (win) {
      lines.push(["Daily puzzle", 20]);
      if (!G.continues) lines.push([plural(G.hearts, "heart") + " left", 10 * G.hearts]);
    }
    store.recordDaily(S, G.date, {
      stars, win, checks: G.attempts.length + (win ? 1 : 0), firstMarks: G.attempts[0]?.marks || [...G.marks],
      attempts: G.attempts, used: G.used, finalMarks: [...G.marks], continues: G.continues,
    });
    buttons = [["Home", goHomeNow, false, "back"], ["Share", shareDaily, true, "share"]];
  }

  const earned = lines.reduce((t, [, n]) => t + n, 0);
  if (earned) earn(earned);
  store.save(S);
  updateBar();
  const text = G.mode === "daily" && G.used.length ? `${plural(G.used.length, "ability")} used: your shared result will say so`
    : win ? "" : "Here's the right answer and where it goes next.";
  const game = G;
  setTimeout(() => { if (G === game) openEnd({ stars, title, text, lines, preview: true, buttons }); }, 800);
}

// ---------- End-of-puzzle popup: replay window, coins, mistakes ----------
function openEnd({ stars, title, text = "", lines = [], preview, buttons }) {
  const game = G;
  setStars($("endStars"), stars);
  $("endTitle").textContent = title;
  $("endText").innerHTML = text;
  $("endText").hidden = !text;
  const earned = lines.reduce((t, [, n]) => t + n, 0);
  $("endCoins").innerHTML = lines.map(([l, n]) => `<div><span>${l}</span><span>+${coinsHTML(n)}</span></div>`).join("")
    + `<div class="total"><span>${earned ? "Coins earned" : "No coins this time"}</span><span>${earned ? "+" + coinsHTML(earned) : ""}</span></div>`
    + `<div class="balance"><span>Balance</span><span>${coinsHTML(S.coins)}</span></div>`;

  G.preview = preview;
  $("endMistakes").hidden = G.attempts.length === 0;
  $("endMistakes").onclick = () => toggleReview(!G.reviewing);
  toggleReview(false, true);

  const box = $("endButtons");
  box.innerHTML = "";
  for (const [label, fn, primary, ic] of buttons) {
    const b = document.createElement("button");
    b.innerHTML = ic === "next" ? label + icon(ic) : (ic && ic !== "back" ? icon(ic) : "") + label;
    b.className = primary ? "primary" : "soft";
    b.onclick = fn;
    box.appendChild(b);
  }
  $("endModal").hidden = false;
  $("endModal").firstElementChild.scrollTop = 0;
  if (preview) requestAnimationFrame(() => { if (G === game && !G.reviewing) endSim.play(new Set(G.puzzle.frames[1]), G.puzzle.size); });
}

function toggleReview(on, quiet = false) {
  G.reviewing = on;
  $("endReview").hidden = !on;
  $("endPreview").hidden = on || !G.preview;
  $("endMistakesLabel").textContent = on ? (G.preview ? "Back to the replay" : "Hide mistakes") : `Check mistakes (${plural(G.attempts.length, "wrong check")})`;
  if (on) { endSim.stop(); showAttempt(0); }
  else if (G.preview && !quiet) endSim.play(new Set(G.puzzle.frames[1]), G.puzzle.size);
}

const MARK_WORD = { survive: "survives", die: "dies", born: "born" };
// Why a cell does what it does, in plain words.
function explain(k, start, marked) {
  const [x, y] = parse(k);
  const n = neighbours(start, x, y), alive = start.has(k);
  const nb = `${n} live ${n === 1 ? "neighbour" : "neighbours"}`;
  let why;
  if (alive) why = n < 2 ? `${nb}: too lonely, so it dies` : n <= 3 ? `${nb}, so it survives` : `${nb}: too crowded, so it dies`;
  else why = n === 3 ? "exactly 3 live neighbours, so it's born" : `${nb}; it needs exactly 3 to be born, so it stays empty`;
  const yours = marked ? `you marked it <b>${MARK_WORD[marked]}</b>` : alive ? "you left it unmarked" : "you left it empty";
  return `<b>Row ${y + 1}, column ${x + 1}</b>: ${yours}. It has ${why}.`;
}

function showAttempt(i) {
  const list = G.attempts;
  const a = list[i];
  G.reviewIndex = i;
  const start = new Set(a.start), marks = new Map(a.marks);
  const results = new Map([...a.wrong.map((k) => [k, "wrong"]), ...a.missed.map((k) => [k, "missed"])]);
  $("revTitle").textContent = `${a.label ? a.label + " · " : ""}Wrong check ${i + 1} of ${list.length}`;
  $("revPrev").disabled = i === 0;
  $("revNext").disabled = i === list.length - 1;
  renderBoard($("revBoard"), a.size, start, { marks, results });
  const nWrong = a.wrong.length, nMissed = a.missed.length;
  $("revWhy").innerHTML = `<span class="prompt">${icon("search")}Tap the outlined cells to see what went wrong`
    + `<small>${[nWrong ? plural(nWrong, "wrong cell") : "", nMissed ? plural(nMissed, "missed birth") : ""].filter(Boolean).join(" · ")}</small></span>`;
  $("revBoard").onclick = (e) => {
    const c = e.target.closest(".cell");
    if (!c) return;
    $("revBoard").querySelectorAll(".picked").forEach((el) => el.classList.remove("picked"));
    c.classList.add("picked");
    $("revWhy").innerHTML = explain(c.dataset.k, start, marks.get(c.dataset.k));
  };
}
$("endReplay").onclick = () => endSim.replay();
$("revPrev").onclick = () => showAttempt(Math.max(0, G.reviewIndex - 1));
$("revNext").onclick = () => showAttempt(Math.min(G.attempts.length - 1, G.reviewIndex + 1));

// ---------- Play: tutorial, then pick a difficulty ----------
function startPlay() {
  if (!S.tutorialDone) playTutorial(0);
  else go("difficulty");
}
$("playBtn").onclick = startPlay;

function newGame(mode, extra = {}) {
  G = { mode, hearts: HEARTS, continues: 0, attempts: [], used: [], shield: false, ...extra };
  return G;
}

function playTutorial(stepIndex) {
  newGame("tutorial", { step: stepIndex, hearts: Infinity });
  go("game");
  startPuzzle(fromTutorial(TUTORIAL[stepIndex]));
}
function skipTutorial() {
  S.tutorialDone = true;
  store.save(S);
  goHomeNow();
  setTimeout(() => go("difficulty"), 80);
}
$("tutorialBtn").onclick = () => playTutorial(0);

// Little 3×3 badges that fill up as the difficulty rises.
const TINTS = ["survive", "survive", "born", "born", "die", "die"];
const DOTS = [
  [0, 0, 0, 0, 1, 1, 0, 0, 0],
  [0, 1, 0, 0, 1, 1, 0, 0, 0],
  [0, 1, 0, 0, 1, 1, 1, 0, 0],
  [1, 1, 0, 0, 1, 1, 1, 0, 0],
  [1, 1, 0, 1, 1, 1, 1, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
].map((row) => row.map(Boolean));

function renderDifficulties() {
  const list = $("diffList");
  if (list.childElementCount !== DIFFICULTIES.length) {
    list.innerHTML = DIFFICULTIES.map((d, i) => `
      <button class="diff" data-id="${d.id}" style="--tint: var(--${TINTS[i]})">
        <span class="diff-badge"><span>${DOTS[i].map((on) => `<i${on ? ' class="on"' : ""}></i>`).join("")}</span></span>
        <span class="diff-text"><b>${d.name}</b><small>${d.size}×${d.size} board · ${d.live[0]}–${d.live[1]} blocks</small></span>
        <span class="diff-stats"></span>
        <span class="diff-meter">${DIFFICULTIES.map((_, j) => `<i${j <= i ? ' class="on"' : ""}></i>`).join("")}</span>
      </button>`).join("");
    list.querySelectorAll(".diff").forEach((b) => (b.onclick = () => playDifficulty(b.dataset.id)));
  }
  list.querySelectorAll(".diff").forEach((b) => {
    const st = S.diffStats[b.dataset.id];
    b.querySelector(".diff-stats").innerHTML = st?.solved ? `${icon("star", "fill")}${st.solved} solved` : coinsHTML(PLAY_COINS[b.dataset.id]) + "+";
    b.classList.toggle("last", b.dataset.id === S.lastDifficulty);
  });
}

// Recent shapes per difficulty, so puzzles don't repeat.
const recent = {};
function playDifficulty(id) {
  S.lastDifficulty = id;
  store.save(S);
  const list = (recent[id] ||= []);
  const p = makePuzzle(`${id}-${Date.now()}-${Math.random()}`, difficulty(id), new Set(list));
  list.push(puzzleShape(p));
  if (list.length > 12) list.shift();
  newGame("play", { diff: id });
  go("game");
  startPuzzle(p);
}

// ---------- Endless: your answer becomes the next puzzle ----------
const signature = (cells) => [...cells].sort().join(";");

function playEndless() {
  newGame("endless", { endless: { steps: 0, cells: null, seen: new Set(), coins: 0 } });
  go("game");
  newEndlessPattern();
}
$("endlessBtn").onclick = playEndless;

function newEndlessPattern() {
  const e = G.endless;
  e.cells = endlessStart(`endless-${Date.now()}-${Math.random()}`, ENDLESS_SIZE);
  e.seen = new Set();
  nextEndlessRound();
}

function nextEndlessRound() {
  const e = G.endless;
  const sig = signature(e.cells);
  const round = e.seen.has(sig) ? null : endlessRound(e.cells, ENDLESS_SIZE);
  if (!round) {
    toast("The pattern settled down. Here's a fresh one", 2200);
    return newEndlessPattern();
  }
  e.seen.add(sig);
  startPuzzle(round);
}

async function endlessSolved() {
  const e = G.endless, game = G;
  G.phase = "done";
  e.steps++;
  e.coins += 4;
  earn(4);
  revealAnswer();
  toast(`Step ${e.steps} done · +${coinsHTML(4)}`, 1100);
  updateBar();
  await wait(1100);
  if (G !== game) return;
  e.cells = new Set(G.puzzle.frames[1]);
  nextEndlessRound();
}

// Endless ends when you're out of hearts and choose to stop.
function endEndless() {
  const e = G.endless;
  G.phase = "done";
  revealAnswer();
  const best = e.steps > S.endlessBest;
  S.endlessBest = Math.max(S.endlessBest, e.steps);
  store.save(S);
  openEnd({
    stars: null, title: best && e.steps ? "New best!" : "Run over",
    text: `You predicted ${plural(e.steps, "step")} · best ${S.endlessBest}`,
    lines: e.coins ? [[`${plural(e.steps, "step")} predicted`, e.coins]] : [], preview: false,
    buttons: [["Home", goHomeNow, false, "back"], ["New run", playEndless, true, "replay"]],
  });
}

// ---------- Daily ----------
function playDaily() {
  stopRush();
  const date = store.today();
  const saved = S.daily.results[date];
  newGame("daily", { date });
  go("game");
  startPuzzle(dailyPuzzle(date));
  if (saved) {
    // Already played today: show the answer, replay, mistakes and share again.
    G.attempts = saved.attempts || [];
    G.used = saved.used || [];
    G.marks = new Map(saved.finalMarks || []);
    G.phase = "done";
    revealAnswer();
    openEnd({
      stars: saved.stars, title: "Come back tomorrow",
      text: `Next puzzle in ${hoursLeft()}` + (G.used.length ? ` · ${plural(G.used.length, "ability")} used` : ""),
      lines: [], preview: true,
      buttons: [["Home", goHomeNow, false, "back"], ["Share", shareDaily, true, "share"]],
    });
  }
}
const hoursLeft = () => {
  const t = new Date(); t.setHours(24, 0, 0, 0);
  const m = Math.ceil((t - Date.now()) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};
$("dailyBtn").onclick = playDaily;

// Wordle-style result, cropped to the cells that mattered:
// green = right on the first check, yellow = fixed on a later check, red = never right.
function dailyShareText() {
  const date = G.date, saved = S.daily.results[date], p = G.puzzle;
  const first = grade(p, new Map(saved.firstMarks)).cells;
  const final = grade(p, new Map(saved.finalMarks || saved.firstMarks)).cells;
  const cells = new Set([...first.keys(), ...final.keys()]);
  let x0 = p.size, y0 = p.size, x1 = -1, y1 = -1;
  for (const k of cells) {
    const [x, y] = parse(k);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let row = "";
    for (let x = x0; x <= x1; x++) {
      const k = key(x, y);
      if (!cells.has(k)) row += "⬛";
      else if (first.get(k) === "ok") row += "🟩";
      else if (saved.win || final.get(k) === "ok") row += "🟨";
      else row += "🟥";
    }
    rows.push(row);
  }
  const headline = !saved.win ? "Not solved this time"
    : saved.continues ? `Solved in ${plural(saved.checks, "check")}, with a continue`
    : saved.checks === 1 ? `Solved on the first check · ${saved.stars}/3 hearts`
    : `Solved in ${saved.checks} checks · ${saved.stars}/3 hearts`;
  const used = [...new Set(saved.used || [])].map((id) => abilityById(id).name);
  const streak = store.currentDailyStreak(S, date);
  return [
    `Color Life · Daily #${store.dailyNumber(date)}`,
    headline,
    ...rows,
    ...(used.length ? [`Help used: ${used.join(", ")}`] : []),
    ...(streak > 1 ? [`Streak: ${streak} days`] : []),
    SITE.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  ].join("\n");
}

async function shareDaily() {
  const text = dailyShareText();
  const native = window.Capacitor?.Plugins?.Share;
  try {
    if (native) { await native.share({ text, dialogTitle: "Share your result" }); return; }
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) {
    if (/cancel|abort/i.test(String(e?.message || e?.name))) return;
  }
  copyText(text);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (_) {}
    ta.remove();
  }
  toast("Result copied: paste it anywhere");
}

// ---------- Rush (no hearts, no abilities) ----------
function playRush() {
  stopRush();
  newGame("rush", { hearts: Infinity, rush: { seed: Date.now().toString(36), index: 0, score: 0, endAt: Date.now() + RUSH_MS, over: false, recent: [] } });
  go("game");
  nextRush();
  rushTimer = setInterval(() => {
    if (!G || G.mode !== "rush") return stopRush();
    if (G.rush.pausedAt) return;
    updateBar();
    if (Date.now() >= G.rush.endAt) endRush();
  }, 200);
}
$("rushBtn").onclick = playRush;

function nextRush() {
  const r = G.rush;
  const p = makePuzzle(`rush-${r.seed}-${r.index}`, rushConfig(r.index++), new Set(r.recent));
  r.recent.push(puzzleShape(p));
  if (r.recent.length > 10) r.recent.shift();
  startPuzzle(p);
}

async function rushChecked(res) {
  const game = G;
  G.phase = "done";
  if (res.stars === 3) { G.rush.score++; toast("+1", 600); } else buzz([30, 40, 30]);
  renderBoard($("board"), G.puzzle.size, new Set(G.puzzle.frames[1]), { outcome: G.truth, results: res.cells });
  updateBar();
  await wait(450);
  if (G === game && !G.rush.over) nextRush();
}

function endRush() {
  stopRush();
  const r = G.rush;
  r.over = true;
  G.phase = "done";
  $("controls").hidden = true;
  $("board").classList.add("locked");
  const best = r.score > S.rushBest;
  S.rushBest = Math.max(S.rushBest, r.score);
  if (r.score) earn(r.score * 3);
  store.save(S);
  updateBar();
  openEnd({
    stars: null, title: best && r.score ? "New best!" : "Time's up",
    text: `You solved ${plural(r.score, "puzzle")} · best ${S.rushBest}`,
    lines: r.score ? [[`${plural(r.score, "puzzle")} solved`, r.score * 3]] : [], preview: false,
    buttons: [["Home", goHomeNow, false, "back"], ["Play again", playRush, true, "replay"]],
  });
}

function stopRush() { clearInterval(rushTimer); rushTimer = null; }

// ---------- Shop (mocked purchases for the playtest) ----------
const PACKS = [
  { coins: 500, price: "$0.99" },
  { coins: 1200, price: "$1.99", tag: "Popular" },
  { coins: 3000, price: "$4.99", tag: "Best value" },
  { coins: 7000, price: "$9.99" },
];

function openShop() {
  if (current === "game" && G && !$("continueModal").hidden) { G.reopenContinue = true; $("continueModal").hidden = true; }
  go("shop");
}

function adCoinsLeft() {
  const d = store.today();
  if (S.adCoins.date !== d) S.adCoins = { date: d, count: 0 };
  return AD_COINS_PER_DAY - S.adCoins.count;
}

function renderShop() {
  const left = adCoinsLeft();
  $("adCoinsSub").innerHTML = left > 0 ? `+${coinsHTML(AD_COINS)} · ${left} left today` : "Come back tomorrow";
  $("adCoinsBtn").disabled = left <= 0;
  const claimed = S.dailyBonus === store.today();
  $("dailyBonusSub").innerHTML = claimed ? "Claimed today · come back tomorrow" : `+${coinsHTML(DAILY_BONUS)} once a day`;
  $("dailyBonusBtn").disabled = claimed;
  const packs = $("packs");
  if (!packs.childElementCount) {
    packs.innerHTML = PACKS.map((p, i) => `
      <button class="pack" data-i="${i}">
        ${p.tag ? `<span class="pack-tag">${p.tag}</span>` : ""}
        <span class="pack-coins">${Array.from({ length: i + 1 }, () => icon("coin", "coin")).join("")}</span>
        <b>${p.coins.toLocaleString()}</b><small>coins</small>
        <span class="pack-price">${p.price}</span>
      </button>`).join("");
    packs.querySelectorAll(".pack").forEach((b) => (b.onclick = () => buyPack(PACKS[+b.dataset.i])));
  }
}

$("adCoinsBtn").onclick = () => {
  if (adCoinsLeft() <= 0) return;
  showAd(() => {
    S.adCoins.count++;
    earn(AD_COINS);
    renderShop();
    toast(`+${coinsHTML(AD_COINS)} from the ad`);
  }, `${AD_COINS} coins`);
};
$("dailyBonusBtn").onclick = () => {
  if (S.dailyBonus === store.today()) return;
  S.dailyBonus = store.today();
  earn(DAILY_BONUS);
  renderShop();
  toast(`Daily bonus · +${coinsHTML(DAILY_BONUS)}`);
};

function buyPack(p) {
  $("buyName").textContent = `${p.coins.toLocaleString()} coins`;
  $("buyPrice").textContent = p.price;
  const btn = $("buyGo");
  btn.disabled = false;
  btn.textContent = `Buy · ${p.price}`;
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "Processing…";
    await wait(1100);
    $("buyModal").hidden = true;
    earn(p.coins);
    renderShop();
    toast(`Test purchase complete · +${coinsHTML(p.coins)}`, 2400);
  };
  $("buyModal").hidden = false;
}
$("buyCancel").onclick = () => ($("buyModal").hidden = true);

// ---------- Themes ----------
function setTheme(id) {
  S.theme = id;
  applyTheme(id);
  store.save(S);
  renderThemes();
}

function renderThemes() {
  $("appearance").innerHTML = APPEARANCES.map((a) =>
    `<button class="${S.theme === a.id ? "on" : ""}" data-id="${a.id}">${icon(a.icon)}<span>${a.name}</span></button>`).join("");
  $("appearance").querySelectorAll("button").forEach((b) => (b.onclick = () => setTheme(b.dataset.id)));
  const list = $("themeList");
  list.innerHTML = "";
  for (const t of THEMES) {
    const owned = FREE.includes(t.id) || S.themes.includes(t.id), on = S.theme === t.id;
    const b = document.createElement("button");
    b.className = "theme" + (on ? " on" : "");
    const v = previewVars(t.id);
    b.innerHTML = `<span class="swatches" style="background:${v.bg}"><i style="background:${v.live}"></i><i style="background:${v.survive}"></i><i style="background:${v.die}"></i><i style="background:${v.born}"></i></span>
      <b>${t.name}</b><small>${on ? icon("check") + "In use" : owned ? "Use" : coinsHTML(t.price)}</small>`;
    b.onclick = () => {
      if (!owned) {
        if (!spend(t.price)) { toast(`You need ${t.price - S.coins} more coins`); return; }
        S.themes.push(t.id);
        toast(`${t.name} unlocked!`);
      }
      setTheme(t.id);
    };
    list.appendChild(b);
  }
}
$("themesBtn").onclick = () => go("themes");

// ---------- Playground ----------
$("playgroundBtn").onclick = () => {
  go("playground");
  openPlayground();
  if (!S.seenPlayground) {
    S.seenPlayground = true;
    store.save(S);
    showPopup({
      step: "Free play", title: "Playground",
      body: "No levels and no score. Draw any pattern on an endless board and watch the rules of life play out, step by step.",
      how: [
        ["pencil", "<b>Tap</b> squares to draw or erase cells, then press <b>Start</b> to watch them evolve."],
        ["steps", "Use <b>Next</b> and <b>Undo</b> to go one step at a time: guess first, then check."],
        ["eye", 'Turn on <b>Colour hints</b> to see what survives <i class="sw survive"></i>, dies <i class="sw die"></i> and is born <i class="sw born"></i> next.'],
        ["orbit", "Watch the starter patterns: the <b>glider</b> walks across the board, the <b>blinker</b> flips forever."],
        ["dice", "<b>Random</b> fills the screen. See what's left standing after a few hundred steps."],
      ].map(([ic, text]) => `<p><span class="how-icon">${icon(ic)}</span><span>${text}</span></p>`).join(""),
      button: "Start playing",
    });
  }
};

// ---------- How to play (home button and the ? in the game bar) ----------
function openRules() {
  if (current === "game" && G?.mode === "rush" && !G.rush.over) G.rush.pausedAt = Date.now();   // pause the clock
  $("rules").hidden = false;
}
function closeRules() {
  $("rules").hidden = true;
  if (G?.rush?.pausedAt) { G.rush.endAt += Date.now() - G.rush.pausedAt; G.rush.pausedAt = null; }
  if (!S.seenRules) { S.seenRules = true; store.save(S); }
}
$("rulesBtn").onclick = openRules;
document.querySelectorAll("[data-rules]").forEach((b) => (b.onclick = openRules));
$("rulesClose").onclick = closeRules;
$("rulesOk").onclick = closeRules;
$("rules").addEventListener("click", (e) => { if (e.target === $("rules")) closeRules(); });
window.addEventListener("keydown", (e) => {
  if (!$("lesson").hidden) { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); closeLesson(); } return; }
  if (!$("rules").hidden) { if (e.key === "Escape") closeRules(); return; }
  if (e.key === "Escape" && G?.phase === "target") cancelTarget();
  if (e.key === "Enter" && current === "game" && G?.phase === "solve") check();
});

// ---------- Start ----------
show("home");

// Offline support for the installable web app (not needed inside the Android app).
if ("serviceWorker" in navigator && !window.Capacitor && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
