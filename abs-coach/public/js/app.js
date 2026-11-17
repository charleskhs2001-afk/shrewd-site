// Core Check: screens, routing and actions.
import { STAGES, EQUIPMENT } from './data.js';
import { buildPlan, estimateBodyFat, evaluateCheckin, checkinStatus, today, addDays, daysBetween, sessionForDay, CHECKIN_DAYS, weekday, menuFor, nextOption, shoppingList } from './plan.js';
import { loadState, saveState, putPhoto, photoUrl, getPhoto, clearAll, requestPersistence, exportBackup, importBackup, photosPersistent } from './store.js';
import { normalisePhoto, toUploadBase64, definitionScore } from './photos.js';
import { openCamera, cameraSupported } from './camera.js';
import { logo, torso } from './art.js';
import { lineChart } from './charts.js';
import { migrate, dayLog, prune, jobsFor, dayScore, streaks, workoutsThisWeek, WATER_GLASSES, GOOD_DAY } from './log.js';
import { initWorkout, workoutPage, workoutActions, workoutUi, startWorkout, activeWorkout, findSession, onWeightInput } from './workout.js';
import { makeDemo } from './demo.js';
import { html, raw, str, num, fmt, fmtWeight, fmtWeightDelta, fmtLen, fmtHeight, weightParts, heightParts, KG_PER_LB, fmtDate, fmtMonth, plural, uid, toast, download, reminderCalendar } from './ui.js';

const APP = 'Core Check';
const app = document.getElementById('app');
let S = migrate(loadState());
let AI = false; // true when the server can analyse photos
let draft = null;
let lastRoute = null;
const sum = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
const save = () => {
  if (S) prune(S);
  return saveState(S);
};

const DEFAULT_PROFILE = {
  units: 'metric', sex: 'male', age: null, heightCm: null, weightKg: null, activity: 'light',
  waistCm: null, neckCm: null, hipCm: null,
  gym: true, equipment: ['chair'], days: 4, mins: 45,
  diet: 'anything', avoid: [], meals: 3, goalStage: 4, selfStage: null,
};
const STEPS = [
  { id: 'you', title: 'About you', sub: 'Used to work out how much you should eat.' },
  { id: 'training', title: 'Training', sub: 'Your workouts are built around what you have.' },
  { id: 'food', title: 'Food', sub: 'Your meals are picked and portioned from this.' },
  { id: 'goal', title: 'Your goal', sub: 'This sets your target and how long it will take.' },
  { id: 'photos', title: 'Photos', sub: 'Your starting point, so you can see the change.' },
];
const ACTIVITY = [
  { v: 'sitting', t: 'Mostly sitting', d: 'Desk job or studying, under 5,000 steps a day' },
  { v: 'light', t: 'Lightly active', d: 'Some walking, 5,000–8,000 steps' },
  { v: 'active', t: 'Active', d: 'On your feet a lot, 8,000–12,000 steps' },
  { v: 'very', t: 'Very active', d: 'Physical job or 12,000+ steps' },
];
const DIETS = [
  { v: 'anything', t: 'Anything' },
  { v: 'nopork', t: 'No pork' },
  { v: 'pescatarian', t: 'Pescatarian' },
  { v: 'vegetarian', t: 'Vegetarian' },
  { v: 'vegan', t: 'Vegan' },
];
const AVOID = [
  { v: 'dairy', t: 'Dairy-free' },
  { v: 'gluten', t: 'Gluten-free' },
  { v: 'nuts', t: 'Nut-free' },
];
const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const POSES = { relaxed: 'Relaxed', tensed: 'Tensed' };
const POSE_HINT = {
  relaxed: 'Stand normally and breathe out. Don’t suck in.',
  tensed: 'Breathe out and brace hard, like you’re about to be punched.',
};

// ---------- routing ----------
function route() {
  const [page, sub] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: page || 'home', sub };
}
function go(path) {
  const target = `#/${path}`;
  if (location.hash === target) render(true);
  else location.hash = target;
}
window.addEventListener('hashchange', () => render());

