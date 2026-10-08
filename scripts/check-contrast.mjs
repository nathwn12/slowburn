/**
 * Contrast + token-completeness check over the 4 theme JSONs.
 *
 * Usage: `node scripts/check-contrast.mjs` (exit 0 = all green).
 *
 * 1. Every theme must parse and carry the full token set, including every
 *    variable name that existed before the design-token wave (backward
 *    compatibility for existing call sites).
 * 2. WCAG contrast:
 *    - Body-text pairs (AA, >= 4.5): --text / --bg, --text-dim / --bg,
 *      --accent-text / --surface.
 *    - Non-text / UI pairs (AA non-text 1.4.11 + focus 2.4.11, >= 3.0):
 *      --accent / --surface (fills, progress), --focus / --bg (ring).
 *
 * Rationale: the raw brand accent (#ff1493) cannot hit 4.5:1 as body text
 * on any surface, so per-theme --accent-text tokens carry accent-colored
 * *text* at 4.5:1 while --accent stays the brand fill/UI color at 3:1.
 * --text-faint is intentionally unchecked: it is decorative/metadata-only.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'themes',
);

// Every variable name that predates the token wave. Removing or renaming any
// of these breaks existing element/route/component call sites.
const LEGACY_KEYS = [
  '--color-scheme',
  '--text',
  '--text-muted',
  '--background',
  '--faded-bg',
  '--border-color',
  '--border-color-softer',
  '--header-color',
  '--header-bg',
  '--header-bg-softer',
  '--footer-bg',
  '--footer-nav-bg-color-active',
  '--active-item-bg',
  '--active-item-color',
  '--tracks-bg-even',
  '--tracks-bg-odd',
  '--tracks-header-bg',
  '--tracks-header-color',
  '--cover-bg',
  '--success-color',
  '--info-color',
  '--warning-color',
  '--danger-color',
  '--toasts-bg',
  '--progress-bg',
  '--sidebar-bg',
  '--sidebar-item-active-bg',
  '--search-bg',
  '--slider-bg',
  '--queue-bg',
  '--queue-header-bg',
  '--checkbox-bg',
  '--input-bg',
  '--input-color',
  '--button-bg',
  '--button-border',
  '--button-color',
  '--bg',
  '--surface',
  '--surface-hover',
  '--surface-2',
  '--surface-3',
  '--border',
  '--border-soft',
  '--text-dim',
  '--text-faint',
  '--text-bright',
  '--accent',
  '--accent-hover',
  '--accent-soft',
  '--deep-pink',
  '--pink-soft',
  '--pink-line',
  '--info',
  '--info-soft',
  '--info-line',
  '--track',
  '--danger',
  '--success',
  '--focus',
  '--focus-color',
  '--pink-text',
  '--pink-text-soft',
  '--on-accent-ink',
  '--surface-inset',
  '--control-border',
  '--info-text',
  '--form-control-color',
  '--radius',
  '--radius-sm',
  '--row',
  '--mono-font',
];

// Tokens added by the design-token wave.
const NEW_KEYS = [
  '--radius-lg',
  '--space-1',
  '--space-2',
  '--space-3',
  '--space-4',
  '--space-5',
  '--space-6',
  '--row-compact',
  '--font-ui',
  '--text-xs',
  '--text-sm',
  '--text-md',
  '--text-lg',
  '--weight-normal',
  '--weight-medium',
  '--weight-semibold',
  '--surface-elevated',
  '--shadow-elevated',
  '--glow-accent',
  '--glow-hover',
  '--glow-focus',
  '--accent-text',
  '--warn',
  '--warn-soft',
  '--warn-line',
  '--warn-text',
  '--success-soft',
  '--success-line',
  '--success-text',
  '--danger-soft',
  '--danger-line',
  '--danger-text',
];

// [foreground, background, minimum ratio, label]
const BODY_PAIRS = [
  ['--text', '--bg', 4.5, 'body text on bg'],
  ['--text-dim', '--bg', 4.5, 'dim text on bg'],
  ['--accent-text', '--surface', 4.5, 'accent text on surface'],
];

const UI_PAIRS = [
  ['--accent', '--surface', 3.0, 'accent fill on surface'],
  ['--focus', '--bg', 3.0, 'focus ring vs bg'],
];

function parseColor(raw) {
  const v = raw.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  m = v.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (a < 1) throw new Error(`non-opaque color unsupported: ${raw}`);
    const h = Number(m[1]) / 360;
    const s = Number(m[2]) / 100;
    const l = Number(m[3]) / 100;
    const f = (n) => {
      const k = (n + h * 12) % 12;
      const c = l - s * Math.min(l, 1 - l);
      const t = c + (l - c) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(t * 255);
    };
    return [f(0), f(8), f(4)];
  }
  m = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4]);
    if (a < 1) throw new Error(`non-opaque color unsupported: ${raw}`);
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  throw new Error(`unparsable color: ${raw}`);
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

let failures = 0;
let checks = 0;
const fail = (msg) => {
  failures += 1;
  console.log(`  FAIL ${msg}`);
};

for (const file of readdirSync(root).filter((f) => f.endsWith('.json'))) {
  const theme = JSON.parse(readFileSync(join(root, file), 'utf8'));
  const vars = theme.variables;
  console.log(`${theme._id}:`);
  for (const key of [...LEGACY_KEYS, ...NEW_KEYS]) {
    checks += 1;
    if (typeof vars[key] !== 'string' || vars[key].trim() === '') {
      fail(`missing/empty token ${key}`);
    }
  }
  for (const [fgKey, bgKey, min, label] of [...BODY_PAIRS, ...UI_PAIRS]) {
    checks += 1;
    const r = ratio(parseColor(vars[fgKey]), parseColor(vars[bgKey]));
    const ok = r >= min;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'} ${label} (${fgKey} on ${bgKey}): ${r.toFixed(2)}:1 (needs ${min}:1)`,
    );
  }
}

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.log('CONTRAST CHECK: FAIL');
  process.exit(1);
}
console.log('CONTRAST CHECK: PASS');
