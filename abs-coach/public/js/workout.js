// The guided workout: one set at a time, with rest timers, hold timers and a note of the weight used.

import { html, raw, fmt, plural, fmtDate, num } from './ui.js';
import { workoutSteps, exerciseTimer, isWeighted, today } from './plan.js';
import { dayLog } from './log.js';

let ctx = null; // { state: () => S, save, render, go }
export function initWorkout(c) {
  ctx = c;
}

// Short-lived timer state (not saved): rest between sets, a hold, or the warm-up.
let timer = null; // { kind, endsAt, total }
let ticker = null;
let wakeLock = null;
let audio = null;

export const findSession = (plan, id) => plan.workouts.sessions.find((s) => s.id === id) || null;
export const activeWorkout = (S) => (S.active && !S.active.finished ? S.active : null);

export function startWorkout(S, sessionId) {
  const a = S.active;
  if (a && !a.finished && a.sessionId === sessionId) return; // resume
  S.active = { sessionId, date: today(), startedAt: Date.now(), step: 0, done: [], weights: {} };
  timer = null;
}

const mmss = (secs) => {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const PART = { main: '', core: 'Abs', cardio: 'Conditioning', finisher: 'Finisher' };
const WARMUP = [
  '2 minutes of brisk walking, marching on the spot or skipping',
  '10 bodyweight squats',
  '10 arm circles each way',
  '10 hip hinges: hands on hips, push your bum back, stand tall',
];

function unit(S) {
  return S.profile.units === 'imperial' ? 'lb' : 'kg';
}

// ---------- views ----------
export function workoutPage(S, plan) {
  const a = S.active;
  const session = a && findSession(plan, a.sessionId);
  if (!a || !session) return null;
  const steps = workoutSteps(session);
  if (a.finished) return summaryView(S, a, session, steps);
  const i = Math.min(a.step, steps.length - 1);
  const st = steps[i];
  const setSteps = steps.length - 1;
  const doneSets = a.done.filter((n) => n > 0).length;
  const pct = (doneSets / setSteps) * 100;
  const top = html`<div class="player-top">
      <button class="icon-btn" data-act="wo-leave" aria-label="Leave workout">✕</button>
      <div class="player-progress" role="progressbar" aria-label="Sets done" aria-valuemin="0" aria-valuemax="${setSteps}" aria-valuenow="${doneSets}"><span style="width:${pct.toFixed(1)}%"></span></div>
      <span class="player-clock" data-elapsed>${mmss((Date.now() - a.startedAt) / 1000)}</span>
    </div>`;
  if (a.leaving) return html`<div class="player">${top}${leaveView(a, doneSets)}</div>`;
  const body = timer?.kind === 'rest' ? restView(steps, i) : st.kind === 'warmup' ? warmupView(steps) : setView(S, a, steps, i);
  return html`<div class="player">
    ${top}
    <p class="eyebrow player-session">${session.name}</p>
    ${body}
    ${exerciseList(a, steps, i)}
  </div>`;
}

function timerBlock(kind, secs, label) {
  const on = timer && timer.kind === kind;
  const left = on ? (timer.endsAt - Date.now()) / 1000 : secs;
  return html`<div class="timer ${on ? 'on' : ''}">
    <span class="timer-time" data-timer="${kind}">${mmss(left)}</span>
    ${on
      ? html`<button class="btn btn-ghost btn-sm" data-act="wo-timer-stop">Stop</button>`
      : html`<button class="btn btn-ghost btn-sm" data-act="wo-timer" data-kind="${kind}" data-secs="${secs}">Start ${label} timer</button>`}
  </div>`;
}

function warmupView(steps) {
  const first = steps[1]?.ex;
  return html`<h1>Warm up</h1>
    <p class="lead-sm">Five easy minutes so your joints are ready. Don’t skip it.</p>
    <ul class="warm">${WARMUP.map((w) => html`<li>${w}</li>`)}${first ? html`<li>1 light set of ${first.name.toLowerCase()}</li>` : ''}</ul>
    ${timerBlock('warmup', 300, '5 min')}
    <button class="btn btn-primary btn-lg btn-block" data-act="wo-done">Warm-up done</button>`;
}

function setView(S, a, steps, i) {
  const st = steps[i];
  const x = st.ex;
  const last = i === steps.length - 1;
  const t = exerciseTimer(x);
  const u = unit(S);
  const prev = S.lifts?.[x.id];
  const next = steps[i + 1];
  const q = encodeURIComponent(`${x.name.replace(/\(.*?\)/g, '')} exercise form`);
  const doneLabel = last ? 'Done · finish workout' : st.rest ? `Done · rest ${st.rest} s` : next && next.exIndex !== st.exIndex ? 'Done · next exercise' : 'Done · next set';
  return html`
    <p class="player-count">Exercise ${st.exIndex + 1} of ${st.exCount}${PART[x.part] ? ` · ${PART[x.part]}` : ''}${st.rounds ? ` · round ${st.round} of ${st.rounds}` : ''}</p>
    <h1>${x.name}</h1>
    <div class="set-row-dots" aria-label="Set ${st.set} of ${st.of}">
      ${Array.from({ length: st.of }, (_, k) => html`<span class="${k + 1 < st.set || (k + 1 === st.set && a.done.includes(i)) ? 'done' : k + 1 === st.set ? 'now' : ''}"></span>`)}
      <strong>Set ${st.set} of ${st.of}</strong>
    </div>
    <div class="target"><span class="muted small">Target</span><strong>${x.reps}</strong></div>
    <p class="cue">${x.cue}</p>
    ${x.easier || x.harder ? html`<p class="ex-alt">${x.easier ? html`<span>Easier: ${x.easier}</span>` : ''}${x.harder ? html`<span>Harder: ${x.harder}</span>` : ''}</p>` : ''}
    ${t ? html`${timerBlock('hold', t.secs, t.label)}${t.perSide ? html`<p class="hint">Do one side, then start it again for the other.</p>` : ''}` : ''}
    ${isWeighted(x)
      ? html`<label class="weight-row"><span class="label">Weight used <span class="muted">(optional)</span></span>
          <span class="unit-input"><input type="number" inputmode="decimal" step="0.5" min="0" data-input="wo-weight" data-ex="${x.id}" value="${a.weights[x.id] ?? ''}" placeholder="${prev ? prev.v : ''}"><span>${u}</span></span>
          <span class="hint">${prev ? `Last time: ${fmt(prev.v, prev.v % 1 ? 1 : 0)} ${prev.unit} on ${fmtDate(prev.date, { day: 'numeric', month: 'short' })}. ` : ''}Reached the top of the range on every set? Go a little heavier next time.</span></label>`
      : ''}
    <button class="btn btn-primary btn-lg btn-block" data-act="wo-done">${doneLabel}</button>
    <div class="player-nav">
      <button class="link small" data-act="wo-prev" ${i === 0 ? raw('disabled') : ''}>← Back</button>
      <a class="small" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener noreferrer">Watch how ↗</a>
      <button class="link small" data-act="wo-skip">${last ? 'Skip' : 'Skip →'}</button>
    </div>
    ${next ? html`<p class="up-next">Up next: <strong>${next.ex.name}</strong>${next.ex.id === x.id ? ` · set ${next.set}` : ''}</p>` : ''}`;
}

function restView(steps, i) {
  const st = steps[i];
  const left = (timer.endsAt - Date.now()) / 1000;
  return html`<section class="rest-panel" aria-live="polite">
    <p class="eyebrow">Rest</p>
    <div class="ring" data-ring style="--p:${Math.max(0, Math.min(1, left / timer.total)).toFixed(3)}"><span data-timer="rest">${mmss(left)}</span></div>
    <p>Up next: <strong>${st.kind === 'warmup' ? 'Warm-up' : st.ex.name}</strong>${st.kind === 'set' ? html`<br><span class="muted small">Set ${st.set} of ${st.of} · ${st.ex.reps}</span>` : ''}</p>
    <div class="row-btns center">
      <button class="btn btn-ghost" data-act="wo-rest-add">+15 s</button>
      <button class="btn btn-primary" data-act="wo-rest-skip">Skip rest</button>
    </div>
    <p class="hint">Breathe slowly. Sip some water.</p>
  </section>`;
}

function exerciseList(a, steps, i) {
  const groups = [];
  steps.forEach((st, n) => {
    if (st.kind !== 'set') return;
    let g = groups[st.exIndex];
    if (!g) g = groups[st.exIndex] = { ex: st.ex, first: n, total: 0, done: 0, current: false };
    g.total += 1;
    if (a.done.includes(n)) g.done += 1;
    if (n === i) g.current = true;
  });
  return html`<details class="player-list">
    <summary>All exercises</summary>
    <ol>${groups.map((g) => html`<li class="${g.done === g.total ? 'done' : ''} ${g.current ? 'current' : ''}">
      <button data-act="wo-jump" data-step="${g.first}"><span>${g.ex.name}</span><span class="muted small">${g.done}/${g.total}</span></button>
    </li>`)}</ol>
  </details>`;
}

function leaveView(a, doneSets) {
  return html`<section class="card leave">
    <h1>Leave this workout?</h1>
    ${doneSets
      ? html`<p>You’ve done ${plural(doneSets, 'set')}. Save them and it counts as today’s workout.</p>
        <div class="stack-btns">
          <button class="btn btn-primary btn-block" data-act="wo-finish">Save what I’ve done</button>
          <button class="btn btn-ghost btn-block" data-act="wo-stay">Keep going</button>
          <button class="btn btn-danger btn-block" data-act="wo-discard">Discard this workout</button>
        </div>`
      : html`<p>You haven’t ticked off any sets yet.</p>
        <div class="stack-btns">
          <button class="btn btn-primary btn-block" data-act="wo-stay">Keep going</button>
          <button class="btn btn-ghost btn-block" data-act="wo-discard">Leave</button>
        </div>`}
  </section>`;
}

function summaryView(S, a, session, steps) {
  const doneSets = a.done.filter((n) => n > 0).length;
  const mins = Math.max(1, Math.round((a.endedAt - a.startedAt) / 60000));
  const u = unit(S);
  const lifts = Object.entries(a.weights).filter(([, v]) => v != null);
  const names = Object.fromEntries(steps.filter((s) => s.ex).map((s) => [s.ex.id, s.ex.name]));
  return html`<div class="player">
    <section class="done-hero">
      <div class="done-badge" aria-hidden="true">✓</div>
      <p class="eyebrow">${session.name}</p>
      <h1>Workout done</h1>
      <div class="stats stats-3">
        <div class="stat"><span class="stat-label">Time</span><span class="stat-value">${mins}<small> min</small></span></div>
        <div class="stat"><span class="stat-label">Sets</span><span class="stat-value">${doneSets}<small> of ${steps.length - 1}</small></span></div>
        <div class="stat"><span class="stat-label">Abs work</span><span class="stat-value">${steps.filter((s, n) => s.ex?.part === 'core' && a.done.includes(n)).length}<small> sets</small></span></div>
      </div>
      ${lifts.length ? html`<ul class="lifts">${lifts.map(([id, v]) => html`<li><span>${names[id] || id}</span><strong>${fmt(v, v % 1 ? 1 : 0)} ${u}</strong></li>`)}</ul>` : ''}
      <p class="muted">Ticked off on today’s list. Now eat a proper meal with protein in it.</p>
      <button class="btn btn-primary btn-lg btn-block" data-act="wo-close">Back to today</button>
    </section>
  </div>`;
}

// ---------- behaviour ----------
function steps() {
  const S = ctx.state();
  const session = findSession(ctx.plan(), S.active.sessionId);
  return session ? workoutSteps(session) : [];
}

function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}
function beep(times = 2) {
  try {
    if (audio && ctx.state().prefs?.sound !== false) {
      for (let k = 0; k < times; k++) {
        const t0 = audio.currentTime + k * 0.22;
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = k === times - 1 ? 1046 : 784;
        o.connect(g);
        g.connect(audio.destination);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
        o.start(t0);
        o.stop(t0 + 0.2);
      }
    }
  } catch {}
  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {}
}

