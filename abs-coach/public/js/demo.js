// A sample account so people can look around before taking their own photos.
// Photos are drawings, clearly labelled as a demo.

import { torso } from './art.js';
import { putPhoto } from './store.js';
import { buildPlan, estimateBodyFat, evaluateCheckin, today, addDays, sessionForDay, isWeighted } from './plan.js';

function photoSvg(stage, label) {
  const inner = torso(stage, 120).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" width="600" height="800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcd6cc"/><stop offset="1" stop-color="#b8afa2"/></linearGradient>
    <radialGradient id="light" cx="0.5" cy="0.15" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <style>.t-body{fill:#e2c6a8;stroke:#b08b69;stroke-width:1.5}.t-abs rect{fill:#b78a64}.t-line{stroke:#a47753;stroke-width:2.4;fill:none;stroke-linecap:round}.t-navel{fill:#8a6649}.t-chest{fill:none;stroke:#b08b69;stroke-width:1.4;stroke-linecap:round;opacity:.7}</style>
  <rect width="120" height="160" fill="url(#bg)"/>
  <g transform="translate(0 6)">${inner}</g>
  <rect width="120" height="160" fill="url(#light)"/>
  <text x="6" y="154" font-family="system-ui, sans-serif" font-size="6.5" font-weight="700" fill="#4a4b44" letter-spacing=".4">DEMO · ${label}</text>
</svg>`;
}

const svgBlob = (svg) => new Blob([svg], { type: 'image/svg+xml' });

// A small deterministic wobble so the sample days look lived-in.
const wobble = (i) => ((i * 7919) % 13) / 13;

export async function makeDemo() {
  const t = today();
  const profile = {
    units: 'metric', sex: 'male', age: 29, heightCm: 180, weightKg: 84, activity: 'light',
    waistCm: 91, neckCm: 38.5, hipCm: null,
    gym: false, equipment: ['dumbbells', 'chair', 'pullup_bar'], days: 4, mins: 45,
    diet: 'anything', avoid: [], meals: 3, goalStage: 4, selfStage: 1,
  };
  const rows = [
    { off: -17, w: 84.0, waist: 91.0, self: 1, adh: null, rel: 0, ten: 1, def: 18 },
    { off: -12, w: 83.4, waist: 90.3, self: 1, adh: 'mostly', rel: 1, ten: 2, def: 21 },
    { off: -7, w: 82.9, waist: 89.6, self: 2, adh: 'nailed', rel: 1, ten: 2, def: 24 },
    { off: -2, w: 82.4, waist: 88.9, self: 2, adh: 'mostly', rel: 1, ten: 3, def: 27 },
  ];
  const S = { version: 1, demo: true, createdAt: Date.now(), profile, entries: [], calorieAdjust: 0, lockSkip: null, log: {}, workoutHistory: [], lifts: {}, seenIntro: false };

  for (const [n, r] of rows.entries()) {
    const id = `demo${n}`;
    const photos = { relaxed: `${id}-relaxed`, tensed: `${id}-tensed` };
    await putPhoto(photos.relaxed, svgBlob(photoSvg(r.rel, 'RELAXED')));
    await putPhoto(photos.tensed, svgBlob(photoSvg(r.ten, 'TENSED')));
    const entry = {
      id, kind: n ? 'checkin' : 'baseline', date: addDays(t, r.off), ts: Date.now() + r.off * 86400000,
      weightKg: r.w, waistCm: r.waist, neckCm: n ? null : profile.neckCm, hipCm: null,
      selfStage: r.self, adherence: r.adh || undefined, photos, ai: null, aiError: null,
      def: { relaxed: r.def - 6, tensed: r.def },
    };
    Object.assign(entry, estimateBodyFat(profile, entry, S.entries[0] || null));
    if (n) {
      entry.verdict = evaluateCheckin(S, entry);
      S.calorieAdjust += entry.verdict.calorieDelta;
    }
    S.entries.push(entry);
  }

  // Sixteen days of ticks, workouts and snacks.
  const plan = buildPlan(S);
  const base = {};
  for (let off = -17; off <= 0; off++) {
    const date = addDays(t, off);
    const i = off + 17;
    const session = sessionForDay(plan.workouts, date);
    const recent = off >= -4;
    const day = { ticks: {}, water: 0, snacks: [], meals: {} };
    if (off === 0) {
      day.water = 3;
      day.snacks.push({ name: 'Protein shake (30 g whey, water)', kcal: 115 });
      S.log[date] = day;
      continue;
    }
    const keen = recent || wobble(i) > 0.25;
    if (session && keen) day.ticks.workout = true;
    if (!session && (recent || wobble(i + 3) > 0.35)) day.ticks.steps = true;
    if (keen && wobble(i + 1) > 0.2) day.ticks.protein = true;
    day.water = recent ? 8 : 4 + Math.round(wobble(i + 2) * 4);
    day.snacks.push({ name: 'Skyr or high-protein yogurt pot', kcal: 95 });
    if (wobble(i + 5) > 0.5) day.snacks.push({ name: '2 squares of dark chocolate', kcal: 110 });
    if (!recent && wobble(i + 4) > 0.8) day.snacks.push({ name: 'Something else', kcal: 260 });
    S.log[date] = day;

    if (day.ticks.workout) {
      const weights = {};
      for (const x of [...session.main, ...session.core]) {
        if (!isWeighted(x)) continue;
        base[x.id] = base[x.id] || 8 + (x.id.length % 5) * 2;
        weights[x.id] = base[x.id] + (off > -9 ? 2 : 0);
      }
      const of = session.main.reduce((a, x) => a + x.sets, 0) + session.core.reduce((a, x) => a + x.sets, 0) + (session.finisher ? 1 : 0);
      S.workoutHistory.push({ date, sessionId: session.id, name: session.name, mins: 40 + Math.round(wobble(i) * 9), sets: of - (wobble(i + 6) > 0.6 ? 2 : 0), of, weights, unit: 'kg' });
      for (const [id, v] of Object.entries(weights)) S.lifts[id] = { v, unit: 'kg', date };
    }
  }
  return S;
}
