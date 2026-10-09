/**
 * Full-mode A-B loop row floor guard: the full-mode A-B loop row must never
 * clip or misalign at the full floor (900x600), and must degrade gracefully
 * if its column is ever narrower (probed at 1200x600 as the wide control).
 * A MINI-mode case at the mini floor (320x420) covers the surface the owner
 * screenshotted: the same shared LoopControls row inside the ~300px-wide
 * mini now-playing column with the loop panel open.
 *
 * Renders FULL mode with a playing track and a saved+enabled A-B loop so
 * BOTH the "Saved loop" pill and the LOOPING chip render, then asserts:
 * 1. No horizontal overflow of the row or its panel
 *    (`scrollWidth <= clientWidth + 1`).
 * 2. Pairwise no-overlap of the row's direct children
 *    (`getBoundingClientRect()`, 1px tolerance).
 * 3. Every child fully inside the panel's rect (nothing clipped by the
 *    ancestor's `overflow-x: hidden`).
 *
 * Silent: the browser is launched with `--mute-audio` and playback is
 * silenced via `setSilentTest` + volume 0. Helpers are copied into this file
 * rather than imported across test files, per repo convention.
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from '../../__tests__/e2e-helpers';
import type { Config } from '../../generated/typings';
import {
  FULL_WINDOW_MIN_SIZE,
  MINI_WINDOW_MIN_SIZE,
} from '../../lib/mini-window';

beforeEachSetup();

const VIEWPORTS = [
  {
    name: 'full-floor',
    width: FULL_WINDOW_MIN_SIZE.width,
    height: FULL_WINDOW_MIN_SIZE.height,
  },
  { name: 'wide', width: 1200, height: FULL_WINDOW_MIN_SIZE.height },
] as const;

/** Overlap depth (px) tolerated between sibling boxes (subpixel kiss). */
const OVERLAP_TOLERANCE = 1;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await sleep(20);
  }
}

/** Two frames plus a beat: lets React, media queries, and observers settle. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await sleep(120);
}

async function setMode(mode: 'full' | 'mini'): Promise<void> {
  const mod = (await import('../../lib/bridge-config')) as unknown as {
    default: { config: Config };
  };
  mod.default.config = { ...mod.default.config, ui_mode: mode };
  const { default: queryClient } = await import('../../lib/query-client');
  const { configQuery } = await import('../../lib/queries');
  await queryClient.invalidateQueries({ queryKey: configQuery.queryKey });
}

/** Scan the mock library, silence the graph, and play the first track. */
async function playFirstTrack(): Promise<void> {
  await setupScannedLibrary();
  const p = window.__MUSEEKS_PLAYER;
  p.getEffects().setSilentTest(true);
  p.setVolume(0);
  await getTrackByName(/Whiskey Blues/).dblClick();
  await waitFor(() => !p.getState().isPaused, 5000);
}

/**
 * The A-B controls live behind the closed-by-default `A-B loop options`
 * disclosure. Open it (a no-op when already open) and prove it opened via
 * `aria-expanded`.
 */
async function openDisclosure(name: 'A-B loop options'): Promise<void> {
  const toggle = page.getByRole('button', { name });
  if (
    (toggle.element() as HTMLButtonElement).getAttribute('aria-expanded') !==
    'true'
  ) {
    await toggle.click();
  }
  await waitFor(
    () =>
      (toggle.element() as HTMLButtonElement).getAttribute('aria-expanded') ===
      'true',
    3000,
  );
}

afterEach(async () => {
  window.__MUSEEKS_PLAYER?.pause();
  await page.viewport(900, 500);
});

type Rect = { left: number; top: number; right: number; bottom: number };

function rectOf(el: Element): Rect {
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
}

function isPainted(el: Element): boolean {
  const b = el.getBoundingClientRect();
  return b.width > 0 && b.height > 0;
}

