/**
 * Burn-strip stepper geometry and treatment.
 *
 * The owner reports "the minus and plus buttons aren't even aligned", and asks
 * whether to flatten them. The steppers are kept (0.01x / 1% precision control)
 * but restyled flat to match `burnReset`.
 *
 * Measured cause (en, 720x480): the `−`/`+` buttons carried the browser's
 * default `padding: 1px 6px` because `styles.step` never reset it. StyleX uses
 * `box-sizing: border-box`, so the 18px button had only 4px of content, and
 * `placeItems: center` could not centre the 12px glyph — it rendered 4px right
 * of the button centre (cx 90 vs 86), while the padding-0 `burnReset` glyph
 * centred exactly (699 vs 699). The 1px border also made them visually heavier
 * than the flat reset. This test pins the flat, centred, >=18x18 result.
 *
 * The `burnId` `minWidth: 58px` hypothesis was refuted by measurement: both
 * rows' label columns measure exactly 58px on this machine ("REVERB" is
 * 57.875px incl. dot + gap), so cross-row x-aligns. The narrow test keeps that
 * invariant honest.
 *
 * Silent by construction: `player` is mocked, so no audio graph is ever built;
 * the browser is launched with `--mute-audio` (vitest.config.ts) as a second
 * layer. The app itself is never launched.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';
import { cleanup, render } from 'vitest-browser-react';

import { messages } from '../../translations/en.po';

import EffectControls from '../EffectControls';

/** 1px rounding tolerance for sub-pixel layout. */
const TOL = 1;
/**
 * Wider tolerance for the two-column layout: the `1fr 1px 1fr` grid splits the
 * container on a half-pixel, so the two Burn rows can differ by ~1px purely
 * from column placement (measured 66 vs 65). That is layout, not a per-row
 * label width, which is what this guard actually protects.
 */
const WIDE_TOL = 2;

type Rect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

const harness = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    config: {
      enabled: true,
      slowEnabled: true,
      slow: 1,
      reverbEnabled: true,
      reverbIntensity: 0,
    },
    player: {
      getEffectsConfig: vi.fn(),
      setEffectsConfig: vi.fn(),
      on: vi.fn<(event: string, cb: () => void) => void>(),
      off: vi.fn<(event: string, cb: () => void) => void>(),
      _listeners: listeners,
    },
  };
});

vi.mock('../../lib/player', () => ({ default: harness.player }));

function rect(el: Element): Rect {
  const b = el.getBoundingClientRect();
  return {
    left: b.left,
    right: b.right,
    top: b.top,
    bottom: b.bottom,
    width: b.width,
    height: b.height,
  };
}

function requireEl(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector);
  if (el == null) throw new Error(`missing element: ${selector}`);
  return el;
}

/** The `−`, readout, `+` and reset of one Burn row, in that DOM order. */
function steppersOf(decreaseLabel: string): {
  row: HTMLElement;
  id: HTMLElement;
  minus: HTMLElement;
  readout: HTMLElement;
  plus: HTMLElement;
  reset: HTMLElement;
} {
  const minus = requireEl(`[aria-label="${decreaseLabel}"]`);
  const row = minus.parentElement;
  const readout = minus.nextElementSibling;
  const plus = readout?.nextElementSibling;
  const id = row?.firstElementChild;
  const reset = row?.querySelector<HTMLElement>('button[aria-label^="Reset"]');
  if (row == null || readout == null || plus == null || id == null || reset == null) {
    throw new Error(`incomplete Burn row for "${decreaseLabel}"`);
  }
  return {
    row,
    id: id as HTMLElement,
    minus,
    readout: readout as HTMLElement,
    plus: plus as HTMLElement,
    reset,
  };
}

function iconRect(el: HTMLElement): Rect | null {
  const svg = el.querySelector<HTMLElement>('svg');
  return svg == null ? null : rect(svg);
}

