import { test } from "node:test";
import assert from "node:assert/strict";
import { tickLives, loseLife, nextLifeIn, MAX_LIVES, LIFE_REGEN_MS, recordDaily, currentDailyStreak, shiftDate, dailyNumber } from "../www/js/store.js";

const fresh = (now) => ({ lives: MAX_LIVES, livesAt: now, perfectStreak: 0, bestPerfect: 0, daily: { last: null, streak: 0, best: 0, results: {} } });

test("hearts refill one every 15 minutes, up to the max", () => {
  const t0 = 1_000_000;
  const s = fresh(t0);
  loseLife(s, t0); loseLife(s, t0); loseLife(s, t0);
  assert.equal(s.lives, 2);
  assert.equal(nextLifeIn(s, t0 + 1000), LIFE_REGEN_MS - 1000);
  tickLives(s, t0 + LIFE_REGEN_MS * 2 + 5);
  assert.equal(s.lives, 4);
  assert.equal(nextLifeIn(s, t0 + LIFE_REGEN_MS * 2 + 5), LIFE_REGEN_MS - 5);
  tickLives(s, t0 + LIFE_REGEN_MS * 10);
  assert.equal(s.lives, MAX_LIVES);
});

test("daily streak counts consecutive days and resets after a gap", () => {
  const s = fresh(0);
  recordDaily(s, "2026-11-30", { stars: 3 });
  recordDaily(s, "2026-12-01", { stars: 1 });   // across a month boundary
  recordDaily(s, "2026-12-01", { stars: 3 });   // replay ignored
  assert.equal(s.daily.streak, 2);
  assert.equal(currentDailyStreak(s, "2026-12-02"), 2);
  assert.equal(currentDailyStreak(s, "2026-12-03"), 0);
  recordDaily(s, "2026-12-04", { stars: 2 });
  assert.equal(s.daily.streak, 1);
  assert.equal(s.daily.best, 2);
});

test("dates", () => {
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(dailyNumber("2026-11-22"), 1);
  assert.equal(dailyNumber("2027-11-22"), 366);
});