function startTimer(kind, secs) {
  timer = { kind, endsAt: Date.now() + secs * 1000, total: secs };
}

function onTick() {
  const S = ctx.state();
  const a = S?.active;
  if (!a || a.finished) return;
  const el = document.querySelector('[data-elapsed]');
  if (el) el.textContent = mmss((Date.now() - a.startedAt) / 1000);
  if (!timer) return;
  const left = (timer.endsAt - Date.now()) / 1000;
  document.querySelectorAll(`[data-timer="${timer.kind}"]`).forEach((t) => (t.textContent = mmss(left)));
  const ring = document.querySelector('[data-ring]');
  if (ring) ring.style.setProperty('--p', Math.max(0, Math.min(1, left / timer.total)).toFixed(3));
  if (left <= 0) {
    timer = null;
    beep(3);
    ctx.render();
  }
}

// Called on every render: run the clock and keep the screen on only while the player is showing.
export function workoutUi(onPage) {
  if (onPage) {
    if (!ticker) ticker = setInterval(onTick, 250);
    keepAwake();
  } else {
    if (ticker) clearInterval(ticker);
    ticker = null;
    timer = null;
    releaseAwake();
  }
}

async function keepAwake() {
  if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => (wakeLock = null));
  } catch {
    wakeLock = null;
  }
}
function releaseAwake() {
  try {
    wakeLock?.release();
  } catch {}
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ticker) keepAwake();
});

