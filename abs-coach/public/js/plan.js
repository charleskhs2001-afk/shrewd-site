// All the maths: body fat, calories, macros, meals, workouts, timeline and check-in verdicts.
// Pure functions of the saved state, so the plan is always rebuilt from the latest numbers.

import { FOODS, PROTEINS, MEALS, SNACKS, EXERCISES, PATTERNS, PATTERN_FALLBACK, SESSIONS, SPLITS, STAGES } from './data.js';

export const CHECKIN_DAYS = 5;
const KCAL_PER_KG_FAT = 7700;

// ---------- small helpers ----------
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
const roundTo = (x, step) => Math.round(x / step) * step;

export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const today = () => isoDate(new Date());
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
// Monday = 1 ... Sunday = 7
export const weekday = (s) => ((parseDate(s).getDay() + 6) % 7) + 1;

// ---------- body fat ----------
export function navyBodyFat(sex, heightCm, waistCm, neckCm, hipCm) {
  if (!heightCm || !waistCm || !neckCm) return null;
  let bf;
  if (sex === 'male') {
    if (waistCm - neckCm <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (!hipCm || waistCm + hipCm - neckCm <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
  }
  return Number.isFinite(bf) ? clamp(bf, 3, 60) : null;
}

// BMI-based estimate. Weak for muscular people, so it only gets a small say.
export function bmiBodyFat(sex, age, heightCm, weightKg) {
  const bmi = weightKg / (heightCm / 100) ** 2;
  const male = sex === 'male' ? 1 : 0;
  const bf = age < 18 ? 1.51 * bmi - 0.7 * age - 3.6 * male + 1.4 : 1.2 * bmi + 0.23 * age - 10.8 * male - 5.4;
  return clamp(bf, 4, 55);
}

export const stageMid = (sex, n) => (STAGES[n].bf[sex][0] + STAGES[n].bf[sex][1]) / 2;

export function stageFromBodyFat(sex, bf) {
  for (let i = STAGES.length - 1; i >= 0; i--) if (bf <= STAGES[i].bf[sex][1]) return i;
  return 0;
}

// The body fat where a stage reliably shows: a little under the top of its range.
export function targetBodyFat(sex, stage) {
  const [lo, hi] = STAGES[stage].bf[sex];
  return hi - 0.4 * (hi - lo);
}

// Combine every signal available for one entry into a single estimate.
export function estimateBodyFat(profile, entry, baseline) {
  const sources = [];
  const ai = entry.ai && entry.ai.photo_ok ? entry.ai : null;
  if (ai) sources.push({ label: 'photo analysis', bf: (ai.body_fat_low + ai.body_fat_high) / 2, w: 2 });
  const navy = navyBodyFat(profile.sex, profile.heightCm, entry.waistCm, entry.neckCm ?? profile.neckCm, entry.hipCm ?? profile.hipCm);
  if (navy) sources.push({ label: 'tape measurements', bf: navy, w: 2 });
  if (baseline && baseline !== entry && baseline.bf) {
    const lean = baseline.weightKg * (1 - baseline.bf / 100);
    if (entry.weightKg > lean) sources.push({ label: 'weight change since you started', bf: ((entry.weightKg - lean) / entry.weightKg) * 100, w: 2 });
  }
  if (entry.selfStage != null) sources.push({ label: 'how you rated your photos', bf: stageMid(profile.sex, entry.selfStage), w: ai ? 0.5 : 1.5 });
  if (!ai && !navy) sources.push({ label: 'height, weight and age', bf: bmiBodyFat(profile.sex, profile.age, profile.heightCm, entry.weightKg), w: 0.5 });

  const bf = clamp(sum(sources, (s) => s.bf * s.w) / sum(sources, (s) => s.w), 4, 55);
  const half = ai ? Math.max(1.5, (ai.body_fat_high - ai.body_fat_low) / 2) : navy ? 2.5 : 3.5;
  const stage = ai ? ai.ab_stage : entry.selfStage ?? stageFromBodyFat(profile.sex, bf);
  return {
    bf: Math.round(bf * 10) / 10,
    bfLow: Math.round(Math.max(3, bf - half)),
    bfHigh: Math.round(bf + half),
    stage,
    sources: sources.map((s) => s.label),
  };
}

// ---------- energy ----------
export function energy(p, weightKg) {
  const bmr = 10 * weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const neat = { sitting: 1.2, light: 1.3, active: 1.4, very: 1.55 }[p.activity] ?? 1.3;
  const training = (p.days * p.mins * 4.5) / 7; // average kcal per day from the workouts
  return { bmr, tdee: bmr * neat + training };
}

// % of body weight to lose per week: faster when there is more to lose.
function weeklyRatePct(sex, bf, teen) {
  const b = sex === 'male' ? bf : bf - 8;
  let r = b > 25 ? 1.0 : b > 20 ? 0.8 : b > 15 ? 0.7 : b > 12 ? 0.55 : 0.4;
  if (teen) r = Math.min(r, 0.4);
  return r;
}

// Weight trend in kg per week from the entries (least squares), or null if too little data.
export function observedRate(entries) {
  if (entries.length < 3) return null;
  const t0 = entries[0].date;
  const pts = entries.map((e) => [daysBetween(t0, e.date), e.weightKg]);
  const span = pts.at(-1)[0] - pts[0][0];
  if (span < 9) return null;
  const mx = sum(pts, (p) => p[0]) / pts.length;
  const my = sum(pts, (p) => p[1]) / pts.length;
  const slope = sum(pts, (p) => (p[0] - mx) * (p[1] - my)) / sum(pts, (p) => (p[0] - mx) ** 2);
  return -slope * 7; // positive = losing
}

// ---------- the plan ----------
export function buildPlan(state) {
  const p = state.profile;
  const entries = state.entries;
  const latest = entries.at(-1);
  const teen = p.age < 18;
  const W = latest.weightKg;
  const bf = latest.bf;
  const goalStage = teen ? Math.min(p.goalStage, 4) : p.goalStage;
  const tbf = targetBodyFat(p.sex, goalStage);
  const { bmr, tdee } = energy(p, W);
  const lean = W * (1 - bf / 100);
  const targetW = lean / (1 - tbf / 100);
  const fatToLose = Math.max(0, W - targetW);
  const veryLean = p.sex === 'male' ? bf < 8 : bf < 15;
  const atGoal = fatToLose < 0.5;
  const maintenance = atGoal || veryLean;

  // Calories
  const ratePct = weeklyRatePct(p.sex, bf, teen);
  let deficit = maintenance ? 0 : ((ratePct / 100) * W * KCAL_PER_KG_FAT) / 7;
  deficit = Math.min(deficit, teen ? 0.12 * tdee : 0.25 * tdee, 1000);
  const floor = teen ? (p.sex === 'male' ? 2000 : 1700) : Math.max(p.sex === 'male' ? 1500 : 1200, 0.9 * bmr);
  const adjust = state.calorieAdjust || 0;
  let kcal = tdee - deficit + adjust;
  if (maintenance) kcal = tdee + Math.max(adjust, -150);
  const floorHit = kcal < floor;
  kcal = roundTo(Math.max(kcal, floor), 10);
  const actualDeficit = Math.max(0, tdee - kcal);
  const plannedKgWeek = (actualDeficit * 7) / KCAL_PER_KG_FAT;

  // Macros
  const protein = roundTo(teen ? 1.6 * W : Math.min(1.9 * targetW, 2.2 * W), 5);
  let fat = Math.round(Math.max((0.25 * kcal) / 9, 0.6 * targetW));
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  if (carbs < 60) {
    fat = Math.round(Math.max(0.5 * targetW, (kcal - protein * 4 - 60 * 4) / 9));
    carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  }
  const water = Math.round(0.035 * W * 2) / 2;

  // Snack allowance and meal targets
  const snackKcal = clamp(roundTo(kcal * 0.12, 25), 100, 400);
  const mealKcal = kcal - snackKcal;
  const snackProtein = snackKcal >= 150 ? 15 : 8;
  const slots = p.meals === 2 ? [['lunch', 0.45], ['dinner', 0.55]] : [['breakfast', 0.28], ['lunch', 0.34], ['dinner', 0.38]];
  const proteinShares = p.meals === 2 ? [0.45, 0.55] : [0.3, 0.35, 0.35];
  const rules = dietRules(p);
  const dayIndex = Math.floor(parseDate(today()) / 86400000);
  const shown = new Set(); // so lunch and dinner don't lead with the same meal
  const meals = slots.map(([slot, share], i) => {
    const target = roundTo(mealKcal * share, 10);
    const proteinTarget = Math.round((protein - snackProtein) * proteinShares[i]);
    const built = MEALS.filter((m) => m.slots.includes(slot))
      .map((m) => buildMeal(m, target, proteinTarget, rules))
      .filter(Boolean);
    // Meals within ~12% of the target come first (rotated so they change day to day),
    // then the rest, closest first.
    const fits = built.filter((o) => Math.abs(o.kcal - target) <= target * 0.12);
    const rest = built.filter((o) => !fits.includes(o)).sort((a, b) => Math.abs(a.kcal - target) - Math.abs(b.kcal - target));
    const k = fits.length ? dayIndex % fits.length : 0;
    const ordered = fits.slice(k).concat(fits.slice(0, k), rest);
    const options = ordered.filter((o) => !shown.has(o.id)).concat(ordered.filter((o) => shown.has(o.id)));
    options.slice(0, 3).forEach((o) => shown.add(o.id));
    return { slot, target, protein: proteinTarget, options };
  });
  const snacks = SNACKS.filter((s) => s.contains.every((t) => !rules.has(t)));

  // Timeline
  const observed = observedRate(entries);
  let kgWeek = plannedKgWeek;
  let rateBasis = 'plan';
  if (observed != null && plannedKgWeek > 0) {
    kgWeek = clamp(0.5 * plannedKgWeek + 0.5 * observed, 0.3 * plannedKgWeek, 1.5 * plannedKgWeek);
    rateBasis = 'blend';
  }
  const slow = !maintenance && kgWeek < 0.1;
  if (slow) kgWeek = 0.1; // slow recomposition at (near) maintenance
  const weeksFor = (kg) => (kg <= 0 ? 0 : (kg / kgWeek) * 1.1);
  const weeks = maintenance ? 0 : weeksFor(fatToLose);
  const start = latest.date;
  const currentStage = stageFromBodyFat(p.sex, bf);
  const milestones = [];
  for (let s = currentStage + 1; s <= goalStage; s++) {
    const b = s === goalStage ? tbf : STAGES[s].bf[p.sex][1] - 0.5;
    const kg = Math.max(0, W - lean / (1 - b / 100));
    const w = weeksFor(kg);
    milestones.push({ stage: s, bf: b, weeks: w, date: addDays(start, Math.round(w * 7)) });
  }
  const timeline = {
    weeks,
    weeksLow: Math.max(1, Math.round(weeks * 0.85)),
    weeksHigh: Math.max(2, Math.round(weeks * 1.3)),
    dateLow: addDays(start, Math.round(weeks * 0.85 * 7)),
    dateHigh: addDays(start, Math.round(weeks * 1.3 * 7)),
    kgWeek,
    rateBasis,
    observed,
    fatToLose,
    targetW,
    targetBf: tbf,
    goalStage,
    milestones,
    checkins: Math.ceil((weeks * 7) / CHECKIN_DAYS),
    dietBreaks: weeks > 12,
    slow,
  };

  return {
    teen, atGoal, veryLean, maintenance, floorHit,
    weight: W, bf, bfLow: latest.bfLow, bfHigh: latest.bfHigh, stage: latest.stage, currentStage,
    bmr: Math.round(bmr), tdee: roundTo(tdee, 10), kcal, deficit: Math.round(actualDeficit), adjust,
    protein, fat, carbs, fibre: 30, water,
    snackKcal, meals, snacks,
    steps: stepsTarget(p.activity),
    workouts: buildWorkouts(p),
    timeline,
    plannedKgWeek,
    nextCheckin: addDays(latest.date, CHECKIN_DAYS),
  };
}

function stepsTarget(activity) {
  return { sitting: 7000, light: 8000, active: 10000, very: 10000 }[activity] ?? 8000;
}

// ---------- meals ----------
const DIETS = {
  anything: [],
  nopork: ['pork'],
  pescatarian: ['meat', 'pork'],
  vegetarian: ['meat', 'pork', 'fish'],
  vegan: ['meat', 'pork', 'fish', 'dairy', 'egg', 'honey'],
};
export function dietRules(p) {
  const ex = new Set(DIETS[p.diet] || []);
  for (const a of p.avoid || []) ex.add(a);
  return ex;
}
const foodOk = (id, ex) => FOODS[id].contains.every((t) => !ex.has(t));
function resolveFood(id, ex) {
  if (foodOk(id, ex)) return id;
  for (const s of FOODS[id].swaps || []) if (foodOk(s, ex)) return s;
  return null;
}
function chooseProtein(opts, ex) {
  // Prefer an option that fits as written; only then try swapping ingredients.
  for (const o of opts) if (PROTEINS[o].foods.every(([f]) => foodOk(f, ex))) return { ...PROTEINS[o], foods: PROTEINS[o].foods };
  for (const o of opts) {
    const foods = PROTEINS[o].foods.map(([f, s]) => [resolveFood(f, ex), s]);
    if (foods.every(([f]) => f)) return { ...PROTEINS[o], foods };
  }
  return null;
}

function roundItem(item) {
  const f = FOODS[item.id];
  if (f.unit) {
    const step = f.unit.half ? 0.5 : 1;
    const n = Math.max(step, roundTo(item.g / f.unit.g, step));
    return { ...item, n, g: n * f.unit.g };
  }
  const g = item.g < 100 ? Math.max(5, roundTo(item.g, 5)) : roundTo(item.g, 10);
  return { ...item, g };
}

const fmtCount = (n) => (n % 1 ? `${Math.floor(n) || ''}½` : String(n));

function describeItem(i) {
  const f = FOODS[i.id];
  if (f.unit) return `${fmtCount(i.n)} ${i.n <= 1 ? f.unit.one : f.unit.many}`;
  if (i.id === 'olive_oil') return `${i.g} ml olive oil (about ${i.g >= 15 ? `${fmtCount(roundTo(i.g / 15, 0.5))} tbsp` : `${fmtCount(Math.max(1, roundTo(i.g / 5, 0.5)))} tsp`})`;
  return `${i.g}${f.ml ? ' ml' : ' g'} ${f.name}`;
}

function buildMeal(t, kcalTarget, proteinTarget, ex) {
  const prot = chooseProtein(t.protein, ex);
  if (!prot) return null;
  const items = [];
  for (const [id, g, flag] of t.items) {
    const r = resolveFood(id, ex);
    if (!r) {
      if (flag === 'opt') continue;
      return null;
    }
    items.push({ id: r, g });
  }
  const kc = (i) => (FOODS[i.id].kcal * i.g) / 100;
  const pr = (i) => (FOODS[i.id].p * i.g) / 100;
  const needP = Math.max(proteinTarget - sum(items, pr), proteinTarget * 0.55);
  const protItems = prot.foods.map(([id, share]) => {
    const f = FOODS[id];
    const cap = f.unit ? f.unit.g * 4 : 320;
    return { id, g: Math.min((needP * share) / (f.p / 100), cap) };
  });
  const free = items.filter((i) => FOODS[i.id].free);
  const scalable = items.filter((i) => !FOODS[i.id].free);
  const fixedK = sum(protItems, kc) + sum(free, kc);
  const scalK = sum(scalable, kc);
  const factor = scalK > 0 ? clamp((kcalTarget - fixedK) / scalK, 0.25, 2.2) : 1;
  scalable.forEach((i) => (i.g *= factor));
  const all = [...protItems, ...scalable, ...free].map(roundItem);
  const macro = (k) => sum(all, (i) => (FOODS[i.id][k] * i.g) / 100);
  return {
    id: t.id,
    name: t.name.replace('{P}', prot.label).replace('{p}', prot.noun),
    kcal: roundTo(macro('kcal'), 5),
    p: Math.round(macro('p')),
    c: Math.round(macro('c')),
    f: Math.round(macro('f')),
    items: all.map(describeItem),
    how: t.how.replaceAll('{p}', prot.noun),
  };
}

// ---------- workouts ----------
const GYM_KIT = ['gym', 'dumbbells', 'kettlebell', 'bands', 'pullup_bar', 'bench', 'ab_wheel', 'skipping_rope', 'chair'];
const LENGTHS = {
  20: { main: 3, sets: 2, core: 2, coreSets: 2, cardioMin: 10, cardioCore: 3, finisher: 0, circuit: true },
  30: { main: 4, sets: 3, core: 2, coreSets: 2, cardioMin: 12, cardioCore: 4, finisher: 0 },
  45: { main: 5, sets: 3, core: 3, coreSets: 3, cardioMin: 15, cardioCore: 5, finisher: 0 },
  60: { main: 6, sets: 3, core: 3, coreSets: 3, cardioMin: 20, cardioCore: 5, finisher: 8 },
};

export function buildWorkouts(p) {
  const kit = new Set(p.gym ? GYM_KIT : p.equipment || []);
  const has = (id) => EXERCISES[id].needs.every((n) => kit.has(n));
  const split = SPLITS[p.days] || SPLITS[3];
  const L = LENGTHS[p.mins] || LENGTHS[45];

  const sessions = split.sessions.map((sid, idx) => {
    const s = SESSIONS[sid];
    const used = new Set();
    const pick = (pattern) => {
      let pat = pattern;
      for (let guard = 0; pat && guard < 3; guard++) {
        const id = PATTERNS[pat].find((e) => has(e) && !used.has(e));
        if (id) {
          used.add(id);
          return id;
        }
        pat = PATTERN_FALLBACK[pat];
      }
      return null;
    };
    const item = (id, sets, reps) => ({ id, ...EXERCISES[id], sets, reps: reps || EXERCISES[id].reps });
    const main = [];
    const core = [];
    if (s.cardio) {
      const c = pick('conditioning');
      if (c) main.push(item(c, 1, `${L.cardioMin} min: ${EXERCISES[c].reps}`));
      for (const pat of s.core) {
        if (core.length >= L.cardioCore) break;
        const id = pick(pat);
        if (id) core.push(item(id, L.coreSets));
      }
    } else {
      for (const pat of s.main) {
        if (main.length >= L.main) break;
        const id = pick(pat);
        if (id) main.push(item(id, main.length === 0 && p.mins >= 60 ? 4 : L.sets));
      }
      for (const pat of s.core) {
        if (core.length >= L.core) break;
        const id = pick(pat);
        if (id) core.push(item(id, L.coreSets));
      }
    }
    let finisher = null;
    if (L.finisher && !s.cardio) {
      const c = pick('conditioning');
      if (c) finisher = item(c, 1, `${L.finisher} min: ${EXERCISES[c].reps}`);
    }
    return { id: `${sid}-${idx}`, name: s.name, day: split.days[idx], main, core, finisher, circuit: !!L.circuit, cardio: !!s.cardio };
  });

  const trainingDays = new Set(split.days);
  const restDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => !trainingDays.has(d));
  return { sessions, restDays, kit: [...kit] };
}

export function sessionForDay(workouts, isoDay) {
  const wd = weekday(isoDay);
  return workouts.sessions.find((s) => s.day === wd) || null;
}

// ---------- check-in verdict ----------
// prevPlan: the plan that was in force since the last check-in.
export function evaluateCheckin(state, entry) {
  const prevPlan = buildPlan(state);
  const prev = state.entries.at(-1);
  const isFirst = state.entries.length === 1;
  const days = Math.max(1, daysBetween(prev.date, entry.date));
  const expected = (prevPlan.plannedKgWeek * days) / 7;
  const lost = prev.weightKg - entry.weightKg;
  const waistLost = prev.waistCm && entry.waistCm ? prev.waistCm - entry.waistCm : null;
  const photo = entry.ai && entry.ai.photo_ok ? entry.ai.comparison : null;
  const adherence = entry.adherence || 'mostly';
  const lastVerdict = [...state.entries].reverse().find((e) => e.verdict)?.verdict;

  // Ten-day window smooths out water-weight swings.
  const older = state.entries.length >= 2 ? state.entries.at(-2) : null;
  const days10 = older ? daysBetween(older.date, entry.date) : null;
  const lost10 = older ? older.weightKg - entry.weightKg : null;
  const expected10 = older ? (prevPlan.plannedKgWeek * days10) / 7 : null;

  const weightGood = expected > 0 ? lost >= 0.4 * expected : Math.abs(lost) < 0.8;
  const waistGood = waistLost != null && waistLost >= 0.5;
  const photoGood = photo === 'leaner';
  const fast = !isFirst && expected > 0 && lost > Math.max(1.6 * expected, (0.012 * prev.weightKg * days) / 7);
  const slow10 = older ? lost10 < 0.4 * expected10 : true;

  let status, headline, delta = 0;
  if (prevPlan.maintenance) {
    if (lost > 0.8) { status = 'fast'; delta = 100; headline = 'You\u2019re losing weight at maintenance, so we\u2019ve added a little food.'; }
    else { status = 'on_track'; headline = 'Holding steady. Keep training hard to build thicker abs.'; }
  } else if (fast) {
    status = 'fast'; delta = 100;
    headline = 'We\u2019ve added 100 kcal a day so you keep your muscle while the fat comes off.';
  } else if (weightGood || waistGood || photoGood) {
    status = 'on_track';
    headline = 'Keep doing exactly what you\u2019re doing.';
  } else if (isFirst) {
    status = 'early';
    headline = 'Five days is short and water weight can hide fat loss. Keep going.';
  } else if (adherence === 'struggled') {
    status = 'adherence';
    headline = 'The plan hasn\u2019t had a fair test yet. Focus on hitting your numbers for the next 5 days.';
  } else if (slow10) {
    status = 'slow';
    delta = lastVerdict && lastVerdict.status === 'slow' ? -150 : -100;
    headline = `Over the last ${days10} days things have stalled, so we\u2019ve trimmed ${-delta} kcal a day. Add 1,500 steps too.`;
  } else {
    status = 'on_track';
    headline = 'A quiet few days, but the 10-day trend is on track. Stay the course.';
  }

  // Keep total adjustments within sensible bounds.
  const current = state.calorieAdjust || 0;
  const next = clamp(current + delta, -400, 300);
  delta = next - current;

  const lines = [];
  const kg = (x) => `${Math.abs(x).toFixed(1)} kg`;
  lines.push(lost >= 0.05 ? `Weight: down ${kg(lost)} in ${days} days${expected > 0 ? ` (plan expected about ${kg(expected)})` : ''}.` : lost <= -0.05 ? `Weight: up ${kg(lost)} in ${days} days. Normal day-to-day swings are up to 1 kg.` : `Weight: no change in ${days} days.`);
  if (waistLost != null) lines.push(waistLost >= 0.2 ? `Waist: ${waistLost.toFixed(1)} cm smaller.` : waistLost <= -0.2 ? `Waist: ${(-waistLost).toFixed(1)} cm bigger.` : 'Waist: no change.');
  if (photo) {
    const words = { leaner: 'look leaner than last time', same: 'look about the same as last time', softer: 'look a little softer than last time', unclear: 'are hard to compare with last time (lighting or angle differ)' };
    lines.push(`Photos: ${words[photo] || 'were compared with last time'}.`);
  }
  if (adherence === 'struggled') lines.push('You said the diet was a struggle. Pick one thing to fix, like planning tomorrow’s food tonight.');
  if (status === 'slow') lines.push('If you are already walking a lot, keep the steps and just take the calorie change.');
  if (status === 'early') lines.push('The first check-in is about building the habit. The real trend shows from check-in two.');

  return { status, headline, lines, calorieDelta: delta, days, lost, waistLost };
}

export function checkinStatus(state) {
  const last = state.entries.at(-1);
  const due = addDays(last.date, CHECKIN_DAYS);
  const t = today();
  const until = daysBetween(t, due);
  return { due, daysUntil: until, isDue: until <= 0, overdue: Math.max(0, -until), lastDate: last.date };
}