function describeEl(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const label =
    el.getAttribute('aria-label') ??
    el.getAttribute('title') ??
    (el.textContent ?? '').trim().slice(0, 24);
  return `${tag}${label ? `[${label}]` : ''}`;
}

/** True when the boxes intersect by more than the tolerance on both axes. */
function boxesOverlap(a: Rect, b: Rect): boolean {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > OVERLAP_TOLERANCE && y > OVERLAP_TOLERANCE;
}

/**
 * Pairwise sibling-overlap check. Elements with no painted size are
 * skipped; containment pairs must never be passed in - scope to one flex
 * row's direct items.
 */
function expectNoOverlap(
  els: Array<Element>,
  label: string,
  context: string,
): void {
  const painted = els.filter(isPainted);
  for (let i = 0; i < painted.length; i += 1) {
    for (let j = i + 1; j < painted.length; j += 1) {
      const a = painted[i] as Element;
      const b = painted[j] as Element;
      const ra = rectOf(a);
      const rb = rectOf(b);
      expect(
        boxesOverlap(ra, rb),
        `${context} ${label}: ${describeEl(a)} ${JSON.stringify(ra)} overlaps ${describeEl(b)} ${JSON.stringify(rb)}`,
      ).toBe(false);
    }
  }
}

for (const vp of VIEWPORTS) {
  test(
    `full-mode A-B loop row never clips or misaligns (full @ ${vp.name} ${vp.width}x${vp.height})`,
    { timeout: 60_000 },
    async () => {
      await setMode('full');
      await page.viewport(vp.width, vp.height);
      await settle();

      const context = `full@${vp.width}x${vp.height}`;
      await expect
        .element(page.getByRole('region', { name: 'Now playing' }))
        .toBeVisible();

      await playFirstTrack();
      await openDisclosure('A-B loop options');

      // Saved + enabled region so BOTH the Saved loop pill and the
      // LOOPING chip render (the chip needs a playing track).
      const p = window.__MUSEEKS_PLAYER;
      await p.setAbPoint('A', 2);
      await p.setAbPoint('B', 5);
      await p.setAbEnabled(true);
      await waitFor(() => {
        const loop = p.getAbLoop();
        return (
          loop.startSeconds === 2 &&
          loop.endSeconds === 5 &&
          loop.enabled &&
          !p.getState().isPaused
        );
      }, 5000);
      await expect.element(page.getByText('Saved loop')).toBeVisible();
      await expect.element(page.getByText('● LOOPING')).toBeVisible();
      await settle();

      const panel = document.querySelector(
        '#np-loop-panel',
      ) as HTMLElement | null;
      if (panel == null) throw new Error(`${context} #np-loop-panel missing`);
      const row = panel.firstElementChild as HTMLElement | null;
      if (row == null) throw new Error(`${context} A-B loop row missing`);
      const children = Array.from(row.children).filter(
        (el): el is HTMLElement => el instanceof HTMLElement,
      );
      expect(
        children.length,
        `${context} expected A-B row children, got ${children.length}`,
      ).toBeGreaterThan(0);

      // 1. No horizontal overflow of the row or its panel.
      for (const el of [row, panel]) {
        expect(
          el.scrollWidth,
          `${context} horizontal overflow: ${describeEl(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`,
        ).toBeLessThanOrEqual(el.clientWidth + 1);
      }

      // 2. Pairwise no-overlap of the row's direct children.
      expectNoOverlap(children, 'ab-row', context);

      // 3. Every child fully inside the panel's rect (nothing clipped by
      // the ancestor's overflow-x: hidden).
      const panelRect = rectOf(panel);
      const outside: Array<string> = [];
      for (const child of children) {
        if (!isPainted(child)) continue;
        const r = rectOf(child);
        if (
          r.left < panelRect.left - 1 ||
          r.right > panelRect.right + 1 ||
          r.top < panelRect.top - 1 ||
          r.bottom > panelRect.bottom + 1
        ) {
          outside.push(
            `${describeEl(child)} ${JSON.stringify(r)} outside panel ${JSON.stringify(panelRect)}`,
          );
        }
      }
      expect(outside, `${context} children clipped by panel`).toEqual([]);

      // 4. Trailing trio stays grouped as ONE unit with even rhythm: the
      // Saved pill, LOOPING chip, and Clear button share one flex line and
      // live under one direct row child (the group). When the row fits on
      // one line the trio hugs the row's content right edge: the last
      // VISIBLE pill's right edge (Clear now carries the same 1px
      // border-soft pill language, and its "\" keycap is absolutely
      // positioned so it reserves zero trailing width) sits within 2px of
      // the row's content right edge. When the row wraps (mini, and pre-fix
      // 900x600 where the wider Clear pushed 2px past the 510px row: group
      // right 264.80 vs row right 534) the same trio lands flush LEFT on
      // its wrapped line instead. The assertion is wrap-aware so it cannot
      // encode a false premise either way. Both cases assert the two
      // border-to-border visual gaps (Saved->LOOPING, LOOPING->Clear) match
      // within 2px.
      const savedEl = Array.from(row.querySelectorAll('span')).find(
        (el) =>
          (el.textContent ?? '').includes('Saved loop') &&
          !(el.textContent ?? '').includes('LOOPING'),
      );
      const loopingEl = Array.from(row.querySelectorAll('span')).find(
        (el) =>
          (el.textContent ?? '').includes('LOOPING') &&
          !(el.textContent ?? '').includes('Saved loop'),
      );
      const clearEl = Array.from(row.querySelectorAll('button')).find((el) =>
        (el.textContent ?? '').includes('Clear'),
      );
      expect(savedEl != null, `${context} Saved loop pill missing`).toBe(true);
      expect(loopingEl != null, `${context} LOOPING chip missing`).toBe(true);
      expect(clearEl != null, `${context} Clear button missing`).toBe(true);
      if (savedEl == null || loopingEl == null || clearEl == null) {
        throw new Error(`${context} trailing trio missing`);
      }
      {
        const rs = rectOf(savedEl);
        const rl = rectOf(loopingEl);
        const rc = rectOf(clearEl);
        // eslint-disable-next-line no-console
        console.log(
          'LOOP_TRIO_MEASURE',
          JSON.stringify({ context, saved: rs, looping: rl, clear: rc }),
        );
        const vOverlap = (a: Rect, b: Rect): number =>
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        expect(
          vOverlap(rs, rl),
          `${context} Saved pill ${JSON.stringify(rs)} and LOOPING chip ${JSON.stringify(rl)} not on one line`,
        ).toBeGreaterThan(0);
        expect(
          vOverlap(rl, rc),
          `${context} LOOPING chip ${JSON.stringify(rl)} and Clear ${JSON.stringify(rc)} not on one line`,
        ).toBeGreaterThan(0);
        expect(
          vOverlap(rs, rc),
          `${context} Saved pill ${JSON.stringify(rs)} and Clear ${JSON.stringify(rc)} not on one line`,
        ).toBeGreaterThan(0);
        const directChildOfRow = (el: Element): Element | null => {
          let cur: Element | null = el;
          while (cur != null && cur.parentElement !== row) {
            cur = cur.parentElement;
          }
          return cur;
        };
        const ds = directChildOfRow(savedEl);
        const dl = directChildOfRow(loopingEl);
        const dc = directChildOfRow(clearEl);
        expect(
          ds != null && ds === dl && dl === dc,
          `${context} trailing trio not grouped under one direct row child`,
        ).toBe(true);
        if (ds == null || ds !== dl || ds !== dc) {
          throw new Error(`${context} trailing trio not grouped`);
        }
        const groupRect = rectOf(ds);
        const rowRect = rectOf(row);
        const rowCS = getComputedStyle(row);
        const rowBorderLeft = parseFloat(rowCS.borderLeftWidth) || 0;
        const padL = parseFloat(rowCS.paddingLeft) || 0;
        const padR = parseFloat(rowCS.paddingRight) || 0;
        const rowContentLeft = rowRect.left + rowBorderLeft + padL;
        const rowContentRight =
          rowRect.left + rowBorderLeft + row.clientWidth - padR;
        // Two border-to-border visual gaps (three pills -> two gaps): after
        // the fix layout equals visual (all three carry a visible box), so
        // rect gaps are the visual rhythm.
        const gapSavedLooping = rl.left - rs.right;
        const gapLoopingClear = rc.left - rl.right;
        // eslint-disable-next-line no-console
        console.log(
          'LOOP_TRIO_GAPS',
          JSON.stringify({ context, gapSavedLooping, gapLoopingClear }),
        );
        expect(
          Math.abs(gapSavedLooping - gapLoopingClear),
          `${context} trailing gaps uneven: Saved->LOOPING ${gapSavedLooping} vs LOOPING->Clear ${gapLoopingClear}`,
        ).toBeLessThanOrEqual(2);
        // A pill counts as VISIBLE when it paints a border or a background:
        // Clear before the fix (transparent bg, no border) is invisible, so
        // the last visible right is LOOPING and sits far inset; after the
        // fix Clear's 1px border-soft makes it visible and flush.
        const hasVisibleBox = (el: Element): boolean => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') {
            return false;
          }
          if ((parseFloat(cs.opacity) || 1) < 0.05) return false;
          const bw = parseFloat(cs.borderTopWidth) || 0;
          const hasBorder =
            cs.borderTopStyle !== 'none' &&
            cs.borderTopStyle !== 'hidden' &&
            bw > 0;
          const bg = cs.backgroundColor;
          const hasBg =
            bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
          return hasBorder || hasBg;
        };
        expect(
          hasVisibleBox(clearEl),
          `${context} Clear button has no visible pill box (expected 1px border-soft)`,
        ).toBe(true);
        // Collect-then-assert keeps `vitest/no-conditional-expect` quiet:
        // pushes are conditional, the single assertion below is not.
        // Wrap-aware: single-line trios assert VISIBLE right flush;
        // wrapped trios assert group left flush (same left form as mini).
        const alignViolations: Array<string> = [];
        const firstTop = rectOf(children[0] as Element).top;
        const wrapped = Math.abs(rs.top - firstTop) > 5;
        if (!wrapped) {
          const visibleRights = [savedEl, loopingEl, clearEl]
            .filter(hasVisibleBox)
            .map((el) => rectOf(el).right);
          const lastVisibleRight = Math.max(...visibleRights);
          if (Math.abs(lastVisibleRight - rowContentRight) > 2) {
            alignViolations.push(
              `${context} last VISIBLE right ${lastVisibleRight} not flush with row content right ${rowContentRight} (row ${JSON.stringify(rowRect)} trio ${JSON.stringify({ saved: rs, looping: rl, clear: rc })})`,
            );
          }
        } else {
          if (Math.abs(groupRect.left - rowContentLeft) > 2) {
            alignViolations.push(
              `${context} trailing group left ${groupRect.left} not aligned with row content left ${rowContentLeft} (wrapped line; group right ${groupRect.right} vs row right ${rowRect.right} is mid-row by design)`,
            );
          }
        }
        expect(alignViolations, `${context} trailing trio flush`).toEqual([]);
      }

      // Measured numbers, green or red: row/panel widths plus every child.
      // eslint-disable-next-line no-console
      console.log(
        'LOOP_ROW_MEASURE',
        JSON.stringify({
          context,
          row: {
            clientWidth: row.clientWidth,
            scrollWidth: row.scrollWidth,
            rect: rectOf(row),
          },
          panel: {
            clientWidth: panel.clientWidth,
            scrollWidth: panel.scrollWidth,
            rect: panelRect,
          },
          children: children.map((child) => ({
            label: describeEl(child),
            rect: rectOf(child),
          })),
        }),
      );

      // Passing-run capture for pixel review (not an assertion): only the
      // full-floor 900x600 case writes the full PNG; the wide control skips
      // it so the reviewed pixels are always 900x600.
      if (vp.name === 'full-floor') {
        await page.screenshot({
          path: '__screenshots__/loop-row-full-900x600.png',
        });
      }
    },
  );
}

