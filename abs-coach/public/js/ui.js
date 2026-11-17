// DOM and formatting helpers shared by every screen.
import { parseDate } from './plan.js';

// ---------- safe HTML ----------
class Raw {
  constructor(s) {
    this.s = s;
  }
}
export const raw = (s) => new Raw(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const part = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : v === false || v == null ? '' : esc(v));
// html`...` escapes every value unless it was wrapped in raw() or is itself html`...`.
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => (out += part(v) + strings[i + 1]));
  return new Raw(out);
}
export const str = (h) => (h instanceof Raw ? h.s : String(h));

// ---------- numbers & units ----------
export const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
export const fmt = (n, d = 0) => (n == null ? '–' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }));

export const KG_PER_LB = 0.45359237;
export function fmtWeight(kg, units) {
  if (kg == null) return '–';
  if (units === 'imperial') {
    const lb = kg / KG_PER_LB;
    let st = Math.floor(lb / 14);
    let rem = Math.round(lb - st * 14);
    if (rem === 14) { st += 1; rem = 0; }
    return `${st} st ${rem} lb`;
  }
  return `${fmt(kg, 1)} kg`;
}
export function fmtWeightDelta(kg, units) {
  const a = Math.abs(kg);
  return units === 'imperial' ? `${fmt(a / KG_PER_LB, 1)} lb` : `${fmt(a, 1)} kg`;
}
export function fmtLen(cm, units) {
  if (cm == null) return '–';
  return units === 'imperial' ? `${fmt(cm / 2.54, 1)} in` : `${fmt(cm, 1)} cm`;
}
export function fmtHeight(cm, units) {
  if (units === 'imperial') {
    const inches = Math.round(cm / 2.54);
    return `${Math.floor(inches / 12)}′${inches % 12}″`;
  }
  return `${Math.round(cm)} cm`;
}
export function weightParts(kg) {
  const lb = kg / KG_PER_LB;
  const st = Math.floor(lb / 14);
  return { st, lb: Math.round((lb - st * 14) * 10) / 10 };
}
export function heightParts(cm) {
  const inches = cm / 2.54;
  return { ft: Math.floor(inches / 12), inch: Math.round(inches - Math.floor(inches / 12) * 12) };
}

export const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => parseDate(s).toLocaleDateString('en-GB', opts);
export const fmtMonth = (s) => parseDate(s).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- feedback ----------
let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// A calendar file with a repeating reminder every 5 days at 8am.
export function reminderCalendar({ startDate, everyDays, appUrl, name }) {
  const d = startDate.replaceAll('-', '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${name}//Check-ins//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid()}@core-check`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${d}T080000`,
    'DURATION:PT10M',
    `RRULE:FREQ=DAILY;INTERVAL=${everyDays};COUNT=60`,
    `SUMMARY:${name}: 5-day check-in (2 photos)`,
    `DESCRIPTION:Same spot\\, same light\\, before breakfast. Relaxed photo + tensed photo\\, then weigh in. ${appUrl}`,
    `URL:${appUrl}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${name} check-in`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar' });
}