function render(forceTop = false) {
  const { page, sub } = route();
  let view;
  if (!S && !['start', 'privacy'].includes(page)) view = landing();
  else if (page === 'start') view = onboarding();
  else if (page === 'plan') view = planPage(sub);
  else if (page === 'workout') view = workoutPage(S, buildPlan(S)) || home();
  else if (page === 'checkin') view = checkinPage();
  else if (page === 'progress') view = progressPage();
  else if (page === 'settings') view = settingsPage();
  else if (page === 'edit') view = editPage(sub);
  else if (page === 'privacy') view = privacyPage();
  else view = home();
  const banner = S?.demo && !['start', 'workout'].includes(page) ? html`<div class="demo-bar" role="note"><span><strong>Demo</strong> · sample data to show how it works</span><button class="btn btn-primary btn-sm" data-act="end-demo">Start my own</button></div>` : '';
  app.innerHTML = str(banner) + str(view);
  document.body.dataset.page = !S && page !== 'start' ? 'landing' : page;
  updateNav(page);
  hydrate();
  workoutUi(page === 'workout' && !!S?.active);
  if (forceTop || location.hash !== lastRoute) {
    window.scrollTo(0, 0);
    lastRoute = location.hash;
    const h1 = app.querySelector('h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  }
}

function updateNav(page) {
  const nav = document.getElementById('tabbar');
  nav.hidden = !S || page === 'start' || page === 'workout';
  nav.querySelectorAll('a').forEach((a) => {
    const on = a.dataset.page === page || (a.dataset.page === 'home' && !['plan', 'checkin', 'progress', 'settings', 'edit'].includes(page));
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const dot = nav.querySelector('.due-dot');
  if (dot) dot.hidden = !(S && checkinStatus(S).isDue);
}

// Fill in photos that live in IndexedDB.
async function hydrate() {
  for (const img of app.querySelectorAll('img[data-photo]')) {
    const url = await photoUrl(img.dataset.photo);
    if (url) img.src = url;
    else img.closest('.photo')?.classList.add('missing');
  }
  for (const img of app.querySelectorAll('img[data-draft]')) {
    const u = draft?.urls?.[img.dataset.draft];
    if (u) img.src = u;
  }
}

// ---------- small components ----------
const errorBox = () => (draft?.error ? html`<div class="alert alert-bad" role="alert">${draft.error}</div>` : '');

function seg(name, options, value) {
  return html`<div class="seg" role="radiogroup">${options.map(
    ([v, label]) => html`<label class="seg-opt"><input type="radio" name="${name}" value="${v}" ${String(v) === String(value) ? raw('checked') : ''}><span>${label}</span></label>`,
  )}</div>`;
}

function choiceCards(name, options, value, { type = 'radio', cls = '' } = {}) {
  const isOn = (v) => (Array.isArray(value) ? value.includes(v) : String(v) === String(value));
  return html`<div class="choices ${cls}">${options.map(
    (o) => html`<label class="choice ${o.disabled ? 'is-disabled' : ''}">
      <input type="${type}" name="${name}" value="${o.v}" ${isOn(o.v) ? raw('checked') : ''} ${o.disabled ? raw('disabled') : ''}>
      ${o.art ? raw(o.art) : ''}
      <span class="choice-text"><span class="choice-title">${o.t}</span>${o.d ? html`<span class="choice-desc">${o.d}</span>` : ''}</span>
    </label>`,
  )}</div>`;
}

function stat(label, value, unit = '', note = '') {
  return html`<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}<small>${unit}</small></span>${note ? html`<span class="stat-note">${note}</span>` : ''}</div>`;
}

function photoTile(id, label, extra = '') {
  return html`<figure class="photo ${extra}"><img data-photo="${id}" alt="${label}"><figcaption>${label}</figcaption></figure>`;
}

function stageBf(sex, n) {
  const [lo, hi] = STAGES[n].bf[sex];
  return n === 0 ? `over ${lo}%` : n === 5 ? `under ${hi}%` : `${lo}–${hi}%`;
}

// ---------- landing ----------
function landing() {
  return html`
  <section class="hero">
    <p class="eyebrow">Free · no sign-up · works on your phone</p>
    <h1>Photograph your abs.<br>Get the plan to show them.</h1>
    <p class="lead">Take two photos, one relaxed and one tensed, and answer a few questions. ${APP} builds your calories, a daily snack allowance and a workout plan for the kit you have, tells you roughly how long it will take, then checks your progress every ${CHECKIN_DAYS} days.</p>
    <div class="hero-cta">
      <button class="btn btn-primary btn-lg" data-act="start">Start my plan</button>
      <button class="btn btn-ghost btn-lg" data-act="demo">See a demo</button>
    </div>
    <p class="muted small">Takes about 3 minutes. The demo uses sample data, so you can look around first.</p>
    <div class="hero-art" aria-hidden="true">${raw([1, 3, 5].map((n) => torso(n, 92)).join(''))}</div>
  </section>

  <section class="section">
    <h2>How it works</h2>
    <ol class="how">
      <li><span class="how-n">1</span><div><strong>Two photos</strong><p>Relaxed and tensed, in good light. The guide and timer help you line them up.</p></div></li>
      <li><span class="how-n">2</span><div><strong>Your plan</strong><p>Calories, protein, meals with gram amounts, a snack allowance and workouts for the gym or home.</p></div></li>
      <li><span class="how-n">3</span><div><strong>A real timeline</strong><p>An honest estimate in weeks, with milestones for each stage of definition.</p></div></li>
      <li><span class="how-n">4</span><div><strong>Check in every ${CHECKIN_DAYS} days</strong><p>Two new photos and a weigh-in. If it is not working, the plan adjusts.</p></div></li>
    </ol>
  </section>

  <section class="section grid-2">
    <div class="card">
      <h3>Gym or home, any kit</h3>
      <p>Tell us if you can get to a gym. If not, tick what you have: dumbbells, bands, a pull-up bar or nothing at all. Every session includes ab work.</p>
    </div>
    <div class="card">
      <h3>Food you would actually eat</h3>
      <p>Meals scaled to your numbers, for meat eaters, pescatarians, vegetarians and vegans, with dairy, gluten and nut-free swaps.</p>
    </div>
    <div class="card">
      <h3>A snack allowance</h3>
      <p>A daily calorie budget for snacks and treats, with a quick tracker so you know what is left.</p>
    </div>
    <div class="card">
      <h3>Private by design</h3>
      <p>Your photos are saved on your phone, not in an account. ${AI ? 'They are sent for analysis only when you ask, and are not stored on our server.' : 'In this version they never leave your device.'} <a href="#/privacy">How your data is used</a></p>
    </div>
  </section>

  <section class="section note-box">
    <h2>The honest bit</h2>
    <p>Everyone has abs. Whether you can see them comes down to body fat, which you lose with a calorie deficit over weeks, not crunches. Training makes the muscle thicker so it shows sooner. ${APP} handles both, and tells you straight if your goal will take months.</p>
  </section>`;
}

// ---------- onboarding ----------
function newOnboardDraft() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem('corecheck.draft') || 'null');
  } catch {}
  return { kind: 'onboard', step: 0, profile: { ...DEFAULT_PROFILE, ...(saved || {}) }, photos: {}, urls: {}, error: null };
}
function persistDraft() {
  try {
    if (draft?.kind === 'onboard') sessionStorage.setItem('corecheck.draft', JSON.stringify(draft.profile));
  } catch {}
}

function onboarding() {
  if (!draft || draft.kind !== 'onboard') draft = newOnboardDraft();
  if (draft.step === 'analysing') return analysingView('Building your plan');
  const step = STEPS[draft.step];
  const p = draft.profile;
  const body = { you: () => formYou(p), training: () => formTraining(p), food: () => formFood(p), goal: () => formGoal(p), photos: () => photosStep() }[step.id]();
  return html`
  <div class="wizard">
    <div class="wizard-top">
      <button class="icon-btn" data-act="back" aria-label="Back">←</button>
      <div class="steps" aria-label="Step ${draft.step + 1} of ${STEPS.length}">
        ${STEPS.map((s, i) => html`<span class="${i < draft.step ? 'done' : i === draft.step ? 'now' : ''}"></span>`)}
      </div>
      <span class="muted small">${draft.step + 1}/${STEPS.length}</span>
    </div>
    <h1>${step.title}</h1>
    <p class="lead-sm step-sub">${step.sub}</p>
    ${body}
  </div>`;
}

function formYou(p, edit = false) {
  const imp = p.units === 'imperial';
  const hp = p.heightCm ? heightParts(p.heightCm) : { ft: '', inch: '' };
  const wp = p.weightKg ? weightParts(p.weightKg) : { st: '', lb: '' };
  const len = (name, cm, label, hint) => html`<label class="field"><span class="label">${label}</span>
    <span class="unit-input"><input name="${name}${imp ? 'In' : 'Cm'}" type="number" inputmode="decimal" step="0.1" value="${cm ? (imp ? Math.round((cm / 2.54) * 10) / 10 : cm) : ''}"><span>${imp ? 'in' : 'cm'}</span></span>
    ${hint ? html`<span class="hint">${hint}</span>` : ''}</label>`;
  return html`
  <form data-form="you" class="stack" novalidate>
    ${errorBox()}
    <div class="field"><span class="label">Units</span>${seg('units', [['metric', 'kg & cm'], ['imperial', 'stone & feet']], p.units)}</div>
    <fieldset class="field"><legend class="label">Sex <span class="muted">(calorie formulas differ)</span></legend>${seg('sex', [['male', 'Male'], ['female', 'Female']], p.sex)}</fieldset>
    <div class="row-2">
      <label class="field"><span class="label">Age</span><input name="age" type="number" inputmode="numeric" min="13" max="90" value="${p.age ?? ''}" required></label>
      ${imp
        ? html`<div class="field"><span class="label">Height</span><span class="pair">
            <span class="unit-input"><input name="ft" type="number" inputmode="numeric" aria-label="Feet" value="${hp.ft}"><span>ft</span></span>
            <span class="unit-input"><input name="inch" type="number" inputmode="numeric" aria-label="Inches" value="${hp.inch}"><span>in</span></span></span></div>`
        : html`<label class="field"><span class="label">Height</span><span class="unit-input"><input name="heightCm" type="number" inputmode="numeric" value="${p.heightCm ? Math.round(p.heightCm) : ''}"><span>cm</span></span></label>`}
    </div>
    ${edit
      ? html`<p class="hint">Your weight updates each time you check in.</p>`
      : imp
        ? html`<div class="field"><span class="label">Weight</span><span class="pair">
            <span class="unit-input"><input name="st" type="number" inputmode="numeric" aria-label="Stone" value="${wp.st}"><span>st</span></span>
            <span class="unit-input"><input name="lb" type="number" inputmode="decimal" step="0.1" aria-label="Pounds" value="${wp.lb}"><span>lb</span></span></span></div>`
        : html`<label class="field"><span class="label">Weight</span><span class="unit-input"><input name="weightKg" type="number" inputmode="decimal" step="0.1" value="${p.weightKg ? Math.round(p.weightKg * 10) / 10 : ''}"><span>kg</span></span></label>`}
    <fieldset class="field"><legend class="label">Day to day <span class="muted">(not counting workouts)</span></legend>
      ${choiceCards('activity', ACTIVITY, p.activity)}
    </fieldset>
    <details class="more" ${p.waistCm || p.neckCm ? raw('open') : ''}>
      <summary>Add tape measurements <span class="muted">optional, sharpens the estimate</span></summary>
      <div class="row-2">
        ${len('waist', p.waistCm, 'Waist', 'Around your belly button, relaxed')}
        ${len('neck', p.neckCm, 'Neck', 'Just below the Adam’s apple')}
      </div>
      ${p.sex === 'female' ? len('hip', p.hipCm, 'Hips', 'Widest point') : ''}
    </details>
    <button class="btn btn-primary btn-block" type="submit">${edit ? 'Save' : 'Next'}</button>
  </form>`;
}

function formTraining(p, edit = false) {
  const kit = EQUIPMENT.map((e) => ({ v: e.id, t: e.name }));
  return html`
  <form data-form="training" class="stack" novalidate>
    ${errorBox()}
    <fieldset class="field"><legend class="label">Can you get to a gym?</legend>
      ${choiceCards('gym', [{ v: 'yes', t: 'Yes, I can use a gym', d: 'Machines, cables, barbells' }, { v: 'no', t: 'No, I’ll train at home', d: 'Pick your kit below' }], p.gym ? 'yes' : 'no')}
    </fieldset>
    <fieldset class="field kit" ${p.gym ? raw('hidden') : ''}><legend class="label">What do you have at home?</legend>
      ${choiceCards('equipment', kit, p.equipment, { type: 'checkbox', cls: 'chips' })}
      <p class="hint">Nothing at all? Leave them unticked and you’ll get a bodyweight plan.</p>
    </fieldset>
    <fieldset class="field"><legend class="label">Days a week you can train</legend>${seg('days', [2, 3, 4, 5, 6].map((d) => [d, String(d)]), p.days)}</fieldset>
    <fieldset class="field"><legend class="label">Time per session</legend>${seg('mins', [20, 30, 45, 60].map((m) => [m, `${m} min`]), p.mins)}</fieldset>
    <button class="btn btn-primary btn-block" type="submit">${edit ? 'Save' : 'Next'}</button>
  </form>`;
}

function formFood(p, edit = false) {
  return html`
  <form data-form="food" class="stack" novalidate>
    ${errorBox()}
    <fieldset class="field"><legend class="label">What do you eat?</legend>${choiceCards('diet', DIETS, p.diet, { cls: 'chips' })}</fieldset>
    <fieldset class="field"><legend class="label">Anything to avoid?</legend>${choiceCards('avoid', AVOID, p.avoid, { type: 'checkbox', cls: 'chips' })}</fieldset>
    <fieldset class="field"><legend class="label">Meals a day</legend>${seg('meals', [[3, 'Breakfast, lunch, dinner'], [2, 'I skip breakfast']], p.meals)}</fieldset>
    <p class="hint">Snacks come out of a separate daily allowance, so you can still have them.</p>
    <button class="btn btn-primary btn-block" type="submit">${edit ? 'Save' : 'Next'}</button>
  </form>`;
}

function formGoal(p, edit = false) {
  const teen = p.age != null && p.age < 18;
  const self = STAGES.map((s) => ({ v: s.n, t: s.name, d: s.desc, art: torso(s.n, 46) }));
  const goals = [3, 4, 5].map((n) => ({
    v: n,
    t: STAGES[n].name,
    d: `${STAGES[n].desc} Around ${stageBf(p.sex, n)} body fat.${n === 5 ? ' Hard to hold year-round.' : ''}`,
    art: torso(n, 46),
    disabled: teen && n === 5,
  }));
  return html`
  <form data-form="goal" class="stack" novalidate>
    ${errorBox()}
    ${edit
      ? ''
      : html`<fieldset class="field"><legend class="label">Tense your abs in a mirror. Which looks most like you now?</legend>
          ${choiceCards('selfStage', self, p.selfStage, { cls: 'stages' })}
        </fieldset>`}
    <fieldset class="field"><legend class="label">What are you aiming for?</legend>
      ${choiceCards('goalStage', goals, teen ? Math.min(p.goalStage, 4) : p.goalStage, { cls: 'stages' })}
      ${teen ? html`<p class="hint">Under 18s get a gentler plan: you’re still growing, so we keep calories close to maintenance and focus on training.</p>` : ''}
    </fieldset>
    <button class="btn btn-primary btn-block" type="submit">${edit ? 'Save' : 'Next'}</button>
  </form>`;
}

function photoTips() {
  return html`<ul class="tips">
    <li><strong>Same spot, same light, every time.</strong> Light from above shows definition best.</li>
    <li><strong>Shirt off, waistband at your hips.</strong> Phone at belly-button height, about 1 m away. Prop it up and use the timer.</li>
    <li><strong>Morning, before breakfast.</strong> Food and water change how your stomach looks.</li>
  </ul>`;
}

function photoSlots(ghosts = {}) {
  return html`<div class="shots">${Object.keys(POSES).map((pose) => {
    const has = !!draft.photos[pose];
    return html`<div class="shot ${has ? 'has' : ''}">
      <div class="shot-frame">${has ? html`<img data-draft="${pose}" alt="${POSES[pose]} photo">` : ghosts[pose] ? html`<img class="ghosted" data-photo="${ghosts[pose]}" alt="">` : raw(torso(pose === 'tensed' ? 4 : 1, 70))}</div>
      <div class="shot-body">
        <strong>${POSES[pose]}</strong>
        <span class="muted small">${POSE_HINT[pose]}</span>
        <div class="shot-actions">
          <button type="button" class="btn ${has ? 'btn-ghost' : 'btn-primary'} btn-sm" data-act="shoot" data-pose="${pose}">${has ? 'Retake' : 'Take photo'}</button>
          <button type="button" class="link small" data-act="upload" data-pose="${pose}">Upload instead</button>
        </div>
      </div>
    </div>`;
  })}</div>`;
}

function photosStep() {
  const p = draft.profile;
  const teen = p.age < 18;
  const ready = draft.photos.relaxed && draft.photos.tensed;
  return html`
  <div class="stack">
    ${errorBox()}
    <p class="lead-sm">Two photos of your stomach: relaxed, then tensed. These are your "before" shots and how ${APP} tracks your progress.</p>
    ${photoTips()}
    ${photoSlots()}
    <p class="privacy-line">${raw(lockIcon())} ${teen
      ? 'You’re under 18, so your photos stay on this phone and are not analysed. Your estimate comes from your answers instead.'
      : AI
        ? 'Saved on this phone. Sent once to our server for analysis by Claude (an AI model), then discarded.'
        : 'Saved on this phone only. They never leave your device.'}</p>
    <button class="btn btn-primary btn-block btn-lg" data-act="build" ${ready ? '' : raw('disabled')}>Build my plan</button>
  </div>`;
}

const lockIcon = () => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

function analysingView(title) {
  return html`<section class="analysing" aria-live="polite">
    <div class="pulse">${raw(logo(64))}</div>
    <h1>${title}…</h1>
    <ul class="ticks">
      <li>Checking your photos</li>
      <li>Estimating body fat</li>
      <li>Scaling your meals</li>
      <li>Picking your exercises</li>
    </ul>
  </section>`;
}

// Read a step's form into draft.profile. Returns an error message or null.
function captureForm(form, strict) {
  const fd = new FormData(form);
  const p = draft.profile;
  const kind = form.dataset.form;
  if (kind === 'you') {
    const wasImperial = fd.has('ft') || fd.has('st') || fd.has('waistIn');
    if (fd.get('units')) p.units = fd.get('units');
    if (fd.get('sex')) p.sex = fd.get('sex');
    p.age = num(fd.get('age'));
    if (fd.has('heightCm')) p.heightCm = num(fd.get('heightCm'));
    if (fd.has('ft')) {
      const ft = num(fd.get('ft'));
      p.heightCm = ft != null ? (ft * 12 + (num(fd.get('inch')) || 0)) * 2.54 : null;
    }
    if (fd.has('weightKg')) p.weightKg = num(fd.get('weightKg'));
    if (fd.has('st')) {
      const st = num(fd.get('st'));
      const lb = num(fd.get('lb'));
      p.weightKg = st != null || lb != null ? ((st || 0) * 14 + (lb || 0)) * KG_PER_LB : null;
    }
    if (fd.get('activity')) p.activity = fd.get('activity');
    for (const k of ['waist', 'neck', 'hip']) {
      const key = wasImperial ? `${k}In` : `${k}Cm`;
      if (fd.has(key)) {
        const v = num(fd.get(key));
        p[`${k}Cm`] = v == null ? null : wasImperial ? v * 2.54 : v;
      }
    }
    if (strict) {
      if (p.age == null) return 'Please enter your age.';
      if (p.age < 13) return `${APP} is for ages 13 and up. Ask a parent or your GP about healthy ways to stay active.`;
      if (p.age > 90) return 'Please check your age.';
      if (!p.heightCm || p.heightCm < 120 || p.heightCm > 230) return 'Please check your height.';
      if (!draft.editing && (!p.weightKg || p.weightKg < 35 || p.weightKg > 250)) return 'Please check your weight.';
      if (p.waistCm != null && (p.waistCm < 45 || p.waistCm > 200)) return 'Please check your waist measurement.';
      if (p.neckCm != null && (p.neckCm < 22 || p.neckCm > 60)) return 'Please check your neck measurement.';
      if (p.hipCm != null && (p.hipCm < 55 || p.hipCm > 200)) return 'Please check your hip measurement.';
    }
  } else if (kind === 'training') {
    if (fd.get('gym')) p.gym = fd.get('gym') === 'yes';
    p.equipment = fd.getAll('equipment');
    if (fd.get('days')) p.days = Number(fd.get('days'));
    if (fd.get('mins')) p.mins = Number(fd.get('mins'));
  } else if (kind === 'food') {
    if (fd.get('diet')) p.diet = fd.get('diet');
    p.avoid = fd.getAll('avoid');
    if (fd.get('meals')) p.meals = Number(fd.get('meals'));
  } else if (kind === 'goal') {
    if (fd.has('selfStage')) p.selfStage = Number(fd.get('selfStage'));
    if (fd.get('goalStage')) p.goalStage = Number(fd.get('goalStage'));
    if (strict && !draft.editing && p.selfStage == null) return 'Pick the picture that looks most like you now.';
    if (p.age < 18) p.goalStage = Math.min(p.goalStage, 4);
  }
  persistDraft();
  return null;
}

// ---------- photos ----------
const filePicker = document.getElementById('filePick');
let pickResolve = null;
filePicker.addEventListener('change', () => {
  const f = filePicker.files && filePicker.files[0];
  filePicker.value = '';
  if (pickResolve) pickResolve(f || null);
  pickResolve = null;
});
function pickFile(capture) {
  return new Promise((resolve) => {
    pickResolve = resolve;
    if (capture) filePicker.setAttribute('capture', 'user');
    else filePicker.removeAttribute('capture');
    filePicker.click();
  });
}

async function setDraftPhoto(pose, blob) {
  if (draft.urls[pose]) URL.revokeObjectURL(draft.urls[pose]);
  draft.photos[pose] = blob;
  draft.urls[pose] = URL.createObjectURL(blob);
  draft.error = null;
  render();
}

async function takePhoto(pose) {
  let ghostUrl = null;
  if (draft.kind === 'checkin' && S) ghostUrl = await photoUrl(S.entries.at(-1).photos?.[pose]);
  let result = null;
  if (cameraSupported()) result = await openCamera({ title: `${POSES[pose]} photo`, hint: POSE_HINT[pose], ghostUrl });
  else result = 'fallback';
  if (result === 'fallback') {
    const f = await pickFile(true);
    if (!f) return;
    result = await normalisePhoto(f).catch(() => null);
    if (!result) return toast('That photo could not be opened. Try another.');
  }
  if (result) setDraftPhoto(pose, result);
}

async function uploadPhoto(pose) {
  const f = await pickFile(false);
  if (!f) return;
  if (!f.type.startsWith('image/')) return toast('Please choose a photo.');
  const blob = await normalisePhoto(f).catch(() => null);
  if (!blob) return toast('That photo could not be opened. Try a JPEG or PNG.');
  setDraftPhoto(pose, blob);
}

// Ask the server to analyse the photos. Returns the analysis or throws.
async function analysePhotos({ profile, weightKg, waistCm, selfStage, photos, previous }) {
  const images = { relaxed: await toUploadBase64(photos.relaxed), tensed: await toUploadBase64(photos.tensed) };
  let prev = null;
  if (previous) {
    const [r, t] = await Promise.all([getPhoto(previous.photos?.relaxed), getPhoto(previous.photos?.tensed)]);
    prev = {
      daysAgo: daysBetween(previous.date, today()),
      weightKg: previous.weightKg,
      waistCm: previous.waistCm,
      bf: previous.bf,
      stage: previous.stage,
      images: r && t ? { relaxed: await toUploadBase64(r), tensed: await toUploadBase64(t) } : null,
    };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch('api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        profile: { sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg, waistCm, goalStage: profile.goalStage },
        selfStage,
        images,
        previous: prev,
      }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.result) throw new Error(data.error || 'The photo analysis is not available right now.');
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

async function finishOnboarding() {
  const p = draft.profile;
  const photos = draft.photos;
  if (!photos.relaxed || !photos.tensed) return;
  draft.step = 'analysing';
  render(true);
  const started = Date.now();

  let ai = null;
  let aiError = null;
  if (AI && p.age >= 18) {
    try {
      ai = await analysePhotos({ profile: p, weightKg: p.weightKg, waistCm: p.waistCm, selfStage: p.selfStage, photos });
    } catch (e) {
      aiError = e.message;
    }
    if (ai && !ai.photo_ok) {
      draft.step = 4;
      draft.error = `We couldn’t use those photos: ${ai.photo_problem || 'please retake them.'}`;
      return render(true);
    }
  }
  const [defR, defT] = await Promise.all([definitionScore(photos.relaxed), definitionScore(photos.tensed)]);
  const id = uid();
  const ids = { relaxed: `${id}-relaxed`, tensed: `${id}-tensed` };
  await putPhoto(ids.relaxed, photos.relaxed);
  await putPhoto(ids.tensed, photos.tensed);

  const profile = { ...p };
  const entry = {
    id, kind: 'baseline', date: today(), ts: Date.now(),
    weightKg: p.weightKg, waistCm: p.waistCm || null, neckCm: p.neckCm || null, hipCm: p.hipCm || null,
    selfStage: p.selfStage, photos: ids, ai, aiError, def: { relaxed: defR, tensed: defT },
  };
  Object.assign(entry, estimateBodyFat(profile, entry, null));
  S = migrate({ version: 1, createdAt: Date.now(), profile, entries: [entry], calorieAdjust: 0, lockSkip: null, log: {}, seenIntro: false });
  save();
  requestPersistence();
  try {
    sessionStorage.removeItem('corecheck.draft');
  } catch {}
  Object.values(draft.urls).forEach((u) => URL.revokeObjectURL(u));
  draft = null;
  // Let the "building" screen show for a moment so it doesn't flash.
  await new Promise((r) => setTimeout(r, Math.max(0, 1200 - (Date.now() - started))));
  go('');
}

// ---------- check-in lock ----------
const isLocked = () => S && checkinStatus(S).isDue && S.lockSkip !== today();

function lockWrap(content, compact = false) {
  if (!isLocked()) return content;
  const st = checkinStatus(S);
  return html`<div class="locked">
    <div class="locked-content" aria-hidden="true" inert>${content}</div>
    <div class="lock-msg">
      <strong>${compact ? 'Today’s plan unlocks after your check-in' : st.overdue ? `Your check-in is ${plural(st.overdue, 'day')} overdue` : 'Your check-in is due today'}</strong>
      <p>Two photos and a weigh-in tell ${APP} whether it’s working, so your numbers stay right.</p>
      <div class="row-btns">
        ${compact ? '' : html`<a class="btn btn-primary" href="#/checkin">Check in now</a>`}
        <button class="btn btn-ghost" data-act="skip-lock">Not today</button>
      </div>
    </div>
  </div>`;
}

// ---------- home ----------
const SLOT = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const flame = () => '<svg class="i flame" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.5 3.2 4.5 5.3 4.5 10a4.5 4.5 0 0 1-9 0c0-2.2 1.2-3.6 2.3-4.6.2 1.6.9 2.6 2 3.1C11 9 11 6 12 3z"/></svg>';

function checkinCard() {
  const st = checkinStatus(S);
  const elapsed = CHECKIN_DAYS - Math.max(0, st.daysUntil);
  if (st.isDue)
    return html`<a class="card card-due" href="#/checkin">
      <span class="badge">Check-in</span>
      <strong class="big">${st.overdue ? `${plural(st.overdue, 'day')} overdue` : 'Due today'}</strong>
      <span>Take your relaxed and tensed photos, then weigh in. Takes 2 minutes.</span>
      <span class="btn btn-primary">Start check-in</span>
    </a>`;
  return html`<div class="card checkin-mini">
    <div class="card-row"><span><span class="muted small">Next check-in</span> <strong>${st.daysUntil === 1 ? 'tomorrow' : `in ${st.daysUntil} days`}</strong></span><span class="muted small">${fmtDate(st.due)}</span></div>
    <div class="dayblocks" aria-hidden="true">${Array.from({ length: CHECKIN_DAYS }, (_, i) => html`<span class="${i < elapsed ? 'on' : ''}"></span>`)}</div>
    <button class="link small" data-act="reminders">Add reminders to my calendar</button>
  </div>`;
}

function introCard() {
  return html`<section class="card intro">
    <h2 class="h3">How to use ${APP}</h2>
    <ol class="how compact">
      <li><span class="how-n">1</span><div><strong>Every day, do your 4 jobs</strong><p>Tick them off below. Tap Start and the workout talks you through every set.</p></div></li>
      <li><span class="how-n">2</span><div><strong>Eat from today’s menu</strong><p>It’s already portioned for you. Don’t fancy something? Tap Swap.</p></div></li>
      <li><span class="how-n">3</span><div><strong>Every ${CHECKIN_DAYS} days, check in</strong><p>Two photos and a weigh-in. If you stall, the plan adjusts.</p></div></li>
    </ol>
    <button class="btn btn-ghost btn-sm" data-act="intro-ok">Got it</button>
  </section>`;
}

function resumeCard(plan, a) {
  const session = findSession(plan, a.sessionId);
  if (!session) return '';
  const sets = a.done.filter((n) => n > 0).length;
  return html`<a class="card card-due" href="#/workout">
    <span class="badge">${a.date === today() ? 'In progress' : `Unfinished · ${fmtDate(a.date)}`}</span>
    <strong class="big">${session.name}</strong>
    <span>${sets ? `${plural(sets, 'set')} done so far.` : 'Warm-up next.'}</span>
    <span class="btn btn-primary">Resume workout</span>
  </a>`;
}

function tickBtn(key, done, label) {
  return html`<button class="tick" data-act="tick" data-k="${key}" aria-pressed="${done ? 'true' : 'false'}" aria-label="${label}"></button>`;
}

function jobRow(it, plan, jobs) {
  const d = dayLog(S);
  const cls = `job ${it.done ? 'done' : ''}`;
  if (it.key === 'workout') {
    const s = jobs.session;
    const a = activeWorkout(S);
    const n = s.main.length + s.core.length + (s.finisher ? 1 : 0);
    return html`<li class="${cls}">
      ${tickBtn('workout', it.done, `Workout done: ${s.name}`)}
      <div class="job-body"><strong>${s.name}</strong><span class="muted small">${it.done ? 'Done. Nice work.' : `${n} exercises · about ${S.profile.mins} min`}</span></div>
      ${it.done ? '' : html`<button class="btn btn-primary btn-sm" data-act="wo-start" data-session="${s.id}">${a && a.sessionId === s.id ? 'Resume' : 'Start'}</button>`}
    </li>`;
  }
  if (it.key === 'steps')
    return html`<li class="${cls}">
      ${tickBtn('steps', it.done, `Walked ${fmt(plan.steps)} steps`)}
      <div class="job-body"><strong>Rest day: walk ${fmt(plan.steps)} steps</strong><span class="muted small">${d.ticks.workout ? 'You trained anyway. That counts.' : html`Or do a <a href="#/plan/training">bonus workout</a>`}</span></div>
    </li>`;
  if (it.key === 'protein') {
    const perMeal = Math.round(sum(plan.meals, (m) => m.protein) / plan.meals.length / 5) * 5;
    return html`<li class="${cls}">
      ${tickBtn('protein', it.done, `Hit ${fmt(plan.protein)} g protein`)}
      <div class="job-body"><strong>Hit ${fmt(plan.protein)} g protein</strong><span class="muted small">About ${perMeal} g a meal, plus a protein snack</span></div>
    </li>`;
  }
  if (it.key === 'water') {
    const per = plan.water / WATER_GLASSES;
    return html`<li class="${cls}">
      ${tickBtn('water', it.done, `Drank ${fmt(plan.water, 1)} litres`)}
      <div class="job-body"><strong>Drink ${fmt(plan.water, 1)} L of water</strong>
        <span class="glasses" role="group" aria-label="Glasses of water, ${fmt(per * 1000, 0)} ml each">${Array.from({ length: WATER_GLASSES }, (_, k) => html`<button class="glass ${k < d.water ? 'full' : ''}" data-act="water" data-n="${k + 1}" aria-label="${k + 1} glass${k ? 'es' : ''}" aria-pressed="${k < d.water ? 'true' : 'false'}"></button>`)}</span>
        <span class="muted small">${fmt(d.water * per, 1)} of ${fmt(plan.water, 1)} L · each glass is ${fmt(Math.round((per * 1000) / 10) * 10)} ml</span>
      </div>
    </li>`;
  }
  // snacks
  return html`<li class="${cls} snack ${jobs.snackLeft < 0 ? 'over' : ''}">
    <span class="tick auto" aria-hidden="true"></span>
    <div class="job-body"><strong>${jobs.snackLeft >= 0 ? `Snacks: ${fmt(jobs.snackLeft)} kcal left` : `Snacks: ${fmt(-jobs.snackLeft)} kcal over`}</strong><span class="muted small">Your treat allowance is ${fmt(plan.snackKcal)} kcal a day</span></div>
    <button class="btn btn-ghost btn-sm" data-act="goto-snacks">Log</button>
  </li>`;
}

function menuCard(plan, menu) {
  return html`<section class="card">
    <div class="card-row"><h2 class="h3">Today’s menu</h2><a class="small" href="#/plan/food">Recipes →</a></div>
    <ul class="menu">${menu.map((m) => html`<li>
      <span class="menu-slot">${SLOT[m.slot]}</span>
      <a class="menu-name" href="#/plan/food">${m.pick.name}<span class="muted small">${fmt(m.pick.kcal)} kcal · ${m.pick.p} g protein</span></a>
      <button class="swap" data-act="swap" data-slot="${m.slot}" aria-label="Swap ${m.slot} for another meal">${raw(swapIcon())}<span>Swap</span></button>
    </li>`)}</ul>
    <p class="small muted menu-foot">Meals ${fmt(sum(menu, (m) => m.pick.kcal))} kcal + ${fmt(plan.snackKcal)} kcal of snacks = about ${fmt(plan.kcal)} kcal.</p>
  </section>`;
}
const swapIcon = () => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h13l-3.5-3.5M20 15H7l3.5 3.5"/></svg>';

function home() {
  const plan = buildPlan(S);
  const t = plan.timeline;
  const day = daysBetween(S.entries[0].date, today()) + 1;
  const a = activeWorkout(S);
  const jobs = jobsFor(S, plan);
  const done = jobs.items.filter((i) => i.done).length;
  const st = streaks(S, plan);
  const menu = menuFor(plan, today(), dayLog(S).meals);
  const todayBody = html`
    <section class="card jobs-card">
      <div class="card-row"><h2 class="h3">Today’s 4 jobs</h2><span class="score ${done === 4 ? 'full' : done >= GOOD_DAY ? 'good' : ''}">${done} of 4 done</span></div>
      <ol class="jobs">${jobs.items.map((it) => jobRow(it, plan, jobs))}</ol>
      <p class="jobs-foot small">${st.current
        ? html`${raw(flame())}<strong>${plural(st.current, 'good day')} in a row.</strong> <span class="muted">${done >= GOOD_DAY ? 'Today counts.' : `Tick ${GOOD_DAY - done} more to keep it going.`}</span>`
        : html`<span class="muted">Tick off ${GOOD_DAY} of 4 to make today a good day and start a streak.</span>`}</p>
    </section>
    ${menuCard(plan, menu)}
    <section class="card" id="snacks">
      <div class="card-row"><h2 class="h3">Snack allowance</h2><a class="small" href="#/plan/snacks">Ideas →</a></div>
      ${snackTracker(plan, true)}
    </section>`;
  return html`
  <header class="page-head">
    <p class="eyebrow">${fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long' })} · day ${day}</p>
    <h1>Today</h1>
    <a class="goal-line" href="#/plan/timeline">${plan.maintenance ? 'You’re at your goal. Now keep it.' : t.weeks ? `${STAGES[t.goalStage].name} in about ${t.weeksLow}–${t.weeksHigh} weeks` : 'Your plan'} →</a>
  </header>
  ${!S.seenIntro ? introCard() : ''}
  ${a ? resumeCard(plan, a) : ''}
  ${checkinCard()}
  ${lockWrap(todayBody, true)}
  <a class="card card-link" href="#/plan/timeline">
    <div class="card-row"><span class="muted small">Estimated body fat</span><span class="muted small">Goal ${fmt(t.targetBf, 0)}%</span></div>
    ${bfBar(plan)}
    <span class="small">${plan.maintenance ? 'You’re at your goal. Now it’s about keeping it.' : `Around ${fmtDate(t.dateLow, { day: 'numeric', month: 'short' })} – ${fmtDate(t.dateHigh, { day: 'numeric', month: 'short', year: 'numeric' })} · see milestones →`}</span>
  </a>`;
}

function bfBar(plan) {
  const start = Math.max(S.entries[0].bf, plan.bf);
  const goal = plan.timeline.targetBf;
  const pct = start - goal <= 0 ? 100 : Math.max(0, Math.min(100, ((start - plan.bf) / (start - goal)) * 100));
  return html`<div class="bfbar" role="img" aria-label="Body fat ${fmt(plan.bf, 0)}%, goal ${fmt(goal, 0)}%">
    <div class="bfbar-track"><span style="width:${Math.max(3, pct).toFixed(1)}%"></span></div>
    <div class="bfbar-labels"><span>${fmt(start, 0)}%</span><strong>${fmt(plan.bf, 0)}% now</strong><span>${fmt(goal, 0)}%</span></div>
  </div>`;
}

// ---------- snacks ----------
const todaysSnacks = () => dayLog(S).snacks;

function snackTracker(plan, compact = false) {
  const items = todaysSnacks();
  const used = sum(items, (i) => i.kcal);
  const left = plan.snackKcal - used;
  const pct = Math.min(100, (used / plan.snackKcal) * 100);
  const quick = plan.snacks.slice().sort((a, b) => b.p / b.kcal - a.p / a.kcal).slice(0, compact ? 6 : 10);
  return html`<div class="snacks">
    <div class="meter ${left < 0 ? 'over' : ''}"><span style="width:${pct.toFixed(1)}%"></span></div>
    <p class="meter-text">${left >= 0 ? html`<strong>${fmt(left)} kcal left</strong> <span class="muted">of ${fmt(plan.snackKcal)} today</span>` : html`<strong>${fmt(-left)} kcal over</strong> <span class="muted">today’s ${fmt(plan.snackKcal)} kcal allowance</span>`}</p>
    ${items.length
      ? html`<ul class="logged">${items.map((it, i) => html`<li><span>${it.name}</span><span>${fmt(it.kcal)} kcal <button class="x" data-act="snack-remove" data-i="${i}" aria-label="Remove ${it.name}">✕</button></span></li>`)}</ul>`
      : ''}
    <p class="small muted chip-label">Tap to log:</p>
    <div class="chip-row" aria-label="Quick add a snack">${quick.map((s) => html`<button class="chip" data-act="snack-add" data-id="${s.id}">${s.name.split(' (')[0]} <span>${s.kcal}</span></button>`)}</div>
    <form data-form="snack-custom" class="inline-form">
      <label class="sr" for="snackKcal">Something else (kcal)</label>
      <input id="snackKcal" name="kcal" type="number" inputmode="numeric" placeholder="Something else? kcal" min="1" max="2000">
      <button class="btn btn-ghost btn-sm" type="submit">Add</button>
    </form>
  </div>`;
}

// ---------- plan ----------
function whereYouAre(plan) {
  const e = S.entries.at(-1);
  const ai = e.ai && e.ai.photo_ok ? e.ai : null;
  const units = S.profile.units;
  return html`<section class="card card-hero">
    <div class="where">
      <div class="where-art">${raw(torso(plan.stage ?? plan.currentStage, 84))}</div>
      <div>
        <p class="eyebrow">Where you are now</p>
        <p class="where-bf"><strong>${fmt(plan.bfLow)}–${fmt(plan.bfHigh)}%</strong> body fat</p>
        <p class="muted small">${STAGES[plan.stage ?? plan.currentStage].name} · ${fmtWeight(plan.weight, units)}</p>
      </div>
    </div>
    ${ai
      ? html`<div class="ai-note"><span class="badge badge-soft">Photo analysis</span><p>${ai.summary}</p>
          ${ai.visible ? html`<div class="chip-row static">${['upper', 'middle', 'lower', 'obliques'].map((k) => html`<span class="tag ${ai.visible[k] ? 'on' : ''}">${ai.visible[k] ? '✓' : '·'} ${k === 'obliques' ? 'Obliques' : `${k[0].toUpperCase()}${k.slice(1)} abs`}</span>`)}</div>` : ''}
        </div>`
      : ''}
    <p class="small muted">Based on ${e.sources?.join(', ') || 'your answers'}. Photo estimates are rough, so ${APP} watches the trend over your check-ins.</p>
    ${e.aiError ? html`<p class="small muted">Photo analysis wasn’t available this time, so this estimate uses your answers. It will try again at your next check-in.</p>` : ''}
  </section>`;
}

function planPage(sub) {
  const plan = buildPlan(S);
  if (sub === 'shopping') return shoppingPage(plan);
  const tab = ['food', 'snacks', 'training', 'timeline'].includes(sub) ? sub : 'food';
  const tabs = [['food', 'Food'], ['snacks', 'Snacks'], ['training', 'Training'], ['timeline', 'Timeline']];
  const body = { food: planFood, snacks: planSnacks, training: planTraining, timeline: planTimeline }[tab](plan);
  const intro = {
    food: 'Your calories, and a menu for today that already fits them.',
    snacks: 'A daily budget for snacks and treats on top of your meals.',
    training: 'Your week of workouts. Tap a day to see it, then Start.',
    timeline: 'Where you are now and roughly when you’ll get there.',
  }[tab];
  return html`
  <header class="page-head"><p class="eyebrow">Your plan</p><h1>${{ food: 'What to eat', snacks: 'Snack allowance', training: 'Your workouts', timeline: 'How long it will take' }[tab]}</h1><p class="lead-sm">${intro}</p></header>
  <nav class="tabs" aria-label="Plan sections">${tabs.map(([k, label]) => html`<a href="#/plan/${k}" ${k === tab ? raw('aria-current="page"') : ''}>${label}</a>`)}</nav>
  ${tab === 'timeline' ? body : lockWrap(body)}`;
}

function mealDetail(o) {
  return html`<ul class="ingredients">${o.items.map((x) => html`<li>${x}</li>`)}</ul>
    <p class="how">${o.how}</p>
    <p class="small muted">Carbs ${o.c} g · Fat ${o.f} g</p>`;
}

function planFood(plan) {
  const notes = [];
  if (plan.teen) notes.push('Because you’re under 18, calories are kept close to maintenance. Don’t eat less than this: you need it to grow.');
  if (plan.maintenance) notes.push(plan.veryLean ? 'You’re already very lean, so this is a maintenance plan. Going lower isn’t healthy to hold.' : 'You’re at your goal, so these are maintenance calories. Keep training to build thicker abs.');
  if (plan.floorHit && !plan.teen) notes.push(`Your target sits at the safe minimum of ${fmt(plan.kcal)} kcal. Instead of eating less, we’d add steps.`);
  if (plan.adjust) notes.push(`Includes a ${plan.adjust > 0 ? '+' : '−'}${fmt(Math.abs(plan.adjust))} kcal adjustment from your check-ins.`);
  const menu = menuFor(plan, today(), dayLog(S).meals);
  return html`
  <section class="card">
    <div class="stats stats-6">
      ${stat('Calories', fmt(plan.kcal), ' kcal', plan.maintenance ? 'maintenance' : `${fmt(plan.deficit)} below maintenance`)}
      ${stat('Protein', fmt(plan.protein), ' g', 'the priority')}
      ${stat('Carbs', fmt(plan.carbs), ' g')}
      ${stat('Fat', fmt(plan.fat), ' g')}
      ${stat('Fibre', fmt(plan.fibre), ' g')}
      ${stat('Water', fmt(plan.water, 1), ' L')}
    </div>
    ${notes.map((n) => html`<p class="small note">${n}</p>`)}
  </section>
  <div class="section-head"><h2>Today’s menu</h2><p class="hint">Weigh the amounts for the first two weeks. Veg is free: have as much as you like.</p></div>
  ${menu.map((m) => html`
    <section class="meal-slot">
      <div class="slot-head"><h3 class="h3">${SLOT[m.slot]}</h3><span class="muted small">aim for about ${fmt(m.target)} kcal · ${m.protein} g protein</span></div>
      <article class="meal-card">
        <div class="meal-card-head"><strong class="meal-name">${m.pick.name}</strong><span class="meal-meta">${fmt(m.pick.kcal)} kcal · ${m.pick.p} g protein</span></div>
        ${mealDetail(m.pick)}
        <div class="row-btns">
          <button class="btn btn-ghost btn-sm" data-act="swap" data-slot="${m.slot}">${raw(swapIcon())} Swap for another</button>
          ${m.options.length > 1 ? html`<button class="link small" data-act="more-meals">See all ${m.options.length} options</button>` : ''}
        </div>
        <div class="meal-list" hidden>
          ${m.options.filter((o) => o.id !== m.pick.id).map((o) => html`<details class="meal">
            <summary><span class="meal-name">${o.name}</span><span class="meal-meta">${fmt(o.kcal)} kcal · ${o.p} g protein</span></summary>
            ${mealDetail(o)}
            <button class="btn btn-primary btn-sm" data-act="pick-meal" data-slot="${m.slot}" data-id="${o.id}">Have this today</button>
          </details>`)}
        </div>
      </article>
    </section>`)}
  <a class="card card-link shop-link" href="#/plan/shopping">
    <span class="shop-ico" aria-hidden="true">${raw(cartIcon())}</span>
    <span><strong>Shopping list</strong><span class="muted small">Everything for the next 7 days of menus</span></span>
    <span aria-hidden="true">→</span>
  </a>
  <section class="card">
    <h2 class="h3">The rules that matter</h2>
    <ul class="rules">
      <li><strong>Hit your protein.</strong> ${fmt(plan.protein)} g a day keeps your muscle while the fat comes off.</li>
      <li><strong>Veg with lunch and dinner.</strong> It fills you up for very few calories, so it’s never counted against you.</li>
      <li><strong>Weigh food for the first two weeks.</strong> After that you’ll be able to eyeball portions.</li>
      <li><strong>Drink your water, not your calories.</strong> Swap fizzy drinks and juice for water or zero-sugar versions.${plan.teen ? '' : ' Alcohol comes out of your snack allowance (a pint is about 200 kcal).'}</li>
      <li><strong>Sleep 7–9 hours.</strong> Short sleep makes you hungrier and makes the plan harder.</li>
      <li><strong>Same numbers at the weekend.</strong> Two loose days can undo five good ones.</li>
    </ul>
  </section>`;
}
const cartIcon = () => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.1"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>';

const SHOP_DAYS = 7;
function shopMenus(plan) {
  return Array.from({ length: SHOP_DAYS }, (_, i) => {
    const date = addDays(today(), i);
    return menuFor(plan, date, S.log[date]?.meals || {});
  });
}
function shopTicks() {
  if (!S.shop || S.shop.from !== today()) S.shop = { from: today(), ticked: [] };
  return S.shop.ticked;
}
function shoppingPage(plan) {
  const groups = shoppingList(shopMenus(plan));
  const ticked = shopTicks();
  const total = sum(groups, (g) => g.items.length);
  return html`
  <header class="page-head">
    <a class="back-link" href="#/plan/food">← What to eat</a>
    <h1>Shopping list</h1>
    <p class="lead-sm">For your menus from ${fmtDate(today(), { weekday: 'short', day: 'numeric', month: 'short' })} to ${fmtDate(addDays(today(), SHOP_DAYS - 1), { weekday: 'short', day: 'numeric', month: 'short' })}. Swap meals first and this list follows. Snacks aren’t included.</p>
  </header>
  <div class="row-btns shop-actions">
    <button class="btn btn-primary" data-act="copy-shop">Copy list</button>
    ${ticked.length ? html`<button class="btn btn-ghost" data-act="shop-clear">Untick all</button>` : ''}
    <span class="muted small">${ticked.length} of ${total} ticked</span>
  </div>
  ${groups.map((g) => html`<section class="card shop-group">
    <h2 class="h4">${g.name}</h2>
    <ul class="shop">${g.items.map((it) => html`<li><label class="${ticked.includes(it.id) ? 'got' : ''}">
      <input type="checkbox" data-change="shop" value="${it.id}" ${ticked.includes(it.id) ? raw('checked') : ''}>
      <span class="shop-name">${it.name}</span><span class="shop-amt">${it.amount}</span>
    </label></li>`)}</ul>
  </section>`)}
  <p class="hint">Amounts are rounded up. Things you already have in, just tick off.</p>
  <textarea class="sr" id="shopText" aria-hidden="true" tabindex="-1" readonly>${shopText(groups)}</textarea>`;
}
function shopText(groups) {
  return `Shopping list (${APP})\n` + groups.map((g) => `\n${g.name}\n` + g.items.map((i) => `- ${i.name}: ${i.amount}`).join('\n')).join('\n');
}

function planSnacks(plan) {
  const protein = plan.snacks.filter((s) => s.p >= 10);
  const other = plan.snacks.filter((s) => s.p < 10);
  const list = (arr) => html`<ul class="snack-list">${arr.map((s) => html`<li><button class="snack-item" data-act="snack-add" data-id="${s.id}"><span>${s.name}</span><span class="muted">${s.kcal} kcal${s.p >= 1 ? ` · ${fmt(s.p)} g protein` : ''}</span><span class="plus" aria-hidden="true">+</span></button></li>`)}</ul>`;
  return html`
  <section class="card card-hero">
    <p class="eyebrow">Every day</p>
    <p class="huge">${fmt(plan.snackKcal)}<small> kcal</small></p>
    <p>for snacks and treats, on top of your meals. Spend it however you like.</p>
    ${snackTracker(plan)}
  </section>
  <section class="card">
    <h2 class="h3">How to use it</h2>
    <ul class="rules">
      <li><strong>Make one snack a protein one.</strong> It helps you hit ${fmt(plan.protein)} g and keeps hunger down.</li>
      <li><strong>Didn’t use it?</strong> Carry up to ${fmt(plan.snackKcal)} kcal over to the weekend for a bigger treat. Don’t carry it further.</li>
      <li><strong>Going over now and then is fine.</strong> If it’s most days, your check-ins will show it.</li>
    </ul>
  </section>
  <section class="card"><h2 class="h3">Protein picks</h2><p class="hint">Tap to add to today.</p>${list(protein)}</section>
  <section class="card"><h2 class="h3">Treats and lighter bites</h2>${list(other)}</section>`;
}

function exItem(x) {
  const q = encodeURIComponent(`${x.name.replace(/\(.*?\)/g, '')} exercise form`);
  return html`<li class="ex">
    <div class="ex-head"><span class="ex-name">${x.name}</span><span class="ex-sets">${x.sets > 1 ? `${x.sets} × ` : ''}${x.reps}</span></div>
    <p class="ex-cue">${x.cue}</p>
    ${x.easier || x.harder ? html`<p class="ex-alt">${x.easier ? html`<span>Easier: ${x.easier}</span>` : ''}${x.harder ? html`<span>Harder: ${x.harder}</span>` : ''}</p>` : ''}
    <a class="ex-link" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer">Watch how ↗</a>
  </li>`;
}

const shortName = (n) => n.replace('Full body ', 'Full ').replace('Upper body ', 'Upper ').replace('Legs & abs ', 'Legs ').replace('Abs & conditioning', 'Abs+cardio');
let trainDay = null; // the day picked on the Training tab

function startButton(s, label = 'Start this workout') {
  const a = activeWorkout(S);
  return html`<button class="btn btn-primary btn-block" data-act="wo-start" data-session="${s.id}">${a && a.sessionId === s.id ? 'Resume workout' : label}</button>`;
}

function planTraining(plan) {
  const p = S.profile;
  const w = plan.workouts;
  const kitNames = p.gym ? 'Gym' : p.equipment.length ? EQUIPMENT.filter((e) => p.equipment.includes(e.id)).map((e) => e.name).join(', ') : 'Bodyweight only';
  const todayWd = weekday(today());
  const sel = trainDay || todayWd;
  const s = w.sessions.find((x) => x.day === sel);
  const wk = workoutsThisWeek(S, plan);
  const lastDone = (id) => [...(S.workoutHistory || [])].reverse().find((h) => h.sessionId === id);
  let detail;
  if (s) {
    const last = lastDone(s.id);
    detail = html`<section class="card session">
      <div class="card-row"><h2 class="h3">${s.name}</h2><span class="badge badge-soft">${DAY_NAMES[s.day]}${s.day === todayWd ? ' · today' : ''}</span></div>
      <p class="small muted">${s.main.length + s.core.length + (s.finisher ? 1 : 0)} exercises · about ${p.mins} min${last ? ` · last done ${fmtDate(last.date)}` : ''}</p>
      ${startButton(s)}
      <p class="small muted session-how">Workout mode takes you through it one set at a time, with a rest timer. ${s.circuit ? 'This one is a circuit: one set of each exercise back to back, then go round again.' : 'Rest 60–90 s between sets.'}</p>
      <ol class="ex-list">${s.main.map(exItem)}</ol>
      <h3 class="h4">Abs</h3>
      <ol class="ex-list">${s.core.map(exItem)}</ol>
      ${s.finisher ? html`<h3 class="h4">Finisher</h3><ol class="ex-list">${exItem(s.finisher)}</ol>` : ''}
    </section>`;
  } else {
    detail = html`<section class="card">
      <div class="card-row"><h2 class="h3">Rest day</h2><span class="badge badge-soft">${DAY_NAMES[sel]}${sel === todayWd ? ' · today' : ''}</span></div>
      <p>Walk ${fmt(plan.steps)} steps and stretch for 5 minutes. Rest is when the muscle grows, and walking is the easiest extra fat loss there is.</p>
      <p class="small muted">Missed a workout or feeling fresh? Do one of these instead:</p>
      <div class="stack-btns">${w.sessions.filter((x, i, arr) => arr.findIndex((y) => y.name === x.name) === i).map((x) => html`<button class="btn btn-ghost btn-block" data-act="wo-start" data-session="${x.id}">${x.name}</button>`)}</div>
    </section>`;
  }
  return html`
  <section class="card">
    <p class="small muted">${p.days} days a week · ${p.mins} min · ${kitNames} · <a href="#/edit/training">change</a></p>
    <div class="week">${[1, 2, 3, 4, 5, 6, 7].map((d) => {
      const x = w.sessions.find((y) => y.day === d);
      return html`<button class="wd ${x ? 'train' : ''} ${d === todayWd ? 'today' : ''}" data-act="pick-day" data-day="${d}" aria-pressed="${d === sel ? 'true' : 'false'}"><span>${DAY_NAMES[d]}</span><strong>${x ? shortName(x.name) : 'Walk'}</strong></button>`;
    })}</div>
    <p class="small week-note"><strong>${wk.done} of ${wk.planned}</strong> workouts done this week.</p>
  </section>
  ${detail}
  <section class="card">
    <h2 class="h3">How to progress</h2>
    <ul class="rules">
      <li><strong>Stop 1–2 reps before failure</strong> on every set. The last reps should be hard.</li>
      <li><strong>Hit the top of the rep range on every set?</strong> Next time add a little weight, or switch to the harder version. Workout mode remembers the weight you used.</li>
      <li><strong>Train abs like any muscle.</strong> Add reps, then weight. A thicker six-pack shows at a higher body fat.</li>
      <li><strong>You can’t burn stomach fat with crunches.</strong> Fat comes off everywhere at once; the diet does that part.</li>
    </ul>
  </section>`;
}

function planTimeline(plan) {
  const t = plan.timeline;
  const p = S.profile;
  if (plan.maintenance)
    return html`${whereYouAre(plan)}<section class="card card-hero"><p class="huge">You’re there</p>
      <p>${plan.veryLean ? 'You’re already very lean. We won’t push you lower; the plan keeps you here while you build thicker abs.' : `At around ${fmt(plan.bf, 0)}% you’re at your goal. Maintenance calories and progressive ab training will sharpen things from here.`}</p>
      ${p.goalStage < 5 && !plan.teen ? html`<a class="btn btn-ghost" href="#/edit/goal">Set a bigger goal</a>` : ''}</section>`;
  const units = p.units;
  return html`
  ${whereYouAre(plan)}
  <section class="card card-hero">
    <p class="eyebrow">To ${STAGES[t.goalStage].name.toLowerCase()}</p>
    <p class="huge">${t.weeksLow}–${t.weeksHigh}<small> weeks</small></p>
    <p>Roughly ${fmtDate(t.dateLow, { day: 'numeric', month: 'long' })} to ${fmtDate(t.dateHigh, { day: 'numeric', month: 'long', year: 'numeric' })}, if you stick to the plan most days.</p>
    ${bfBar(plan)}
  </section>
  <section class="card">
    <h2 class="h3">Milestones</h2>
    <ol class="milestones">${t.milestones.map((m) => html`<li>
      <span class="ms-art">${raw(torso(m.stage, 40))}</span>
      <span><strong>${STAGES[m.stage].name}</strong><span class="muted small">${STAGES[m.stage].desc}</span></span>
      <span class="ms-date">${m.weeks < 1 ? 'Any day now' : fmtDate(m.date, { day: 'numeric', month: 'short' })}<small>${m.weeks < 1 ? '' : `week ${Math.max(1, Math.round(m.weeks))}`}</small></span>
    </li>`)}</ol>
  </section>
  <section class="card">
    <h2 class="h3">Where the estimate comes from</h2>
    <ul class="rules">
      <li>About <strong>${fmtWeightDelta(t.fatToLose, units)} of fat</strong> to lose to reach around ${fmt(t.targetBf, 0)}% body fat${S.profile.sex === 'male' ? '' : ''}, which puts you near ${fmtWeight(t.targetW, units)}.</li>
      <li>At <strong>${fmtWeightDelta(t.kgWeek, units)} a week</strong>${t.rateBasis === 'blend' ? ', based on your plan and your real progress so far' : ', which is what your calorie target gives'}. ${t.slow ? 'That’s slow because calories are near maintenance, so most of the change comes from training.' : ''}</li>
      <li>That’s about <strong>${plural(t.checkins, 'check-in')}</strong>. The estimate updates every time you check in.</li>
      ${t.dietBreaks ? html`<li><strong>Take a break every 8–10 weeks:</strong> one week at maintenance (about ${fmt(plan.tdee)} kcal). It makes long diets easier to stick to.</li>` : ''}
      <li>Photo-based body-fat estimates can be a few percent out, so treat the dates as a guide. Your check-ins correct it as you go.</li>
    </ul>
  </section>`;
}

// ---------- check-in ----------
function newCheckinDraft() {
  return { kind: 'checkin', step: 'photos', photos: {}, urls: {}, error: null, weightKg: null, waistCm: null, adherence: 'mostly', selfStage: S.entries.at(-1).selfStage };
}

function checkinPage() {
  const last = S.entries.at(-1);
  if (!draft || draft.kind !== 'checkin') draft = newCheckinDraft();
  if (draft.step === 'analysing') return analysingView('Comparing with last time');
  if (draft.step === 'result') return checkinResult();
  if (last.date === today())
    return html`<header class="page-head"><p class="eyebrow">Check-in</p><h1>${last.kind === 'baseline' ? 'Your first check-in is coming up' : 'You’ve checked in today'}</h1></header>
      <section class="card"><p>Your next check-in is on <strong>${fmtDate(addDays(last.date, CHECKIN_DAYS), { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.</p>
      <div class="row-btns"><a class="btn btn-primary" href="#/progress">See progress</a><button class="btn btn-ghost" data-act="reminders">Add reminders</button></div></section>`;
  const st = checkinStatus(S);
  const units = S.profile.units;
  const imp = units === 'imperial';
  if (draft.step === 'photos')
    return html`
    <header class="page-head"><p class="eyebrow">Check-in · step 1 of 2</p><h1>Same photos as last time</h1></header>
    <div class="stack">
      ${errorBox()}
      ${st.daysUntil > 0 ? html`<div class="alert">Your check-in is due ${fmtDate(st.due)}. Checking in early is fine, but ${CHECKIN_DAYS}-day gaps make the comparison fairer.</div>` : ''}
      <p class="lead-sm">Stand in the same spot as ${fmtDate(last.date, { weekday: 'long' })}. The camera shows a faint ghost of your last photo so you can line up.</p>
      ${photoSlots(last.photos || {})}
      <button class="btn btn-primary btn-block btn-lg" data-act="checkin-next" ${draft.photos.relaxed && draft.photos.tensed ? '' : raw('disabled')}>Next: weigh in</button>
    </div>`;
  const wp = draft.weightKg ? weightParts(draft.weightKg) : { st: '', lb: '' };
  return html`
  <header class="page-head"><p class="eyebrow">Check-in · step 2 of 2</p><h1>Weigh in</h1></header>
  <form data-form="checkin" class="stack" novalidate>
    ${errorBox()}
    <p class="hint">Weigh yourself in the morning after the loo, before eating. Last time: ${fmtWeight(last.weightKg, units)}${last.waistCm ? `, waist ${fmtLen(last.waistCm, units)}` : ''}.</p>
    ${imp
      ? html`<div class="field"><span class="label">Weight</span><span class="pair">
          <span class="unit-input"><input name="st" type="number" inputmode="numeric" aria-label="Stone" value="${wp.st}" required><span>st</span></span>
          <span class="unit-input"><input name="lb" type="number" inputmode="decimal" step="0.1" aria-label="Pounds" value="${wp.lb}"><span>lb</span></span></span></div>`
      : html`<label class="field"><span class="label">Weight</span><span class="unit-input"><input name="weightKg" type="number" inputmode="decimal" step="0.1" value="${draft.weightKg ?? ''}" required><span>kg</span></span></label>`}
    <label class="field"><span class="label">Waist <span class="muted">(around your belly button, optional but the best fat-loss signal)</span></span>
      <span class="unit-input"><input name="waist" type="number" inputmode="decimal" step="0.1" value="${draft.waistCm ? (imp ? Math.round((draft.waistCm / 2.54) * 10) / 10 : draft.waistCm) : ''}"><span>${imp ? 'in' : 'cm'}</span></span></label>
    <fieldset class="field"><legend class="label">How did the food side go since last time?</legend>
      ${seg('adherence', [['nailed', 'Nailed it'], ['mostly', 'Mostly'], ['struggled', 'Struggled']], draft.adherence)}
    </fieldset>
    <fieldset class="field"><legend class="label">Tensed, which looks most like you now?</legend>
      ${choiceCards('selfStage', STAGES.map((s) => ({ v: s.n, t: s.short, art: torso(s.n, 36) })), draft.selfStage, { cls: 'stages compact' })}
    </fieldset>
    <button class="btn btn-primary btn-block btn-lg" type="submit">${AI && S.profile.age >= 18 && !S.demo ? 'Analyse my check-in' : 'See how I’m doing'}</button>
  </form>`;
}

async function finishCheckin() {
  const prev = S.entries.at(-1);
  const p = S.profile;
  draft.step = 'analysing';
  render(true);
  const started = Date.now();
  let ai = null;
  let aiError = null;
  if (AI && p.age >= 18 && !S.demo) {
    try {
      ai = await analysePhotos({ profile: p, weightKg: draft.weightKg, waistCm: draft.waistCm, selfStage: draft.selfStage, photos: draft.photos, previous: prev });
    } catch (e) {
      aiError = e.message;
    }
    if (ai && !ai.photo_ok) {
      draft.step = 'photos';
      draft.error = `We couldn’t use those photos: ${ai.photo_problem || 'please retake them.'}`;
      return render(true);
    }
  }
  const [defR, defT] = await Promise.all([definitionScore(draft.photos.relaxed), definitionScore(draft.photos.tensed)]);
  const id = uid();
  const ids = { relaxed: `${id}-relaxed`, tensed: `${id}-tensed` };
  await putPhoto(ids.relaxed, draft.photos.relaxed);
  await putPhoto(ids.tensed, draft.photos.tensed);
  const entry = {
    id, kind: 'checkin', date: today(), ts: Date.now(),
    weightKg: draft.weightKg, waistCm: draft.waistCm || null, selfStage: draft.selfStage, adherence: draft.adherence,
    photos: ids, ai, aiError, def: { relaxed: defR, tensed: defT },
  };
  Object.assign(entry, estimateBodyFat(p, entry, S.entries[0]));
  const verdict = evaluateCheckin(S, entry);
  entry.verdict = verdict;
  S.calorieAdjust = (S.calorieAdjust || 0) + verdict.calorieDelta;
  S.entries.push(entry);
  S.lockSkip = null;
  save();
  Object.values(draft.urls).forEach((u) => URL.revokeObjectURL(u));
  draft = { kind: 'checkin', step: 'result', entryId: id, photos: {}, urls: {} };
  compare = { pose: 'tensed', from: 0, to: -1 };
  await new Promise((r) => setTimeout(r, Math.max(0, 1200 - (Date.now() - started))));
  render(true);
}

function checkinResult() {
  const idx = S.entries.findIndex((e) => e.id === draft.entryId);
  const e = S.entries[idx];
  const prev = S.entries[idx - 1];
  if (!e || !prev) {
    draft = null;
    return home();
  }
  const v = e.verdict;
  const plan = buildPlan(S);
  const tone = { on_track: 'good', fast: 'warn', slow: 'warn', adherence: 'warn', early: 'neutral' }[v.status] || 'neutral';
  const title = { on_track: 'It’s working', fast: 'Going fast', slow: 'Slower than planned', adherence: 'Not a fair test yet', early: 'Early days' }[v.status];
  return html`
  <header class="page-head"><p class="eyebrow">Check-in ${idx} · ${fmtDate(e.date)}</p><h1>${title}</h1></header>
  <section class="card verdict verdict-${tone}">
    <p class="verdict-head">${v.headline}</p>
    <ul class="rules">${v.lines.map((l) => html`<li>${l}</li>`)}</ul>
    ${v.calorieDelta ? html`<p><strong>New daily target: ${fmt(plan.kcal)} kcal</strong> (${v.calorieDelta > 0 ? '+' : '−'}${fmt(Math.abs(v.calorieDelta))}).</p>` : ''}
  </section>
  ${e.ai && e.ai.photo_ok ? html`<section class="card"><span class="badge badge-soft">Photo analysis</span><p>${e.ai.comparison_notes || e.ai.summary}</p>${e.ai.photo_tips?.length ? html`<p class="small muted">Next time: ${e.ai.photo_tips[0]}</p>` : ''}</section>` : ''}
  <section class="card">
    <h2 class="h3">Then and now · tensed</h2>
    <div class="pair-photos">${photoTile(prev.photos?.tensed, fmtDate(prev.date))}${photoTile(e.photos.tensed, 'Today')}</div>
  </section>
  <section class="card">
    <p>Next check-in: <strong>${fmtDate(addDays(e.date, CHECKIN_DAYS), { weekday: 'long', day: 'numeric', month: 'long' })}</strong>. ${plan.maintenance ? '' : `Estimate now: ${plan.timeline.weeksLow}–${plan.timeline.weeksHigh} more weeks.`}</p>
    <div class="row-btns"><a class="btn btn-primary" href="#/plan" data-act="done-checkin">See my updated plan</a><a class="btn btn-ghost" href="#/progress" data-act="done-checkin">All progress</a></div>
  </section>`;
}

// ---------- progress ----------
let compare = { pose: 'tensed', from: 0, to: -1 };

function progressPage() {
  const E = S.entries;
  const units = S.profile.units;
  const imp = units === 'imperial';
  const from = E[Math.min(compare.from, E.length - 1)];
  const to = E.at(compare.to) || E.at(-1);
  const plan = buildPlan(S);
  const dateOpts = (sel) => E.map((e, i) => html`<option value="${i}" ${i === sel ? raw('selected') : ''}>${fmtDate(e.date)}</option>`);
  const toIdx = compare.to < 0 ? E.length + compare.to : compare.to;
  return html`
  <header class="page-head"><p class="eyebrow">${plural(E.length - 1, 'check-in')} so far</p><h1>Progress</h1></header>
  ${habitsCard(plan)}
  <section class="card">
    <h2 class="h3">Before and after</h2>
    <div class="card-row">${seg('pose', [['relaxed', 'Relaxed'], ['tensed', 'Tensed']], compare.pose)}</div>
    ${E.length > 1
      ? html`<div class="compare" data-compare>
          <img data-photo="${from.photos?.[compare.pose]}" alt="${fmtDate(from.date)}">
          <div class="compare-after"><img data-photo="${to.photos?.[compare.pose]}" alt="${fmtDate(to.date)}"></div>
          <span class="compare-line" aria-hidden="true"></span>
          <input type="range" min="0" max="100" value="50" aria-label="Slide to compare the two photos" data-input="compare">
        </div>
        <div class="compare-pick">
          <label>Before <select data-change="compare-from">${dateOpts(compare.from)}</select></label>
          <label>After <select data-change="compare-to">${dateOpts(toIdx)}</select></label>
        </div>`
      : html`<div class="pair-photos">${photoTile(from.photos?.relaxed, 'Relaxed')}${photoTile(from.photos?.tensed, 'Tensed')}</div>
          <p class="small muted">Your first check-in is on ${fmtDate(addDays(from.date, CHECKIN_DAYS))}. Then you can slide between before and after.</p>`}
  </section>
  <section class="card charts">
    ${raw(lineChart({ label: `Weight (${imp ? 'lb' : 'kg'})`, unit: imp ? 'lb' : 'kg', points: E.map((e) => ({ x: e.date, y: imp ? e.weightKg / KG_PER_LB : e.weightKg })) }))}
    ${E.some((e) => e.waistCm) ? raw(lineChart({ label: `Waist (${imp ? 'in' : 'cm'})`, unit: imp ? 'in' : 'cm', points: E.map((e) => ({ x: e.date, y: e.waistCm ? (imp ? e.waistCm / 2.54 : e.waistCm) : null })) })) : ''}
    ${raw(lineChart({ label: 'Estimated body fat (%)', unit: '%', goal: plan.timeline.targetBf, points: E.map((e) => ({ x: e.date, y: e.bf })) }))}
    ${raw(lineChart({ label: 'Definition score (tensed photo, on-device)', unit: '', decimals: 0, points: E.map((e) => ({ x: e.date, y: e.def?.tensed ?? null })) }))}
    <p class="small muted">The definition score measures contrast across your stomach in the tensed photo. Lighting changes it, so only trust the trend when your photos are taken in the same spot.</p>
  </section>
  ${workoutsCard()}
  <section class="card">
    <h2 class="h3">Check-in history</h2>
    <ol class="history">${E.slice().reverse().map((e, i) => html`<li>
      <div class="hist-photos">${photoTile(e.photos?.relaxed, 'Relaxed', 'thumb')}${photoTile(e.photos?.tensed, 'Tensed', 'thumb')}</div>
      <div>
        <strong>${e.kind === 'baseline' ? 'Start' : `Check-in ${E.length - 1 - i}`}</strong> <span class="muted small">${fmtDate(e.date)}</span>
        <p class="small">${fmtWeight(e.weightKg, units)}${e.waistCm ? ` · waist ${fmtLen(e.waistCm, units)}` : ''} · ~${fmt(e.bf, 0)}% body fat</p>
        ${e.verdict ? html`<p class="small muted">${e.verdict.headline}</p>` : ''}
      </div>
    </li>`)}</ol>
  </section>`;
}

function habitsCard(plan) {
  const st = streaks(S, plan);
  const wk = workoutsThisWeek(S, plan);
  const t = today();
  const start = addDays(t, 1 - weekday(t) - 21); // Monday, three weeks before this one
  const first = S.entries[0].date;
  const cells = Array.from({ length: 28 }, (_, i) => {
    const date = addDays(start, i);
    if (date > t) return { date, cls: 'future', label: `${fmtDate(date)}: still to come` };
    if (date < first) return { date, cls: 'before', label: `${fmtDate(date)}: before you started` };
    const sc = dayScore(S, plan, date);
    return { date, cls: sc == null ? 'none' : `lv${sc}`, label: `${fmtDate(date)}: ${sc == null ? 'nothing logged' : `${sc} of 4 jobs`}`, today: date === t };
  });
  return html`<section class="card">
    <div class="card-row"><h2 class="h3">Daily habits</h2><span class="muted small">last 4 weeks</span></div>
    <div class="stats stats-3">
      ${stat('Streak', st.current, st.current === 1 ? ' day' : ' days', 'good days in a row')}
      ${stat('Best', st.best, st.best === 1 ? ' day' : ' days')}
      ${stat('This week', `${wk.done}/${wk.planned}`, '', 'workouts')}
    </div>
    <div class="heat" role="list" aria-label="Days in the last four weeks">
      ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => html`<span class="heat-h" aria-hidden="true">${d}</span>`)}
      ${cells.map((c) => html`<span role="listitem" class="heat-c ${c.cls} ${c.today ? 'is-today' : ''}" title="${c.label}" aria-label="${c.label}"></span>`)}
    </div>
    <p class="heat-key small muted"><span class="heat-c lv0"></span> none <span class="heat-c lv2"></span> 2 jobs <span class="heat-c lv4"></span> all 4 · a good day is ${GOOD_DAY} or more</p>
  </section>`;
}

function workoutsCard() {
  const H = S.workoutHistory || [];
  if (!H.length) return '';
  const u = S.profile.units === 'imperial' ? 'lb' : 'kg';
  return html`<section class="card">
    <div class="card-row"><h2 class="h3">Workouts</h2><span class="muted small">${plural(H.length, 'workout')} logged</span></div>
    <ol class="wo-history">${H.slice(-6).reverse().map((h) => html`<li>
      <span><strong>${h.name}</strong><span class="muted small">${fmtDate(h.date)} · ${h.mins} min · ${h.sets}/${h.of} sets</span></span>
      ${Object.keys(h.weights || {}).length ? html`<span class="muted small">top ${fmt(Math.max(...Object.values(h.weights)), 1).replace('.0', '')} ${h.unit || u}</span>` : ''}
    </li>`)}</ol>
  </section>`;
}

// ---------- settings ----------
function settingsPage() {
  const p = S.profile;
  const kit = p.gym ? 'Gym' : p.equipment.length ? EQUIPMENT.filter((e) => p.equipment.includes(e.id)).map((e) => e.name).join(', ') : 'Bodyweight only';
  const row = (title, value, href) => html`<a class="set-row" href="${href}"><span><strong>${title}</strong><span class="muted small">${value}</span></span><span aria-hidden="true">›</span></a>`;
  return html`
  <header class="page-head"><p class="eyebrow">${APP}</p><h1>Settings</h1></header>
  <section class="card list-card">
    ${row('About you', `${p.sex === 'male' ? 'Male' : 'Female'}, ${p.age}, ${fmtHeight(p.heightCm, p.units)}, ${ACTIVITY.find((a) => a.v === p.activity)?.t}`, '#/edit/you')}
    ${row('Training', `${kit} · ${p.days} days · ${p.mins} min`, '#/edit/training')}
    ${row('Food', `${DIETS.find((d) => d.v === p.diet)?.t}${p.avoid.length ? `, ${p.avoid.map((a) => AVOID.find((x) => x.v === a)?.t).join(', ')}` : ''} · ${p.meals} meals`, '#/edit/food')}
    ${row('Goal', STAGES[p.goalStage].name, '#/edit/goal')}
  </section>
  <section class="card">
    <h2 class="h3">Workout mode</h2>
    <p class="small">A beep and a buzz when a rest or timer ends. The screen stays on while a workout is open.</p>
    <button class="btn btn-ghost" data-act="toggle-sound" aria-pressed="${S.prefs?.sound === false ? 'false' : 'true'}">Timer sound: ${S.prefs?.sound === false ? 'off' : 'on'}</button>
    <button class="link small settings-tips" data-act="show-intro">Show the “How to use” tips again</button>
  </section>
  <section class="card">
    <h2 class="h3">Reminders</h2>
    <p class="small">Add a repeating reminder every ${CHECKIN_DAYS} days at 8am to your phone’s calendar.</p>
    <button class="btn btn-ghost" data-act="reminders">Add to calendar</button>
  </section>
  <section class="card">
    <h2 class="h3">Your data</h2>
    <p class="small">Everything is saved in this browser on this device${photosPersistent() ? '' : ' (this browser is in a private mode, so photos will be lost when you close it)'}. Back it up now and then, or before switching phones. Adding ${APP} to your home screen makes it less likely your browser clears it.</p>
    <div class="row-btns">
      <button class="btn btn-ghost" data-act="export">Download backup</button>
      <button class="btn btn-ghost" data-act="import">Restore backup</button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
    </div>
    <p class="small muted">Photo analysis: ${AI ? (p.age < 18 ? 'off for under 18s' : 'on (photos are analysed by Claude and not stored on the server)') : 'off (estimates come from your answers and measurements)'}.</p>
    <button class="btn btn-danger" data-act="delete-all">Delete all my data</button>
  </section>
  <section class="card small">
    <p><a href="#/privacy">Privacy and safety</a></p>
  </section>`;
}

function editPage(sub) {
  const forms = { you: formYou, training: formTraining, food: formFood, goal: formGoal };
  if (!forms[sub]) return settingsPage();
  if (!draft || draft.kind !== 'edit' || draft.sub !== sub) draft = { kind: 'edit', sub, editing: true, profile: structuredClone(S.profile), error: null };
  const titles = { you: 'About you', training: 'Training', food: 'Food', goal: 'Your goal' };
  return html`<div class="wizard">
    <div class="wizard-top"><a class="icon-btn" href="#/settings" aria-label="Back to settings">←</a></div>
    <h1>${titles[sub]}</h1>
    ${forms[sub](draft.profile, true)}
  </div>`;
}

function privacyPage() {
  return html`
  <header class="page-head"><p class="eyebrow">${APP}</p><h1>Privacy and safety</h1></header>
  <section class="card prose">
    <h2 class="h3">Your photos</h2>
    <p>Photos and numbers are saved in your browser on this device. There are no accounts and nothing is stored on our server.</p>
    ${AI
      ? html`<p>When you build your plan or check in, your two new photos (and, at a check-in, your previous two) are sent once over an encrypted connection to our server and passed to Claude, an AI model made by Anthropic, to estimate body fat and compare progress. Our server does not save them or log them. Anthropic processes them under its commercial API terms. Under 18s’ photos are never sent.</p>`
      : html`<p>This version of ${APP} does not send photos anywhere. Estimates come from your answers, measurements and your own rating of your photos.</p>`}
    <p>You can download a backup or delete everything from Settings at any time.</p>
    <h2 class="h3">Not medical advice</h2>
    <p>${APP} gives general fitness and nutrition guidance. Check with your GP before a big change in diet or exercise, especially if you have a health condition, take medication, are pregnant or are under 18. Calorie targets never go below a safe minimum, and the plan eases off if you get very lean.</p>
    <h2 class="h3">If it starts to feel like too much</h2>
    <p>If food, weight or how your body looks starts to take over your thoughts, please talk to someone you trust or your GP. In the UK, the eating disorder charity Beat offers free, confidential support: <a href="https://www.beateatingdisorders.org.uk" target="_blank" rel="noopener noreferrer">beateatingdisorders.org.uk</a>.</p>
  </section>
  <p><a class="btn btn-ghost" href="#/">Back</a></p>`;
}

// ---------- actions ----------
const actions = {
  start() {
    draft = newOnboardDraft();
    go('start');
  },
  back() {
    if (draft?.kind === 'onboard' && draft.step > 0) {
      const form = app.querySelector('form[data-form]');
      if (form) captureForm(form, false);
      draft.step -= 1;
      draft.error = null;
      render(true);
    } else go('');
  },
  shoot: (el) => takePhoto(el.dataset.pose),
  upload: (el) => uploadPhoto(el.dataset.pose),
  build: () => finishOnboarding(),
  'checkin-next'() {
    draft.step = 'numbers';
    draft.error = null;
    render(true);
  },
  'skip-lock'() {
    S.lockSkip = today();
    save();
    render();
  },
  'snack-add'(el) {
    const plan = buildPlan(S);
    const s = plan.snacks.find((x) => x.id === el.dataset.id);
    if (!s) return;
    todaysSnacks().push({ name: s.name, kcal: s.kcal });
    save();
    rerenderKeepScroll();
    const left = buildPlan(S).snackKcal - sum(todaysSnacks(), (i) => i.kcal);
    toast(`Added ${s.name.split(' (')[0]} · ${left >= 0 ? `${fmt(left)} kcal left` : `${fmt(-left)} kcal over`}`);
  },
  'snack-remove'(el) {
    todaysSnacks().splice(Number(el.dataset.i), 1);
    save();
    rerenderKeepScroll();
  },
  'more-meals'(el) {
    const list = el.closest('.meal-card')?.querySelector('.meal-list');
    if (list) list.hidden = false;
    el.remove();
  },
  tick(el) {
    const d = dayLog(S);
    const k = el.dataset.k;
    if (k === 'water') d.water = d.water >= WATER_GLASSES ? 0 : WATER_GLASSES;
    else d.ticks[k] = !d.ticks[k];
    save();
    rerenderKeepScroll();
    const plan = buildPlan(S);
    const n = jobsFor(S, plan).items.filter((i) => i.done).length;
    if ((k === 'water' ? d.water : d.ticks[k]) && n === 4) toast('All 4 done. That’s a good day.');
  },
  water(el) {
    const d = dayLog(S);
    const n = Number(el.dataset.n);
    d.water = d.water === n ? n - 1 : n;
    save();
    rerenderKeepScroll();
    if (d.water === WATER_GLASSES) toast('Water done for today.');
  },
  swap(el) {
    const plan = buildPlan(S);
    const d = dayLog(S);
    const menu = menuFor(plan, today(), d.meals);
    const m = menu.find((x) => x.slot === el.dataset.slot);
    if (!m) return;
    const others = new Set(menu.filter((x) => x !== m).map((x) => x.pick.id));
    let next = nextOption(m, m.pick.id);
    for (let k = 0; k < m.options.length && others.has(next.id); k++) next = nextOption(m, next.id);
    d.meals[m.slot] = next.id;
    save();
    rerenderKeepScroll();
    toast(`${SLOT[m.slot]}: ${next.name}`);
  },
  'pick-meal'(el) {
    dayLog(S).meals[el.dataset.slot] = el.dataset.id;
    save();
    rerenderKeepScroll();
    toast(`${SLOT[el.dataset.slot]} swapped`);
  },
  'goto-snacks'() {
    const box = document.getElementById('snacks');
    if (!box) return go('plan/snacks');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => box.querySelector('.chip')?.focus({ preventScroll: true }), 400);
  },
  'pick-day'(el) {
    trainDay = Number(el.dataset.day);
    rerenderKeepScroll();
  },
  'wo-start'(el) {
    startWorkout(S, el.dataset.session);
    save();
    go('workout');
  },
  'intro-ok'() {
    S.seenIntro = true;
    save();
    rerenderKeepScroll();
  },
  'show-intro'() {
    S.seenIntro = false;
    save();
    go('');
  },
  'toggle-sound'() {
    S.prefs = S.prefs || {};
    S.prefs.sound = S.prefs.sound === false;
    save();
    rerenderKeepScroll();
  },
  async 'copy-shop'() {
    const text = document.getElementById('shopText')?.value || '';
    try {
      await navigator.clipboard.writeText(text);
      toast('Shopping list copied. Paste it into your notes.');
    } catch {
      const ta = document.getElementById('shopText');
      if (ta) {
        ta.classList.remove('sr');
        ta.removeAttribute('aria-hidden');
        ta.rows = 12;
        ta.focus();
        ta.select();
      }
      toast('Copy didn’t work here. The list is selected: copy it from the box.');
    }
  },
  'shop-clear'() {
    S.shop = { from: today(), ticked: [] };
    save();
    rerenderKeepScroll();
  },
  async demo() {
    toast('Loading the demo…');
    S = migrate(await makeDemo());
    save();
    draft = null;
    go('');
  },
  async 'end-demo'(el) {
    if (!confirmTap(el, 'Tap again: clears the demo')) return;
    await clearAll();
    S = null;
    draft = newOnboardDraft();
    go('start');
  },
  ...workoutActions,
  'done-checkin'() {
    draft = null;
  },
  reminders() {
    const st = checkinStatus(S);
    const start = st.isDue ? today() : st.due;
    const url = location.href.split('#')[0];
    download(reminderCalendar({ startDate: start, everyDays: CHECKIN_DAYS, appUrl: url, name: APP }), 'core-check-reminders.ics');
    toast('Open the downloaded file to add the reminders.');
  },
  async export() {
    const blob = await exportBackup(S);
    download(blob, `core-check-backup-${today()}.json`);
  },
  import(el) {
    if (S && !confirmTap(el, 'Tap again: this replaces what’s on this device')) return;
    const input = document.getElementById('importFile');
    input.onchange = async () => {
      const f = input.files[0];
      input.value = '';
      if (!f) return;
      try {
        S = migrate(await importBackup(f));
        toast('Backup restored.');
        go('');
      } catch (e) {
        toast(e.message || 'That backup could not be read.');
      }
    };
    input.click();
  },
  async 'delete-all'(el) {
    if (!confirmTap(el, 'Tap again to delete everything')) return;
    await clearAll();
    S = null;
    draft = null;
    toast('Everything has been deleted from this device.');
    go('');
  },
};

// Two-tap confirmation built into the page, since some views block browser dialogs.
function confirmTap(el, prompt) {
  if (el.dataset.armed === '1') return true;
  const original = el.textContent;
  el.dataset.armed = '1';
  el.textContent = prompt;
  el.classList.add('armed');
  setTimeout(() => {
    if (!el.isConnected) return;
    el.dataset.armed = '';
    el.textContent = original;
    el.classList.remove('armed');
  }, 5000);
  return false;
}

function rerenderKeepScroll() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  // done-checkin is on links: clear the draft and let the link navigate.
  if (el.dataset.act === 'done-checkin') return void actions['done-checkin']();
  e.preventDefault();
  actions[el.dataset.act](el, e);
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'snack-custom') {
    const kcal = num(new FormData(form).get('kcal'));
    if (!kcal || kcal < 1 || kcal > 2000) return toast('Enter the calories, e.g. 150.');
    todaysSnacks().push({ name: 'Something else', kcal: Math.round(kcal) });
    save();
    return rerenderKeepScroll();
  }
  if (kind === 'checkin') {
    const fd = new FormData(form);
    const imp = S.profile.units === 'imperial';
    const w = imp ? ((num(fd.get('st')) || 0) * 14 + (num(fd.get('lb')) || 0)) * KG_PER_LB : num(fd.get('weightKg'));
    const waist = num(fd.get('waist'));
    draft.weightKg = w;
    draft.waistCm = waist == null ? null : imp ? waist * 2.54 : waist;
    draft.adherence = fd.get('adherence') || 'mostly';
    if (fd.has('selfStage')) draft.selfStage = Number(fd.get('selfStage'));
    const last = S.entries.at(-1);
    let err = null;
    if (!w || w < 35 || w > 250) err = 'Please enter your weight.';
    else if (draft.waistCm != null && (draft.waistCm < 45 || draft.waistCm > 200)) err = 'Please check your waist measurement.';
    else if (Math.abs(w - last.weightKg) > 5 && !draft.confirmedBig) {
      draft.confirmedBig = true;
      err = `That’s ${fmtWeightDelta(w - last.weightKg, S.profile.units)} away from last time (${fmtWeight(last.weightKg, S.profile.units)}). Check it, then tap the button again if it’s right.`;
    }
    draft.error = err;
    if (err) return render(true);
    return finishCheckin();
  }
  // onboarding or edit forms
  const err = captureForm(form, true);
  if (err) {
    draft.error = err;
    return render(true);
  }
  draft.error = null;
  if (draft.kind === 'edit') {
    S.profile = draft.profile;
    if (kind === 'you' && S.entries.length) {
      // Re-estimate with the new details.
      const first = S.entries[0];
      first.neckCm = S.profile.neckCm;
      first.hipCm = S.profile.hipCm;
      if (S.entries.length === 1 && S.profile.waistCm) first.waistCm = S.profile.waistCm;
      S.entries.forEach((e, i) => Object.assign(e, estimateBodyFat(S.profile, e, i ? S.entries[0] : null)));
    }
    save();
    draft = null;
    toast('Saved. Your plan has been updated.');
    return go('settings');
  }
  draft.step += 1;
  render(true);
});

