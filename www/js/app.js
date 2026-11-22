// Color Life — "predict the next step" puzzle game.
import { levelPuzzle, dailyPuzzle, rushPuzzle, grade, TUTORIAL } from "./puzzles.js";
import { key } from "./life.js";
import * as store from "./store.js";
import { THEMES, applyTheme } from "./themes.js";
import { openPlayground, closePlayground } from "./playground.js";

const $ = (id) => document.getElementById(id);
const SITE = "https://tvaliashvilisandro.github.io/color-life-app/";
const RUSH_MS = 60_000;
const FREE_HEARTS_PER_DAY = 3;

const S = store.load();
store.tickLives(S);
applyTheme(S.theme);

let G = null;              // the puzzle being played
let current = "home";
let rushTimer = null;

// ---------- Helpers ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch (_) {} };
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const starText = (n) => "★".repeat(n) + "☆".repeat(3 - n);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

let toastTimer;
function toast(msg, ms = 1800) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// ---------- Navigation (also makes Android's back button return home) ----------
const SCREENS = ["home", "game", "nolives", "themes", "playground"];
function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  current = id;
  refresh();
}
function go(id) {
  if (current === "home" && id !== "home") history.pushState({ s: id }, "");
  show(id);
}
function goHome() {
  stopRush();
  closePlayground();
  G = null;
  $("rules").hidden = true;
  closeLesson();
  show("home");
}
history.replaceState({ s: "home" }, "");
window.addEventListener("popstate", goHome);
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => history.back()));

// ---------- Status text ----------
function livesHTML() {
  store.tickLives(S);
  const next = store.nextLifeIn(S);
  return `❤️ ${S.lives}` + (next ? ` <small>${mmss(next)}</small>` : "");
}

function refresh() {
  store.tickLives(S);
  if (current === "home") refreshHome();
  if (current === "nolives") refreshNoLives();
  if (current === "themes") renderThemes();
  if (current === "game" && G?.puzzle) updateBar();
}

function refreshHome() {
  $("homeLives").innerHTML = livesHTML();
  $("homeCoins").textContent = `🪙 ${S.coins}`;
  $("playSub").textContent = S.level <= TUTORIAL.length
    ? `Level ${S.level} · Tutorial: ${TUTORIAL[S.level - 1].title}`
    : `Level ${S.level}`;
  const d = store.today(), n = store.dailyNumber(d), done = S.daily.results[d];
  $("dailySub").textContent = done ? `#${n} done ${starText(done.stars)} · new one tomorrow` : `#${n} · today's puzzle is ready`;
  $("dailyBtn").classList.toggle("done", !!done);
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

function renderBoard(el, size, live, { marks, outcome, results, flip } = {}) {
  el.style.setProperty("--n", size);
  let html = "";
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = key(x, y);
      let cls = "cell";
      if (live.has(k)) cls += " live";
      const m = marks?.get(k); if (m) cls += " m-" + m;
      const o = outcome?.get(k); if (o) cls += " o-" + o;
      if (flip?.has(k)) cls += " flip";
      const r = results?.get(k);
      const badge = r ? `<span class="badge ${r}">${r === "ok" ? "✓" : r === "wrong" ? "✕" : "!"}</span>` : "";
      html += `<div class="${cls}" data-k="${k}" style="--d:${(x + y) * 35}ms">${badge}</div>`;
    }
  el.innerHTML = html;
}

// ---------- Tutorial lessons (popup before each of the first 5 levels) ----------
// Example grids are 3×3, middle cell = index 4. "on" = live, "" = empty.
const TAP = {
  survive: '<span class="tap-demo"><i class="on"></i>→<i class="survive">●</i></span><span>Tap a white cell <b>once</b> = 🟢 survives</span>',
  die: '<span class="tap-demo"><i class="on"></i>→<i class="die">✕</i></span><span>Tap a white cell <b>twice</b> = 🔴 dies</span>',
  born: '<span class="tap-demo"><i></i>→<i class="born">+</i></span><span>Tap an <b>empty</b> cell = 🟡 born</span>',
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
    body: "Use every rule at once. Check each white cell, then look for empty cells with exactly 3 neighbours.",
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
  return `<div class="lesson-grids"><div>${grid(L.before)}<small>now</small></div><span class="arrow">→</span><div>${grid(after)}<small>next step</small></div></div>`;
}