/** Centre of a rect on each axis. */
function centre(r: Rect): { cx: number; cy: number } {
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

type RowBox = {
  idW: number;
  nameW: number;
  minus: Rect;
  readout: Rect;
  plus: Rect;
  reset: Rect;
  minusIcon: Rect | null;
  plusIcon: Rect | null;
};

function rowBox(parts: ReturnType<typeof steppersOf>): RowBox {
  const name = parts.id.lastElementChild;
  return {
    idW: rect(parts.id).width,
    nameW: name == null ? -1 : rect(name).width,
    minus: rect(parts.minus),
    readout: rect(parts.readout),
    plus: rect(parts.plus),
    reset: rect(parts.reset),
    minusIcon: iconRect(parts.minus),
    plusIcon: iconRect(parts.plus),
  };
}

function measure(): {
  rowLeft: { slow: number; reverb: number };
  slow: RowBox;
  reverb: RowBox;
} {
  const slow = steppersOf('Decrease speed');
  const reverb = steppersOf('Decrease reverb');
  return {
    rowLeft: { slow: rect(slow.row).left, reverb: rect(reverb.row).left },
    slow: rowBox(slow),
    reverb: rowBox(reverb),
  };
}

async function setViewport(width: number, height: number): Promise<void> {
  await page.viewport(width, height);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

beforeEach(() => {
  i18n.load('en', messages);
  i18n.activate('en');
  vi.clearAllMocks();
  harness.config = {
    enabled: true,
    slowEnabled: true,
    slow: 1,
    reverbEnabled: true,
    reverbIntensity: 0,
  };
  harness.player.getEffectsConfig.mockImplementation(() => ({ ...harness.config }));
});

afterEach(async () => {
  await cleanup();
});

async function mount(): Promise<void> {
  await render(
    <I18nProvider i18n={i18n}>
      <EffectControls />
    </I18nProvider>,
  );
}

/**
 * The steppers must be one family with `burnReset`: flat (no border), no UA
 * padding, and never smaller than the old 18x18 hit area. Red before the fix —
 * `borderStyle` was `solid` and `padding` was `1px 6px`.
 */
test('steppers match the reset button: flat, unpadded, >=18x18', async () => {
  await setViewport(720, 480);
  await mount();

  const slow = steppersOf('Decrease speed');
  const reverb = steppersOf('Decrease reverb');
  const resetStyle = getComputedStyle(slow.reset);

  expect(resetStyle.borderTopStyle).toBe('none');

  for (const parts of [slow, reverb]) {
    for (const btn of [parts.minus, parts.plus]) {
      const style = getComputedStyle(btn);
      expect(style.borderTopStyle, 'no border, like reset').toBe(
        resetStyle.borderTopStyle,
      );
      expect(style.padding, 'no UA padding, like reset').toBe(
        resetStyle.padding,
      );
      expect(style.backgroundColor, 'transparent default, like reset').toBe(
        resetStyle.backgroundColor,
      );
      const r = rect(btn);
      expect(r.width, 'hit width never shrinks').toBeGreaterThanOrEqual(18);
      expect(r.height, 'hit height never shrinks').toBeGreaterThanOrEqual(18);
    }
  }
});

/**
 * The concrete geometry defect: the glyph was drawn at the content-box start
 * (4px right of centre) because the padding left only 4px of content. A flat
 * 18x18 box with `placeItems: center` centres it. Red before the fix.
 */
test('the −/+ glyphs are centred in their buttons', async () => {
  await setViewport(720, 480);
  await mount();
  const m = measure();

  const rows: Array<{ name: string; box: RowBox }> = [
    { name: 'SLOW', box: m.slow },
    { name: 'REVERB', box: m.reverb },
  ];

  for (const { name, box } of rows) {
    const pairs: Array<{ glyph: string; btn: Rect; icon: Rect | null }> = [
      { glyph: '−', btn: box.minus, icon: box.minusIcon },
      { glyph: '+', btn: box.plus, icon: box.plusIcon },
    ];
    for (const { glyph, btn, icon } of pairs) {
      expect(icon, `${name} ${glyph} icon missing`).not.toBeNull();
      const btnCentre = centre(btn);
      const iconCentre = centre(icon as Rect);
      expect(
        Math.abs(iconCentre.cx - btnCentre.cx),
        `${name} ${glyph} glyph x-centre`,
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(iconCentre.cy - btnCentre.cy),
        `${name} ${glyph} glyph y-centre`,
      ).toBeLessThanOrEqual(TOL);
    }
  }
});

/**
 * Narrow (single Burn column): the two rows must share their −/readout/+
 * columns. This is the cross-row alignment the owner is asking about; it is a
 * regression guard (it already held before the fix) pinned so a future label
 * that outgrows the shared 58px floor turns it red.
 */
test('narrow (720x480): the two Burn rows share their −/readout/+ columns', async () => {
  await setViewport(720, 480);
  await mount();
  const m = measure();

  const dMinus = Math.abs(m.slow.minus.left - m.reverb.minus.left);
  const dReadout = Math.abs(m.slow.readout.left - m.reverb.readout.left);
  const dPlus = Math.abs(m.slow.plus.left - m.reverb.plus.left);

  expect(m.slow.idW, 'label column width').toBe(m.reverb.idW);
  expect(dMinus, '− left edges differ').toBeLessThanOrEqual(TOL);
  expect(dReadout, 'readout left edges differ').toBeLessThanOrEqual(TOL);
  expect(dPlus, '+ left edges differ').toBeLessThanOrEqual(TOL);
});

/**
 * Wide (two Burn columns): the two controls live in separate grid columns, so
 * comparing their absolute x is meaningless. What must still hold is that the
 * label column is a shared width — each row's −/readout/+ sit at identical
 * offsets from its own left edge.
 */
test('wide (1400x900): each Burn row keeps the same internal control offsets', async () => {
  await setViewport(1400, 900);
  await mount();
  const m = measure();

  const offsets = (row: RowBox, left: number) => ({
    minus: row.minus.left - left,
    readout: row.readout.left - left,
    plus: row.plus.left - left,
  });
  const slow = offsets(m.slow, m.rowLeft.slow);
  const reverb = offsets(m.reverb, m.rowLeft.reverb);

  expect(m.slow.idW, 'label column width').toBe(m.reverb.idW);
  expect(Math.abs(slow.minus - reverb.minus), '− offset differs').toBeLessThanOrEqual(WIDE_TOL);
  expect(Math.abs(slow.readout - reverb.readout), 'readout offset differs').toBeLessThanOrEqual(WIDE_TOL);
  expect(Math.abs(slow.plus - reverb.plus), '+ offset differs').toBeLessThanOrEqual(WIDE_TOL);
});