document.addEventListener('change', (e) => {
  const t = e.target;
  const form = t.closest('form[data-form]');
  if (form && ['units', 'sex'].includes(t.name) && draft) {
    captureForm(form, false);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    return;
  }
  if (form && t.name === 'gym') {
    form.querySelector('.kit').hidden = t.value === 'yes';
    return;
  }
  if (t.name === 'pose' && route().page === 'progress') {
    compare.pose = t.value;
    return rerenderKeepScroll();
  }
  if (t.dataset.change === 'shop') {
    const ticked = shopTicks();
    const i = ticked.indexOf(t.value);
    if (t.checked && i < 0) ticked.push(t.value);
    if (!t.checked && i >= 0) ticked.splice(i, 1);
    save();
    return rerenderKeepScroll();
  }
  if (t.dataset.change === 'compare-from') {
    compare.from = Number(t.value);
    return rerenderKeepScroll();
  }
  if (t.dataset.change === 'compare-to') {
    compare.to = Number(t.value);
    return rerenderKeepScroll();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.input === 'compare') e.target.closest('[data-compare]').style.setProperty('--pos', `${e.target.value}%`);
  if (e.target.dataset.input === 'wo-weight') onWeightInput(e.target);
});

// ---------- start ----------
async function detectAI() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('api/config', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (res.ok) AI = !!(await res.json()).ai;
  } catch {
    AI = false;
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

initWorkout({ state: () => S, plan: () => buildPlan(S), save, render, go });
render();
detectAI().then(() => {
  const page = route().page;
  if (['home', 'start', 'privacy', 'settings'].includes(page) && !(draft && draft.step === 'analysing')) {
    const y = window.scrollY;
    const form = app.querySelector('form[data-form]');
    if (form && draft) captureForm(form, false);
    render();
    window.scrollTo(0, y);
  }
});
