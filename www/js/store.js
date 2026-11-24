// Player progress, saved on the device.
// Bumping the key resets every player's progress on their next launch.
const KEY = "colorlife.game.v2";
const OLD_KEYS = ["colorlife.game.v1"];
export const MAX_LIVES = 5;
export const LIFE_REGEN_MS = 15 * 60 * 1000;
const LAUNCH = "2026-11-22";      // Daily #1

const defaults = () => ({
  tutorialDone: false,
  lastDifficulty: "very-easy",
  diffStats: {},             // difficulty id -> { solved, perfect, stars }
  endlessBest: 0,
  playtestGrant: false,      // one-time pile of coins for the playtest build
  adCoins: { date: null, count: 0 },
  dailyBonus: null,          // date the shop's daily bonus was last claimed
  abilityUses: {},           // ability id -> times used (playtest feedback)
  coins: 0, totalStars: 0,
  lives: MAX_LIVES, livesAt: Date.now(),
  perfectStreak: 0, bestPerfect: 0,
  daily: { last: null, streak: 0, best: 0, results: {} },
  rushBest: 0,
  themes: [], theme: "system",
  seenRules: false,
  seenPlayground: false,
  seenZoomTip: false,
});

export function load() {
  try { for (const k of OLD_KEYS) localStorage.removeItem(k); } catch (_) {}
  let s = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Saves from the old level system: anyone past level 5 has done the tutorial.
      if (saved.level > 5) saved.tutorialDone = true;
      delete saved.level; delete saved.attempt;
      // Old themes: Classic is now Dark, Paper is replaced by the new Light.
      if (saved.theme === "classic") saved.theme = "dark";
      if (saved.theme === "paper" || saved.theme === "neon") saved.theme = "light";
      s = { ...s, ...saved, daily: { ...s.daily, ...saved.daily } };
    }
  } catch (_) {}
  // Playtest build: everyone gets plenty of coins to try abilities, continues and themes.
  if (!s.playtestGrant) { s.coins += 5000; s.playtestGrant = true; }
  return s;
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
}

// ---------- Hearts ----------
export function tickLives(s, now = Date.now()) {
  if (s.lives >= MAX_LIVES) { s.lives = MAX_LIVES; s.livesAt = now; return; }
  const gained = Math.floor((now - s.livesAt) / LIFE_REGEN_MS);
  if (gained > 0) {
    s.lives = Math.min(MAX_LIVES, s.lives + gained);
    s.livesAt = s.lives >= MAX_LIVES ? now : s.livesAt + gained * LIFE_REGEN_MS;
  }
}
export function nextLifeIn(s, now = Date.now()) {
  return s.lives >= MAX_LIVES ? 0 : Math.max(0, s.livesAt + LIFE_REGEN_MS - now);
}
export function loseLife(s, now = Date.now()) {
  tickLives(s, now);
  if (s.lives >= MAX_LIVES) s.livesAt = now;
  s.lives = Math.max(0, s.lives - 1);
}
export function gainLife(s, now = Date.now()) {
  tickLives(s, now);
  s.lives = Math.min(MAX_LIVES, s.lives + 1);
  if (s.lives >= MAX_LIVES) s.livesAt = now;
}

// ---------- Per-difficulty stats ----------
export function recordDifficulty(s, id, stars) {
  const d = (s.diffStats[id] ||= { solved: 0, perfect: 0, stars: 0 });
  if (stars > 0) d.solved++;
  if (stars === 3) d.perfect++;
  d.stars += stars;
}

// ---------- Streaks ----------
export function recordPerfect(s, perfect) {
  s.perfectStreak = perfect ? s.perfectStreak + 1 : 0;
  s.bestPerfect = Math.max(s.bestPerfect, s.perfectStreak);
}

export function recordDaily(s, date, result) {
  if (s.daily.results[date]) return;
  s.daily.results[date] = result;
  s.daily.streak = s.daily.last === shiftDate(date, -1) ? s.daily.streak + 1 : 1;
  s.daily.last = date;
  s.daily.best = Math.max(s.daily.best, s.daily.streak);
}

// Streak shown on the home screen: 0 if yesterday's daily was missed.
export function currentDailyStreak(s, today) {
  return s.daily.last === today || s.daily.last === shiftDate(today, -1) ? s.daily.streak : 0;
}

// ---------- Dates (local time, YYYY-MM-DD) ----------
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function shiftDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return today(new Date(y, m - 1, d + days));
}
export function dailyNumber(date) {
  const [y, m, d] = date.split("-").map(Number);
  const [y0, m0, d0] = LAUNCH.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y0, m0 - 1, d0)) / 864e5) + 1;
}
