// A tiny, dependency-free SVG line chart for weight / waist / body-fat trends.
import { parseDate } from './plan.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function lineChart({ points, unit = '', goal = null, decimals = 1, label }) {
  const pts = points.filter((p) => p.y != null && Number.isFinite(p.y));
  if (pts.length < 2) return `<p class="muted small">${esc(label)}: the chart appears after your first check-in.</p>`;
  const W = 600, H = 200, padL = 44, padR = 14, padT = 14, padB = 28;
  const xs = pts.map((p) => parseDate(p.x).getTime());
  let ys = pts.map((p) => p.y);
  if (goal != null) ys = ys.concat(goal);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const pad = Math.max((hi - lo) * 0.15, 0.5);
  lo -= pad;
  hi += pad;
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const sx = (t) => padL + ((t - x0) / Math.max(1, x1 - x0)) * (W - padL - padR);
  const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(xs[i]).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' ');
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const fmtDay = (s) => parseDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const last = pts.at(-1);
  return `<figure class="chart">
    <figcaption>${esc(label)}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}: from ${pts[0].y.toFixed(decimals)} to ${last.y.toFixed(decimals)} ${esc(unit)}">
      ${ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${sy(t)}" y2="${sy(t)}"/><text class="tick" x="${padL - 8}" y="${sy(t) + 4}" text-anchor="end">${t.toFixed(decimals)}</text>`).join('')}
      ${goal != null ? `<line class="goal" x1="${padL}" x2="${W - padR}" y1="${sy(goal)}" y2="${sy(goal)}"/><text class="tick goal-t" x="${W - padR}" y="${sy(goal) - 6}" text-anchor="end">goal</text>` : ''}
      <path class="line" d="${d}"/>
      ${pts.map((p, i) => `<circle class="dot${i === pts.length - 1 ? ' last' : ''}" cx="${sx(xs[i])}" cy="${sy(p.y)}" r="${i === pts.length - 1 ? 5 : 3.5}"><title>${fmtDay(p.x)}: ${p.y.toFixed(decimals)} ${esc(unit)}</title></circle>`).join('')}
      <text class="tick" x="${padL}" y="${H - 8}">${fmtDay(pts[0].x)}</text>
      <text class="tick" x="${W - padR}" y="${H - 8}" text-anchor="end">${fmtDay(last.x)}</text>
    </svg>
  </figure>`;
}
