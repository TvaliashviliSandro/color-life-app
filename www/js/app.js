// Color Life — "predict the next step" puzzle game.
import {
  DIFFICULTIES, difficulty, TUTORIAL, fromTutorial, makePuzzle, puzzleShape, dailyPuzzle, rushConfig, grade,
  endlessStart, endlessRound, ENDLESS_SIZE,
} from "./puzzles.js";
import { key } from "./life.js";
import * as store from "./store.js";
import { THEMES, applyTheme } from "./themes.js";
import { openPlayground, closePlayground } from "./playground.js";
import { createSim } from "./sim.js";
import { icon, hydrateIcons } from "./icons.js";

const $ = (id) => document.getElementById(id);
const SITE = "https://tvaliashvilisandro.github.io/color-life-app/";
const RUSH_MS = 60_000;
const FREE_HEARTS_PER_DAY = 3;

hydrateIcons();

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
const starText = (n) => `${n}/3 stars`;
const coinsHTML = (n) => `<span class="coins-val">${icon("coin", "coin")}${n}</span>`;
const heartsRow = (n, max) => icon("heart", "fill heart-on").repeat(n) + icon("heart", "heart-off").repeat(max - n);
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
const SCREENS = ["home", "game", "nolives", "themes", "playground", "difficulty"];
function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  current = id;
  refresh();
}
function go(id) {
  if (id !== current) history.pushState({ s: id }, "");
  show(id);
}
function leaveScreen() {
  stopRush();
  closePlayground();
  sim.stop();
  G = null;
  $("rules").hidden = true;
  closeLesson();
}
// Back (button or Android's back key) goes to the previous menu screen.
// A puzzle can't be resumed from history, so landing on one goes home.
history.replaceState({ s: "home" }, "");
window.addEventListener("popstate", (e) => {
  leaveScreen();
  const target = e.state?.s || "home";
  show(["home", "difficulty", "themes"].includes(target) ? target : "home");
});
document.querySelectorAll("[data-back]").forEach((b) => (b.onclick = () => history.back()));

// ---------- Status text ----------
function livesHTML() {
  store.tickLives(S);
  const next = store.nextLifeIn(S);
  return `${icon("heart", "fill heart-on")}${S.lives}` + (next ? ` <small>${mmss(next)}</small>` : "");
}

function refresh() {
  store.tickLives(S);
  if (current === "home") refreshHome();
  if (current === "nolives") refreshNoLives();
  if (current === "themes") renderThemes();
  if (current === "difficulty") renderDifficulties();
  if (current === "game" && G?.puzzle) updateBar();
}

function refreshHome() {
  $("homeLives").innerHTML = livesHTML();
  $("homeCoins").innerHTML = coinsHTML(S.coins);
  $("playSub").textContent = S.tutorialDone
    ? `Choose a difficulty · last: ${difficulty(S.lastDifficulty).name}`
    : "Starts with a quick 5-step tutorial";
  $("endlessSub").textContent = S.endlessBest ? `One pattern, step after step · best ${plural(S.endlessBest, "step")}` : "One pattern, step after step";
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
      const badge = r ? `<span class="badge ${r}">${icon(r === "ok" ? "check" : r === "wrong" ? "close" : "plus")}</span>` : "";
      html += `<div class="${cls}" data-k="${k}" style="--d:${(x + y) * 35}ms">${badge}</div>`;
    }
  el.innerHTML = html;
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
  return `<div class="lesson-grids"><div>${grid(L.before)}<small>now</small></div><span class="arrow">${icon("next")}</span><div>${grid(after)}<small>next step</small></div></div>`;
}