test(
  `mini-mode A-B loop row never clips or misaligns (mini @ mini-floor ${MINI_WINDOW_MIN_SIZE.width}x${MINI_WINDOW_MIN_SIZE.height})`,
  { timeout: 60_000 },
  async () => {
    await setMode('mini');
    await page.viewport(
      MINI_WINDOW_MIN_SIZE.width,
      MINI_WINDOW_MIN_SIZE.height,
    );
    await settle();

    const context = `mini@${MINI_WINDOW_MIN_SIZE.width}x${MINI_WINDOW_MIN_SIZE.height}`;
    await expect
      .element(page.getByRole('region', { name: 'Now playing' }))
      .toBeVisible();

    await playFirstTrack();

    // Saved + enabled region so BOTH the Saved loop pill and the
    // LOOPING chip render (the chip needs a playing track). The saved
    // loop auto-opens the A-B disclosure (see NowPlaying) - the panel
    // appearing is itself the assertion that the owner's screenshotted
    // surface (mini, panel open) is on screen.
    const p = window.__MUSEEKS_PLAYER;
    await p.setAbPoint('A', 2);
    await p.setAbPoint('B', 5);
    await p.setAbEnabled(true);
    await waitFor(() => {
      const loop = p.getAbLoop();
      return (
        loop.startSeconds === 2 &&
        loop.endSeconds === 5 &&
        loop.enabled &&
        !p.getState().isPaused
      );
    }, 5000);
    await waitFor(() => {
      const panel = document.querySelector('#np-loop-panel');
      return panel instanceof HTMLElement && isPainted(panel);
    }, 5000);
    // NOTE (mini only): the Queue sub-bar's `◆ Saved loops` filter chip is
    // on screen here, so a substring match hits twice - the exact pill text
    // keeps this scoped to the A-B row.
    await expect
      .element(page.getByText('◆Saved loop', { exact: true }))
      .toBeVisible();
    await expect.element(page.getByText('● LOOPING')).toBeVisible();
    await settle();

    const panel = document.querySelector(
      '#np-loop-panel',
    ) as HTMLElement | null;
    if (panel == null) throw new Error(`${context} #np-loop-panel missing`);
    const row = panel.firstElementChild as HTMLElement | null;
    if (row == null) throw new Error(`${context} A-B loop row missing`);
    const children = Array.from(row.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    expect(
      children.length,
      `${context} expected A-B row children, got ${children.length}`,
    ).toBeGreaterThan(0);

    // 1. No horizontal overflow of the row or its panel.
    for (const el of [row, panel]) {
      expect(
        el.scrollWidth,
        `${context} horizontal overflow: ${describeEl(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`,
      ).toBeLessThanOrEqual(el.clientWidth + 1);
    }

    // 2. Pairwise no-overlap of the row's direct children.
    expectNoOverlap(children, 'ab-row', context);

    // 3. Every child fully inside the panel's rect (nothing clipped by
    // the ancestor's overflow-x: hidden).
    const panelRect = rectOf(panel);
    const outside: Array<string> = [];
    for (const child of children) {
      if (!isPainted(child)) continue;
      const r = rectOf(child);
      if (
        r.left < panelRect.left - 1 ||
        r.right > panelRect.right + 1 ||
        r.top < panelRect.top - 1 ||
        r.bottom > panelRect.bottom + 1
      ) {
        outside.push(
          `${describeEl(child)} ${JSON.stringify(r)} outside panel ${JSON.stringify(panelRect)}`,
        );
      }
    }
    expect(outside, `${context} children clipped by panel`).toEqual([]);

    // 4. Trailing trio stays grouped as ONE left-aligned unit on the wrapped
    // line: the Saved pill, LOOPING chip, and Clear button share one flex
    // line, live under one direct row child (the group), and that group's
    // left edge aligns with the row's content left edge within 2px (the
    // spacer holds line 1's free space so the wrapped group starts flush
    // left with the A/B controls).
    const savedEl = Array.from(row.querySelectorAll('span')).find(
      (el) =>
        (el.textContent ?? '').includes('Saved loop') &&
        !(el.textContent ?? '').includes('LOOPING'),
    );
    const loopingEl = Array.from(row.querySelectorAll('span')).find(
      (el) =>
        (el.textContent ?? '').includes('LOOPING') &&
        !(el.textContent ?? '').includes('Saved loop'),
    );
    const clearEl = Array.from(row.querySelectorAll('button')).find((el) =>
      (el.textContent ?? '').includes('Clear'),
    );
    expect(savedEl != null, `${context} Saved loop pill missing`).toBe(true);
    expect(loopingEl != null, `${context} LOOPING chip missing`).toBe(true);
    expect(clearEl != null, `${context} Clear button missing`).toBe(true);
    if (savedEl == null || loopingEl == null || clearEl == null) {
      throw new Error(`${context} trailing trio missing`);
    }
    {
      const rs = rectOf(savedEl);
      const rl = rectOf(loopingEl);
      const rc = rectOf(clearEl);
      // eslint-disable-next-line no-console
      console.log(
        'LOOP_TRIO_MEASURE',
        JSON.stringify({ context, saved: rs, looping: rl, clear: rc }),
      );
      const vOverlap = (a: Rect, b: Rect): number =>
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(
        vOverlap(rs, rl),
        `${context} Saved pill ${JSON.stringify(rs)} and LOOPING chip ${JSON.stringify(rl)} not on one line`,
      ).toBeGreaterThan(0);
      expect(
        vOverlap(rl, rc),
        `${context} LOOPING chip ${JSON.stringify(rl)} and Clear ${JSON.stringify(rc)} not on one line`,
      ).toBeGreaterThan(0);
      expect(
        vOverlap(rs, rc),
        `${context} Saved pill ${JSON.stringify(rs)} and Clear ${JSON.stringify(rc)} not on one line`,
      ).toBeGreaterThan(0);
      const directChildOfRow = (el: Element): Element | null => {
        let cur: Element | null = el;
        while (cur != null && cur.parentElement !== row) {
          cur = cur.parentElement;
        }
        return cur;
      };
      const ds = directChildOfRow(savedEl);
      const dl = directChildOfRow(loopingEl);
      const dc = directChildOfRow(clearEl);
      expect(
        ds != null && ds === dl && dl === dc,
        `${context} trailing trio not grouped under one direct row child`,
      ).toBe(true);
      if (ds == null || ds !== dl || ds !== dc) {
        throw new Error(`${context} trailing trio not grouped`);
      }
      const groupRect = rectOf(ds);
      const rowRect = rectOf(row);
      expect(
        Math.abs(groupRect.left - rowRect.left),
        `${context} trailing group left ${groupRect.left} not aligned with row left ${rowRect.left}`,
      ).toBeLessThanOrEqual(2);
    }

    // Measured numbers, green or red: row/panel widths plus every child.
    // eslint-disable-next-line no-console
    console.log(
      'LOOP_ROW_MEASURE',
      JSON.stringify({
        context,
        row: {
          clientWidth: row.clientWidth,
          scrollWidth: row.scrollWidth,
          rect: rectOf(row),
        },
        panel: {
          clientWidth: panel.clientWidth,
          scrollWidth: panel.scrollWidth,
          rect: panelRect,
        },
        children: children.map((child) => ({
          label: describeEl(child),
          rect: rectOf(child),
        })),
      }),
    );

    // Passing-run capture for pixel review (not an assertion).
    await page.screenshot({
      path: '__screenshots__/loop-row-mini-320x420.png',
    });
  },
);
