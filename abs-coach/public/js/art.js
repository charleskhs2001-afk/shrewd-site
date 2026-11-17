// Small inline SVG drawings: the logo and the ab-stage torsos.

export function logo(size = 28) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" class="logo-bg"/>
    <g class="logo-abs">
      <rect x="9" y="6.5" width="6.3" height="5.4" rx="2"/><rect x="16.7" y="6.5" width="6.3" height="5.4" rx="2"/>
      <rect x="9" y="13.3" width="6.3" height="5.4" rx="2"/><rect x="16.7" y="13.3" width="6.3" height="5.4" rx="2"/>
      <rect x="9" y="20.1" width="6.3" height="5.4" rx="2"/><rect x="16.7" y="20.1" width="6.3" height="5.4" rx="2"/>
    </g>
  </svg>`;
}

const ROWS = [
  [0, 0, 0, 0, 0],
  [0.2, 0, 0, 0.25, 0],
  [0.55, 0.18, 0, 0.4, 0],
  [0.8, 0.5, 0.15, 0.55, 0.15],
  [0.92, 0.82, 0.5, 0.7, 0.45],
  [1, 1, 0.8, 0.85, 0.85],
];
const WAIST = [21, 25, 28, 30, 31.5, 32.5];

// A simple torso showing how much of the six-pack is visible at each stage.
export function torso(stage, size = 72) {
  const [top, mid, low, line, v] = ROWS[stage];
  const wl = WAIST[stage];
  const wr = 120 - wl;
  const body = `M12 2 C 15 30, ${wl - 3} 62, ${wl} 96 C ${wl + 0.5} 114, ${wl - 5} 133, ${wl - 8} 150 L ${wr + 8} 150 C ${wr + 5} 133, ${wr - 0.5} 114, ${wr} 96 C ${wr + 3} 62, 105 30, 108 2 Z`;
  const ab = (x, y, o) => (o ? `<rect x="${x}" y="${y}" width="15" height="16" rx="5" style="opacity:${o}"/>` : '');
  return `<svg class="torso" width="${size}" height="${(size * 150) / 120}" viewBox="0 0 120 150" aria-hidden="true">
    <path class="t-body" d="${body}"/>
    <path class="t-chest" d="M22 22 Q 40 31 57 23 M63 23 Q 80 31 98 22"/>
    <g class="t-abs">
      ${ab(44, 34, top)}${ab(61, 34, top)}
      ${ab(44, 54, mid)}${ab(61, 54, mid)}
      ${ab(45, 74, low)}${ab(60, 74, low)}
    </g>
    ${line ? `<line class="t-line" x1="60" y1="30" x2="60" y2="96" style="opacity:${line}"/>` : ''}
    ${v ? `<path class="t-line" d="M38 98 Q 48 116 55 132 M82 98 Q 72 116 65 132" style="opacity:${v}"/>` : ''}
    ${stage >= 5 ? '<path class="t-line" d="M33 44 l 6 4 M33 56 l 6 4 M33 68 l 6 4 M87 44 l -6 4 M87 56 l -6 4 M87 68 l -6 4" style="opacity:.6"/>' : ''}
    <circle class="t-navel" cx="60" cy="104" r="2.6"/>
  </svg>`;
}