function showLesson(level) {
  const L = LESSONS[level - 1];
  showPopup({
    step: `Lesson ${level} of ${LESSONS.length}`, title: L.title, example: lessonExample(L),
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

// ---------- Puzzle setup ----------
const sim = createSim($("sim"), $("simCaption"));
$("simReplay").onclick = () => sim.replay();

function setupPuzzle(puzzle) {
  sim.stop();
  Object.assign(G, { puzzle, marks: new Map(), phase: "solve" });
  $("result").hidden = true;
  $("controls").hidden = false;
  $("board").hidden = false;
  $("sim").hidden = true;
  $("simBar").hidden = true;
  $("board").classList.remove("locked");
  G.start = new Set(puzzle.frames[0]);
  renderSolve();
  $("hint").innerHTML = hintFor();
  updateBar();
  if (G.mode === "tutorial") showLesson(G.step + 1);
}

function hintFor() {
  if (G.mode === "endless")
    return "Your answer becomes the next board. The edge is a wall: nothing exists outside it.";
  if (G.mode === "daily" || (G.mode === "play" && (S.diffStats[G.diff]?.solved || 0) < 3))
    return 'Mark every white cell <i class="sw survive"></i> or <i class="sw die"></i>, and the empty cells that will be born <i class="sw born"></i>.';
  return "";
}

function updateBar() {
  const p = G.puzzle;
  if (G.mode === "tutorial") {
    $("gameTitle").textContent = "Tutorial";
    $("gameSub").textContent = `Lesson ${G.step + 1} of ${TUTORIAL.length} · ${TUTORIAL[G.step].title}`;
    $("gameStatus").innerHTML = icon("book");
  } else if (G.mode === "play") {
    const d = difficulty(G.diff);
    $("gameTitle").textContent = d.name;
    $("gameSub").textContent = `${p.size}×${p.size} board · ${p.frames[0].length} blocks`;
    $("gameStatus").innerHTML = livesHTML();
  } else if (G.mode === "endless") {
    const e = G.endless;
    $("gameTitle").textContent = "Endless";
    $("gameSub").textContent = `Step ${e.steps + 1}` + (S.endlessBest ? ` · best ${S.endlessBest}` : "");
    $("gameStatus").innerHTML = heartsRow(e.lives, 3);
  } else if (G.mode === "daily") {
    $("gameTitle").textContent = `Daily #${store.dailyNumber(G.date)}`;
    $("gameSub").textContent = new Date(G.date + "T12:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    $("gameStatus").innerHTML = `${icon("flame")}${store.currentDailyStreak(S, G.date)}`;
  } else {
    $("gameTitle").textContent = "Rush";
    $("gameSub").textContent = `Solved ${G.rush.score}`;
    const now = G.rush.pausedAt || Date.now();
    $("gameStatus").innerHTML = `${icon("timer")}${Math.ceil(Math.max(0, G.rush.endAt - now) / 1000)}`;
  }
}

// ---------- Painting ----------
function renderSolve() {
  renderBoard($("board"), G.puzzle.size, G.start, { marks: G.marks });
}

$("board").addEventListener("click", (e) => {
  const c = e.target.closest(".cell");
  if (!c || !G || G.phase !== "solve") return;
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

// ---------- Checking ----------
$("checkBtn").onclick = check;

async function check() {
  if (!G || G.phase !== "solve") return;
  const p = G.puzzle, game = G;

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
  if (stars === 3) return S.perfectStreak >= 3 ? `Perfect · ${S.perfectStreak} in a row` : "Perfect!";
  return ["Not quite", "Good", "Great!"][stars];
}

const COIN_MULT = { "very-easy": 1, easy: 1, medium: 2, hard: 2, "very-hard": 3, extreme: 4 };

function finish(res) {
  if (G.mode === "rush") return rushAnswered(res);
  if (G.mode === "endless") return endlessAnswered(res);
  const { stars } = res;

  if (G.mode === "tutorial") {
    const last = G.step === TUTORIAL.length - 1;
    if (stars > 0 && last) {
      S.tutorialDone = true;
      store.save(S);
      showResult(stars, "Tutorial complete", "You know all the rules. Now pick a difficulty.",
        [["Home", () => history.back()], ["Choose difficulty", () => go("difficulty"), true, "next"]]);
    } else if (stars > 0) {
      showResult(stars, titleFor(stars), mistakesText(res), [["Skip tutorial", skipTutorial], ["Next lesson", () => playTutorial(G.step + 1), true, "next"]]);
    } else {
      showResult(stars, "Not quite", `${mistakesText(res)}. Check the marks on the board, then try again.`,
        [["Skip tutorial", skipTutorial], ["Try again", () => playTutorial(G.step), true, "replay"]]);
    }
    startSimSoon();
    return;
  }

  store.recordPerfect(S, stars === 3);

  if (G.mode === "play") {
    let text;
    if (stars > 0) {
      const coins = stars * COIN_MULT[G.diff];
      S.coins += coins;
      S.totalStars += stars;
      text = `${mistakesText(res)} · +${coinsHTML(coins)}`;
    } else {
      store.loseLife(S);
      text = `${mistakesText(res)} · −1 ${icon("heart", "fill heart-on")}`;
    }
    store.recordDifficulty(S, G.diff, stars);
    store.save(S);
    updateBar();
    const next = S.lives > 0 ? "Next puzzle" : "Out of hearts";
    showResult(stars, titleFor(stars), text, [["Difficulty", () => history.back()], [next, () => playDifficulty(G.diff), true, "next"]]);
    startSimSoon();
    return;
  }

  // daily
  const coins = stars * 3 + 2;
  S.coins += coins;
  store.recordDaily(S, G.date, { stars, mistakes: res.mistakes, marks: [...G.marks] });
  store.save(S);
  updateBar();
  const streak = store.currentDailyStreak(S, G.date);
  showResult(stars, titleFor(stars), `${mistakesText(res)} · +${coinsHTML(coins)} · ${icon("flame")} ${plural(streak, "day")}`,
    [["Home", () => history.back()], ["Share", shareDaily, true, "share"]]);
  startSimSoon();
}

// After the ✓/✕ marks have had a moment, zoom out and let the answer play on.
function startSimSoon(delay = 1100) {
  const game = G;
  setTimeout(() => {
    if (G !== game || current !== "game") return;
    $("board").hidden = true;
    $("sim").hidden = false;
    $("simBar").hidden = false;
    sim.play(new Set(G.puzzle.frames[1]), G.puzzle.size);
  }, delay);
}

function showResult(stars, title, text, buttons) {
  const r = $("result");
  $("stars").hidden = stars === null;
  [...$("stars").children].forEach((s, i) => s.classList.toggle("on", stars !== null && i < stars));
  $("resultTitle").textContent = title;
  $("resultText").innerHTML = text;
  const box = $("resultButtons");
  box.innerHTML = "";
  for (const [label, fn, primary, ic] of buttons) {
    const b = document.createElement("button");
    // Forward arrows read better after the label; other icons go before it.
    b.innerHTML = ic === "next" ? label + icon(ic) : (ic ? icon(ic) : "") + label;
    b.className = primary ? "primary" : "soft";
    b.onclick = fn;
    box.appendChild(b);
  }
  r.hidden = false;
  r.style.animation = "none"; void r.offsetWidth; r.style.animation = "";
}

// ---------- Play: tutorial, then pick a difficulty ----------
function startPlay() {
  if (!S.tutorialDone) playTutorial(0);
  else go("difficulty");
}
$("playBtn").onclick = startPlay;

function playTutorial(stepIndex) {
  G = { mode: "tutorial", step: stepIndex };
  go("game");
  setupPuzzle(fromTutorial(TUTORIAL[stepIndex]));
}
function skipTutorial() {
  S.tutorialDone = true;
  store.save(S);
  sim.stop();
  G = null;
  history.replaceState({ s: "difficulty" }, "");
  show("difficulty");
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
  $("diffLives").innerHTML = livesHTML();
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
    b.querySelector(".diff-stats").innerHTML = st?.solved ? `${icon("star", "fill")}${st.solved} solved` : "";
    b.classList.toggle("last", b.dataset.id === S.lastDifficulty);
  });
}

// Recent shapes per difficulty, so puzzles don't repeat.
const recent = {};
function playDifficulty(id) {
  store.tickLives(S);
  if (S.lives <= 0) { go("nolives"); return; }
  S.lastDifficulty = id;
  store.save(S);
  const cfg = difficulty(id);
  const list = (recent[id] ||= []);
  const p = makePuzzle(`${id}-${Date.now()}-${Math.random()}`, cfg, new Set(list));
  list.push(puzzleShape(p));
  if (list.length > 12) list.shift();
  G = { mode: "play", diff: id };
  go("game");
  setupPuzzle(p);
}

// ---------- Endless: your answer becomes the next puzzle ----------
const signature = (cells) => [...cells].sort().join(";");

function playEndless() {
  G = { mode: "endless", endless: { steps: 0, lives: 3, cells: null, seen: new Set() } };
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
  setupPuzzle(round);
}

function endlessAnswered(res) {
  const e = G.endless;
  e.cells = new Set(G.puzzle.frames[1]);        // the answer is the next board, right or wrong
  if (res.stars > 0) { e.steps++; S.coins += 1; }
  else e.lives--;
  updateBar();
  if (e.lives > 0) {
    const text = res.stars > 0 ? `${mistakesText(res)} · step ${e.steps} done` : `${mistakesText(res)} · −1 ${icon("heart", "fill heart-on")}`;
    showResult(res.stars, titleFor(res.stars), text, [["Home", () => history.back()], ["Next step", nextEndlessRound, true, "next"]]);
    store.save(S);
    return;
  }
  const best = e.steps > S.endlessBest;
  S.endlessBest = Math.max(S.endlessBest, e.steps);
  store.save(S);
  showResult(null, best && e.steps ? "New best!" : "Run over",
    `You predicted ${plural(e.steps, "step")} · best ${S.endlessBest}`,
    [["Home", () => history.back()], ["New run", playEndless, true, "replay"]]);
}

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
      [["Home", () => history.back()], ["Share", shareDaily, true, "share"]]);
    startSimSoon(600);
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
  G = { mode: "rush", rush: { seed: Date.now().toString(36), index: 0, score: 0, endAt: Date.now() + RUSH_MS, over: false, recent: [] } };
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

function nextRush() {
  const r = G.rush;
  const p = makePuzzle(`rush-${r.seed}-${r.index}`, rushConfig(r.index++), new Set(r.recent));
  r.recent.push(puzzleShape(p));
  if (r.recent.length > 10) r.recent.shift();
  setupPuzzle(p);
}

function rushAnswered(res) {
  if (G.rush.over) return;
  if (res.stars === 3) { G.rush.score++; toast("+1", 600); }
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
  showResult(null, best && r.score ? "New best!" : "Time's up",
    `You solved ${plural(r.score, "puzzle")} · best ${S.rushBest} · +${coinsHTML(r.score)}`,
    [["Home", () => history.back()], ["Play again", playRush, true, "replay"]]);
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
    btn.querySelector(".big-title").textContent = "Keep playing";
    $("freeLifeSub").textContent = `You have ${plural(S.lives, "heart")}`;
    btn.disabled = false;
  } else {
    const left = freeHeartsLeft();
    btn.querySelector(".big-title").textContent = "Get a heart";
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
  playDifficulty(S.lastDifficulty);
};

// ---------- Themes ----------
function renderThemes() {
  $("themeCoins").innerHTML = coinsHTML(S.coins);
  const list = $("themeList");
  list.innerHTML = "";
  for (const t of THEMES) {
    const owned = S.themes.includes(t.id), on = S.theme === t.id;
    const b = document.createElement("button");
    b.className = "theme" + (on ? " on" : "");
    const v = t.vars;
    b.innerHTML = `<span class="swatches" style="background:${v.bg}"><i style="background:${v.live}"></i><i style="background:${v.survive}"></i><i style="background:${v.die}"></i><i style="background:${v.born}"></i></span>
      <b>${t.name}</b><small>${on ? icon("check") + "In use" : owned ? "Use" : coinsHTML(t.price)}</small>`;
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
  if (e.key === "Enter" && current === "game" && G?.phase === "solve") check();
});

// ---------- Start ----------
setInterval(() => { if (current !== "game" || G?.mode === "play") refresh(); }, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
show("home");

// Offline support for the installable web app (not needed inside the Android app).
if ("serviceWorker" in navigator && !window.Capacitor && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