function showLesson(level) {
  const L = LESSONS[level - 1];
  $("lessonStep").textContent = `Lesson ${level} of ${LESSONS.length}`;
  $("lessonTitle").textContent = L.title;
  $("lessonExample").innerHTML = lessonExample(L);
  $("lessonBody").innerHTML = L.body;
  $("lessonHow").innerHTML = L.how.map((t) => `<p>${TAP[t]}</p>`).join("");
  const m = $("lesson");
  m.hidden = false;
  m.firstElementChild.style.animation = "none"; void m.offsetWidth; m.firstElementChild.style.animation = "";
  $("lessonGo").focus();
}
const closeLesson = () => { $("lesson").hidden = true; };
$("lessonGo").onclick = closeLesson;

// ---------- Puzzle setup ----------
function setupPuzzle(puzzle) {
  Object.assign(G, { puzzle, marks: new Map(), choice: null, phase: "solve" });
  const before = puzzle.kind === "before";
  $("result").hidden = true;
  $("controls").hidden = false;
  $("board").classList.remove("locked");
  document.querySelector(".stage").classList.toggle("before", before);
  for (const id of ["targetLabel", "optionsLabel", "options"]) $(id).hidden = !before;
  $("legend").hidden = before;
  $("clearBtn").hidden = before;

  if (before) {
    G.start = new Set(puzzle.target);
    renderBoard($("board"), puzzle.size, G.start);
    renderOptions();
  } else {
    G.start = new Set(puzzle.frames[0]);
    renderSolve();
  }
  $("hint").innerHTML = hintFor(puzzle);
  updateBar();
  if (G.mode === "level" && G.level <= TUTORIAL.length) showLesson(G.level);
}

function hintFor(p) {
  if (p.hint) return "";            // tutorial levels explain themselves in the lesson popup
  if (p.kind === "before") return "Pick the board that turns into this one after <b>one step</b>.";
  if (p.steps > 1) return "Predict <b>2 steps ahead</b>: mark how each cell ends up after two steps.";
  if (G.mode === "daily" || (G.mode === "level" && G.level <= 8))
    return "Mark every white cell 🟢 or 🔴, and the empty cells that will be born 🟡.";
  return "";
}