function finish() {
  const S = ctx.state();
  const a = S.active;
  const all = steps();
  a.finished = true;
  a.leaving = false;
  a.endedAt = Date.now();
  timer = null;
  const doneSets = a.done.filter((n) => n > 0).length;
  if (doneSets) {
    const session = findSession(ctx.plan(), a.sessionId);
    const u = unit(S);
    S.workoutHistory.push({
      date: a.date,
      sessionId: a.sessionId,
      name: session?.name || 'Workout',
      mins: Math.max(1, Math.round((a.endedAt - a.startedAt) / 60000)),
      sets: doneSets,
      of: all.length - 1,
      weights: { ...a.weights },
      unit: u,
    });
    for (const [id, v] of Object.entries(a.weights)) if (v != null) S.lifts[id] = { v, unit: u, date: a.date };
    dayLog(S, a.date).ticks.workout = true;
  }
}

function readWeight() {
  const input = document.querySelector('[data-input="wo-weight"]');
  if (!input) return;
  const v = num(input.value);
  const a = ctx.state().active;
  if (v != null && v > 0 && v < 1000) a.weights[input.dataset.ex] = v;
}

export const workoutActions = {
  'wo-done'() {
    unlockAudio();
    readWeight();
    const S = ctx.state();
    const a = S.active;
    const all = steps();
    const i = Math.min(a.step, all.length - 1);
    if (!a.done.includes(i)) a.done.push(i);
    if (i >= all.length - 1) finish();
    else {
      a.step = i + 1;
      if (all[i].rest) startTimer('rest', all[i].rest);
      else timer = null;
    }
    ctx.save();
    ctx.render(true);
  },
  'wo-prev'() {
    const a = ctx.state().active;
    readWeight();
    a.step = Math.max(0, a.step - 1);
    timer = null;
    ctx.save();
    ctx.render(true);
  },
  'wo-skip'() {
    const a = ctx.state().active;
    readWeight();
    const all = steps();
    timer = null;
    if (a.step >= all.length - 1) a.leaving = true;
    else a.step += 1;
    ctx.save();
    ctx.render(true);
  },
  'wo-jump'(el) {
    const a = ctx.state().active;
    readWeight();
    a.step = Number(el.dataset.step);
    timer = null;
    ctx.save();
    ctx.render(true);
  },
  'wo-timer'(el) {
    unlockAudio();
    startTimer(el.dataset.kind, Number(el.dataset.secs));
    ctx.render();
  },
  'wo-timer-stop'() {
    timer = null;
    ctx.render();
  },
  'wo-rest-add'() {
    if (timer) {
      timer.endsAt += 15000;
      timer.total += 15;
    }
    onTick();
  },
  'wo-rest-skip'() {
    timer = null;
    ctx.render();
  },
  'wo-leave'() {
    readWeight();
    ctx.state().active.leaving = true;
    timer = null;
    ctx.save();
    ctx.render(true);
  },
  'wo-stay'() {
    ctx.state().active.leaving = false;
    ctx.save();
    ctx.render(true);
  },
  'wo-finish'() {
    finish();
    ctx.save();
    ctx.render(true);
  },
  'wo-discard'() {
    const S = ctx.state();
    S.active = null;
    timer = null;
    ctx.save();
    ctx.go('');
  },
  'wo-close'() {
    const S = ctx.state();
    S.active = null;
    ctx.save();
    ctx.go('');
  },
  'wo-sound'() {
    const S = ctx.state();
    S.prefs = S.prefs || {};
    S.prefs.sound = S.prefs.sound === false;
    ctx.save();
    ctx.render();
  },
};

export function onWeightInput(el) {
  const a = ctx.state().active;
  if (!a) return;
  const v = num(el.value);
  if (v == null) delete a.weights[el.dataset.ex];
  else if (v > 0 && v < 1000) a.weights[el.dataset.ex] = v;
  ctx.save();
}
