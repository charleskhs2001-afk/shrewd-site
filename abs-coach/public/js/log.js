// The daily log: what was ticked off each day, water, snacks and meal swaps.
// S.log = { 'YYYY-MM-DD': { ticks: { workout, protein, steps }, water: 0-8, snacks: [{name, kcal}], meals: { slot: mealId } } }

import { today, addDays, daysBetween, sessionForDay, weekday } from './plan.js';

export const WATER_GLASSES = 8;
const KEEP_DAYS = 400;

// Bring older saves up to date. Safe to run on every load.
export function migrate(S) {
  if (!S) return S;
  S.log = S.log || {};
  if (S.snackLog && S.snackLog.date) {
    const d = (S.log[S.snackLog.date] = S.log[S.snackLog.date] || blank());
    if (!d.snacks.length) d.snacks = S.snackLog.items || [];
  }
  delete S.snackLog;
  S.workoutHistory = S.workoutHistory || [];
  S.lifts = S.lifts || {};
  return S;
}

const blank = () => ({ ticks: {}, water: 0, snacks: [], meals: {} });

export function dayLog(S, date = today()) {
  if (!S.log[date]) S.log[date] = blank();
  const d = S.log[date];
  d.ticks = d.ticks || {};
  d.snacks = d.snacks || [];
  d.meals = d.meals || {};
  d.water = d.water || 0;
  return d;
}

export function prune(S) {
  const cutoff = addDays(today(), -KEEP_DAYS);
  for (const k of Object.keys(S.log || {})) if (k < cutoff) delete S.log[k];
  if (S.workoutHistory?.length > 300) S.workoutHistory = S.workoutHistory.slice(-300);
}

// The four jobs for a day, and which are done.
export function jobsFor(S, plan, date = today()) {
  const d = S.log[date] || blank();
  const session = sessionForDay(plan.workouts, date);
  const used = (d.snacks || []).reduce((a, s) => a + s.kcal, 0);
  const moved = !!(d.ticks?.workout || d.ticks?.steps);
  return {
    session,
    snackUsed: used,
    snackLeft: plan.snackKcal - used,
    items: [
      { key: session ? 'workout' : 'steps', done: session ? !!d.ticks?.workout : moved },
      { key: 'protein', done: !!d.ticks?.protein },
      { key: 'water', done: (d.water || 0) >= WATER_GLASSES },
      { key: 'snacks', done: used <= plan.snackKcal },
    ],
  };
}

export function dayScore(S, plan, date) {
  if (!S.log[date]) return null; // app not opened that day
  return jobsFor(S, plan, date).items.filter((i) => i.done).length;
}

export const GOOD_DAY = 3; // 3 of the 4 jobs

// Consecutive good days. Today counts once it's good; until then the streak runs to yesterday.
export function streaks(S, plan) {
  const start = S.entries[0].date;
  const t = today();
  const span = Math.max(0, daysBetween(start, t));
  let current = 0;
  let best = 0;
  let run = 0;
  for (let i = 0; i <= span; i++) {
    const date = addDays(start, i);
    const good = (dayScore(S, plan, date) ?? 0) >= GOOD_DAY;
    run = good ? run + 1 : 0;
    best = Math.max(best, run);
  }
  for (let i = 0; i <= span; i++) {
    const date = addDays(t, -i);
    const good = (dayScore(S, plan, date) ?? 0) >= GOOD_DAY;
    if (good) current += 1;
    else if (i > 0) break;
  }
  return { current, best };
}

// Workouts done in the Monday-to-Sunday week containing date.
export function workoutsThisWeek(S, plan, date = today()) {
  const monday = addDays(date, 1 - weekday(date));
  let done = 0;
  for (let i = 0; i < 7; i++) if (S.log[addDays(monday, i)]?.ticks?.workout) done += 1;
  return { done, planned: plan.workouts.sessions.length, monday };
}