function updateBar() {
  const p = G.puzzle;
  if (G.mode === "level") {
    $("gameTitle").textContent = `Level ${G.level}`;
    $("gameSub").textContent = G.level <= TUTORIAL.length
      ? `Tutorial ${G.level}/${TUTORIAL.length} · ${TUTORIAL[G.level - 1].title}`
      : describe(p);
    $("gameStatus").innerHTML = livesHTML();
  } else if (G.mode === "daily") {
    $("gameTitle").textContent = `Daily #${store.dailyNumber(G.date)}`;
    $("gameSub").textContent = new Date(G.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    $("gameStatus").textContent = `🔥 ${store.currentDailyStreak(S, G.date)}`;
  } else {
    $("gameTitle").textContent = "Rush";
    $("gameSub").textContent = `Solved ${G.rush.score}`;
    const now = G.rush.pausedAt || Date.now();
    $("gameStatus").textContent = `⏱ ${Math.ceil(Math.max(0, G.rush.endAt - now) / 1000)}`;
  }
}
const describe = (p) => p.kind === "before" ? "Which came before?" : `${p.size}×${p.size}` + (p.steps > 1 ? " · 2 steps ahead" : "");

// ---------- Painting ----------
function renderSolve() {
  renderBoard($("board"), G.puzzle.size, G.start, { marks: G.marks });
}

$("board").addEventListener("click", (e) => {
  const c = e.target.closest(".cell");
  if (!c || !G || G.phase !== "solve" || G.puzzle.kind !== "predict") return;
  const k = c.dataset.k, cur = G.marks.get(k);
  // Live cell: survive → die → unmarked.  Empty cell: born → unmarked.
  const next = G.start.has(k)
    ? (cur === undefined ? "survive" : cur === "survive" ? "die" : undefined)
    : (cur ? undefined : "born");
  next ? G.marks.set(k, next) : G.marks.delete(k);
  buzz(5);
  renderSolve();
});

$("clearBtn").onclick = () => { if (G?.phase === "solve") { G.marks.clear(); renderSolve(); } };

function renderOptions() {
  const box = $("options");
  box.innerHTML = G.puzzle.options.map((_, i) => `<button data-i="${i}" aria-label="Option ${i + 1}"><div class="board"></div></button>`).join("");
  [...box.children].forEach((b, i) => {
    renderBoard(b.firstChild, G.puzzle.size, new Set(G.puzzle.options[i]));
    b.onclick = () => {
      if (G.phase !== "solve") return;
      G.choice = i;
      [...box.children].forEach((o, j) => o.classList.toggle("picked", j === i));
    };
  });
}

// ---------- Checking ----------
$("checkBtn").onclick = check;

async function check() {
  if (!G || G.phase !== "solve") return;
  const p = G.puzzle, game = G;

  if (p.kind === "before") {
    if (G.choice === null) { toast("Pick one of the four boards"); return; }
    G.phase = "reveal";
    const ok = G.choice === p.answer;
    [...$("options").children].forEach((o, i) => {
      o.classList.remove("picked");
      if (i === p.answer) o.classList.add("right");
      else if (i === G.choice) o.classList.add("wrong");
    });
    if (!ok) buzz([30, 40, 30]);
    $("controls").hidden = true;
    await wait(600);
    if (G === game) finish({ stars: ok ? 3 : 0, mistakes: ok ? 0 : 1 });
    return;
  }

  const unmarked = [...G.start].filter((k) => !G.marks.has(k));
  if (unmarked.length) {
    for (const k of unmarked) $("board").querySelector(`[data-k="${k}"]`)?.classList.add("need");
    toast(`Mark every white cell first (${unmarked.length} left)`);
    return;
  }

  const res = grade(p, G.marks);
  G.phase = "reveal";
  G.result = res;
  $("board").classList.add("locked");
  $("controls").hidden = true;
  if (res.mistakes) buzz([30, 40, 30]);
  await animateReveal(p, res);
  if (G === game && G.phase === "reveal") finish(res);
}

async function animateReveal(p, res, instant = false) {
  const fr = p.frames.map((f) => new Set(f));
  const fast = G.mode === "rush";
  if (!instant) {
    for (let i = 1; i < fr.length - 1; i++) {
      renderBoard($("board"), p.size, fr[i], { flip: changedCells(fr[i - 1], fr[i]) });
      await wait(fast ? 300 : 700);
    }
  }
  const last = fr[fr.length - 1];
  renderBoard($("board"), p.size, last, {
    outcome: outcomeMap(p),
    results: res.cells,
    flip: instant ? null : changedCells(fr[fr.length - 2], last),
  });
  if (!instant) await wait(fast ? 450 : 650);
}

function mistakesText(res) {
  return res.mistakes ? plural(res.mistakes, "mistake") : "No mistakes";
}
function titleFor(stars) {
  if (stars === 3) return S.perfectStreak >= 3 ? `Perfect! ✨ ${S.perfectStreak} in a row` : "Perfect!";
  return ["Not quite", "Good", "Great!"][stars];
}

function finish(res) {
  if (G.mode === "rush") return rushAnswered(res);
  const { stars } = res;
  store.recordPerfect(S, stars === 3);

  if (G.mode === "level") {
    let text;
    if (stars > 0) {
      S.coins += stars;
      S.totalStars += stars;
      S.level = G.level + 1;
      S.attempt = 0;
      text = `${mistakesText(res)} · +${stars} 🪙`;
      if (G.level === TUTORIAL.length) text += " · Tutorial complete! 🎉";
    } else {
      store.loseLife(S);
      S.attempt++;
      text = G.puzzle.kind === "before" ? "That one doesn't turn into this board · −1 ❤️" : `${mistakesText(res)} · −1 ❤️`;
    }
    store.save(S);
    updateBar();
    const next = stars > 0 ? "Next level ▶" : S.lives > 0 ? "Try another ▶" : "Out of hearts";
    showResult(stars, titleFor(stars), text, [["Home", () => history.back()], [next, playLevel, true]]);
    return;
  }

  // daily
  const coins = stars * 3 + 2;
  S.coins += coins;
  store.recordDaily(S, G.date, { stars, mistakes: res.mistakes, marks: [...G.marks] });
  store.save(S);
  updateBar();
  const streak = store.currentDailyStreak(S, G.date);
  showResult(stars, titleFor(stars), `${mistakesText(res)} · +${coins} 🪙 · 🔥 ${plural(streak, "day")}`,
    [["Home", () => history.back()], ["Share 📤", shareDaily, true]]);
}

function showResult(stars, title, text, buttons) {
  const r = $("result");
  $("stars").hidden = stars === null;
  [...$("stars").children].forEach((s, i) => s.classList.toggle("on", stars !== null && i < stars));
  $("resultTitle").textContent = title;
  $("resultText").textContent = text;
  const box = $("resultButtons");
  box.innerHTML = "";
  for (const [label, fn, primary] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    if (primary) b.className = "primary";
    b.onclick = fn;
    box.appendChild(b);
  }
  r.hidden = false;
  r.style.animation = "none"; void r.offsetWidth; r.style.animation = "";
}

// ---------- Play (levels) ----------
function playLevel() {
  store.tickLives(S);
  if (S.lives <= 0) { go("nolives"); return; }
  G = { mode: "level", level: S.level };
  go("game");
  setupPuzzle(levelPuzzle(S.level, S.attempt));
}
$("playBtn").onclick = playLevel;

// ---------- Daily ----------
function playDaily() {
  stopRush();
  const date = store.today();
  G = { mode: "daily", date };
  go("game");
  setupPuzzle(dailyPuzzle(date));
  const saved = S.daily.results[date];
  if (saved) {
    // Already played today: show the answer and the shareable result again.
    G.marks = new Map(saved.marks);
    G.result = grade(G.puzzle, G.marks);
    G.phase = "done";
    $("board").classList.add("locked");
    $("controls").hidden = true;
    animateReveal(G.puzzle, G.result, true);
    showResult(saved.stars, "Come back tomorrow",
      `You got ${starText(saved.stars)} today · next puzzle in ${hoursLeft()}`,
      [["Home", () => history.back()], ["Share 📤", shareDaily, true]]);
  }
}
const hoursLeft = () => {
  const t = new Date(); t.setHours(24, 0, 0, 0);
  const m = Math.ceil((t - Date.now()) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};
$("dailyBtn").onclick = playDaily;
$("noLivesDaily").onclick = playDaily;

function dailyShareText() {
  const date = G.date, saved = S.daily.results[date], p = G.puzzle;
  const res = grade(p, new Map(saved.marks));
  const emoji = { ok: "🟩", wrong: "🟥", missed: "🟨" };
  const rows = [];
  for (let y = 0; y < p.size; y++) {
    let row = "";
    for (let x = 0; x < p.size; x++) row += emoji[res.cells.get(key(x, y))] || "⬛";
    rows.push(row);
  }
  const streak = store.currentDailyStreak(S, date);
  return `Color Life Daily #${store.dailyNumber(date)} ${"⭐".repeat(saved.stars) || "0/3"}\n${rows.join("\n")}\n🔥 ${plural(streak, "day")} streak\n${SITE}`;
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

// ---------- Rush ----------
function playRush() {
  stopRush();
  G = { mode: "rush", rush: { seed: Date.now().toString(36), index: 0, score: 0, endAt: Date.now() + RUSH_MS, over: false } };
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
$("noLivesRush").onclick = playRush;

function nextRush() { setupPuzzle(rushPuzzle(G.rush.seed, G.rush.index++)); }

function rushAnswered(res) {
  if (G.rush.over) return;
  if (res.stars === 3) { G.rush.score++; toast("✓ +1", 600); }
  updateBar();
  nextRush();
}

function endRush() {
  stopRush();
  const r = G.rush;
  r.over = true;
  G.phase = "done";
  $("board").classList.add("locked");
  $("controls").hidden = true;
  const best = r.score > S.rushBest;
  S.rushBest = Math.max(S.rushBest, r.score);
  S.coins += r.score;
  store.save(S);
  updateBar();
  showResult(null, best && r.score ? "New best! 🏆" : "Time's up!",
    `You solved ${plural(r.score, "puzzle")} · best ${S.rushBest} · +${r.score} 🪙`,
    [["Home", () => history.back()], ["Play again", playRush, true]]);
}

function stopRush() { clearInterval(rushTimer); rushTimer = null; }

// ---------- Out of hearts ----------
function freeHeartsLeft() {
  const d = store.today();
  if (S.free?.date !== d) S.free = { date: d, count: 0 };
  return FREE_HEARTS_PER_DAY - S.free.count;
}

function refreshNoLives() {
  store.tickLives(S);
  $("nextLife").textContent = mmss(store.nextLifeIn(S));
  const btn = $("freeLifeBtn");
  if (S.lives > 0) {
    btn.querySelector(".big-title").textContent = "▶ Keep playing";
    $("freeLifeSub").textContent = `You have ${plural(S.lives, "heart")}`;
    btn.disabled = false;
  } else {
    const left = freeHeartsLeft();
    btn.querySelector(".big-title").textContent = "❤️ Get a heart";
    $("freeLifeSub").textContent = left > 0 ? `${left} free today` : "No free hearts left today";
    btn.disabled = left <= 0;
  }
}

// Where a rewarded ad will go later. For now the heart is free (limited per day).
async function rewardedHeart() { return true; }

$("freeLifeBtn").onclick = async () => {
  if (S.lives <= 0) {
    if (freeHeartsLeft() <= 0 || !(await rewardedHeart())) return;
    S.free.count++;
    store.gainLife(S);
    store.save(S);
  }
  playLevel();
};

// ---------- Themes ----------
function renderThemes() {
  $("themeCoins").textContent = `🪙 ${S.coins}`;
  const list = $("themeList");
  list.innerHTML = "";
  for (const t of THEMES) {
    const owned = S.themes.includes(t.id), on = S.theme === t.id;
    const b = document.createElement("button");
    b.className = "theme" + (on ? " on" : "");
    const v = t.vars;
    b.innerHTML = `<span class="swatches" style="background:${v.bg}"><i style="background:${v.live}"></i><i style="background:${v.survive}"></i><i style="background:${v.die}"></i><i style="background:${v.born}"></i></span>
      <b>${t.name}</b><small>${on ? "In use" : owned ? "Use" : `🪙 ${t.price}`}</small>`;
    b.onclick = () => {
      if (!owned) {
        if (S.coins < t.price) { toast(`You need ${t.price - S.coins} more coins`); return; }
        S.coins -= t.price;
        S.themes.push(t.id);
        toast(`${t.name} unlocked!`);
      }
      S.theme = t.id;
      applyTheme(t.id);
      store.save(S);
      renderThemes();
    };
    list.appendChild(b);
  }
}
$("themesBtn").onclick = () => go("themes");

// ---------- Playground ----------
$("playgroundBtn").onclick = () => { go("playground"); openPlayground(); };

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
  if (e.key === "Enter" && current === "game" && G?.phase === "solve") check();
});

// ---------- Start ----------
setInterval(() => { if (current !== "game" || G?.mode === "level") refresh(); }, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
show("home");

// Offline support for the installable web app (not needed inside the Android app).
if ("serviceWorker" in navigator && !window.Capacitor && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
