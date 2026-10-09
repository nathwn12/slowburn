/**
 * Queue-bleed guard: settles the deferred "queue-bleed hardening" finding
 * (a 2px paddingBlockStart on the queue plus a zIndex on the tab strip).
 *
 * No reproduced symptom is on file - the note names speculative hardening,
 * not an observed failure. This suite reproduces BEFORE any production
 * change: it renders the Queue panel beside its tab strip at the full-mode
 * floor (900x600) and a wide control (1200x600) with a 60-row queue (well
 * past the 20-row first page, so the listbox actually scrolls), then asserts:
 * 1. The queue scroller and the tab strip never intersect
 *    (`getBoundingClientRect()`, 1px tolerance), at the top, middle, and
 *    bottom scroll positions.
 * 2. The topmost visible row is neither covered by the strip (rect
 *    intersection) nor occluded by anything (centre hit-test lands inside
 *    the row itself).
 *
 * Layout relationship under test: the Queue panel is a normal-flow flex
 * column (head, tab strip, Up Next block, sub-bar, then the QueueList
 * `ul[role="listbox"]` scroller with `overflow-y: auto`). Neither the strip
 * nor the scroller is positioned, so scrolled rows should clip at the
 * scroller's own box and never paint over (or under) the strip. If this
 * suite ever fails, the measured rects below name the bleeder and the
 * victim; only then is the hardening fix justified.
 *
 * Silent: the browser is launched with `--mute-audio` and playback is
 * silenced via `setSilentTest` + volume 0. Helpers are copied into this file
 * rather than imported across test files, per repo convention.
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import type { Config, Track } from '../generated/typings';
import { FULL_WINDOW_MIN_SIZE } from '../lib/mini-window';
import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

const VIEWPORTS = [
  {
    name: 'full',
    width: FULL_WINDOW_MIN_SIZE.width,
    height: FULL_WINDOW_MIN_SIZE.height,
  },
  { name: 'wide', width: 1200, height: FULL_WINDOW_MIN_SIZE.height },
] as const;

/** Overlap depth (px) tolerated between sibling boxes (subpixel kiss). */
const OVERLAP_TOLERANCE = 1;

/** Rows on screen: 60 cloned tracks, well past the 20-row first page. */
const LONG_QUEUE_LENGTH = 60;

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
  const mod = (await import('../lib/bridge-config')) as unknown as {
    default: { config: Config };
  };
  mod.default.config = { ...mod.default.config, ui_mode: mode };
  const { default: queryClient } = await import('../lib/query-client');
  const { configQuery } = await import('../lib/queries');
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
 * Stretch the 3-track mock library into a 60-row queue (cloned tracks with
 * unique ids) so the queue listbox actually scrolls at 600px heights.
 */
async function seedLongQueue(): Promise<void> {
  const p = window.__MUSEEKS_PLAYER;
  const base = p.getState().queue;
  expect(
    base.length,
    'seedLongQueue needs a playing queue to clone from',
  ).toBeGreaterThan(0);
  const long: Array<Track> = [];
  for (let n = 0; long.length < LONG_QUEUE_LENGTH; n += 1) {
    for (const track of base) {
      if (long.length >= LONG_QUEUE_LENGTH) break;
      long.push({ ...track, id: `${track.id}-bleed-${n}` });
    }
  }
  const first = long[0];
  if (first == null) throw new Error('seedLongQueue built an empty queue');
  await p.start(long, first.id, { type: 'library' });
  await waitFor(() => !p.getState().isPaused, 5000);
}

/** Click "See more" until the queue renders past its 20-row first page. */
async function expandQueue(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    const more = page.getByRole('button', { name: 'See more' }).elements();
    if (more.length === 0) return;
    await page.getByRole('button', { name: 'See more' }).click();
    await settle();
  }
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

function queueListbox(): HTMLElement {
  const list = document.querySelector('[role="listbox"][aria-label="Queue"]');
  if (!(list instanceof HTMLElement)) {
    throw new Error(
      'queue listbox [role="listbox"][aria-label="Queue"] missing',
    );
  }
  return list;
}

function tabStrip(): HTMLElement {
  const strip = document.querySelector(
    '[role="tablist"][aria-label="Panel source"]',
  );
  if (!(strip instanceof HTMLElement)) {
    throw new Error(
      'tab strip [role="tablist"][aria-label="Panel source"] missing',
    );
  }
  return strip;
}

/** The topmost FULLY visible row (entire box inside the scroller's box). */
function topmostFullyVisibleRow(list: HTMLElement): HTMLElement {
  const listRect = rectOf(list);
  const rows = Array.from(list.querySelectorAll('[role="option"]')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && isPainted(el),
  );
  expect(rows.length, 'expected queue rows on screen').toBeGreaterThan(0);
  const fully = rows.filter((row) => {
    const r = rectOf(row);
    return r.top >= listRect.top - 1 && r.bottom <= listRect.bottom + 1;
  });
  if (fully.length === 0) {
    throw new Error('no fully visible queue row');
  }
  let top = fully[0] as HTMLElement;
  for (const row of fully) {
    if (rectOf(row).top < rectOf(top).top) top = row;
  }
  return top;
}

for (const vp of VIEWPORTS) {
  test(
    `queue content never bleeds over the tab strip (full @ ${vp.name} ${vp.width}x${vp.height})`,
    { timeout: 60_000 },
    async () => {
      await setMode('full');
      await page.viewport(vp.width, vp.height);
      await settle();

      const context = `full@${vp.width}x${vp.height}`;
      await playFirstTrack();
      await seedLongQueue();
      window.location.hash = '#/queue';
      await expect
        .element(page.getByRole('tablist', { name: 'Panel source' }))
        .toBeVisible();
      await expect
        .element(page.getByRole('listbox', { name: 'Queue' }))
        .toBeVisible();
      await settle();
      await expandQueue();
      await settle();

      const list = queueListbox();
      const strip = tabStrip();

      // Precondition: the queue is actually long enough to scroll - without
      // this the bleed probe below is vacuous.
      const optionCount = list.querySelectorAll('[role="option"]').length;
      expect(
        optionCount,
        `${context} expected a fully expanded ${LONG_QUEUE_LENGTH}-row queue, got ${optionCount}`,
      ).toBe(LONG_QUEUE_LENGTH);
      expect(
        list.scrollHeight,
        `${context} queue does not scroll: scrollHeight ${list.scrollHeight} <= clientHeight ${list.clientHeight}`,
      ).toBeGreaterThan(list.clientHeight + 1);

      // Layout relationship on the record: which element could bleed, and
      // which is the victim.
      const listStyle = getComputedStyle(list);
      const stripStyle = getComputedStyle(strip);
      // eslint-disable-next-line no-console
      console.log(
        'QUEUE_BLEED_LAYOUT',
        JSON.stringify({
          context,
          list: {
            position: listStyle.position,
            zIndex: listStyle.zIndex,
            overflowY: listStyle.overflowY,
            rect: rectOf(list),
          },
          strip: {
            position: stripStyle.position,
            zIndex: stripStyle.zIndex,
            overflowY: stripStyle.overflowY,
            rect: rectOf(strip),
          },
        }),
      );

      const maxScroll = list.scrollHeight - list.clientHeight;
      const scrollStops = [0, Math.floor(maxScroll / 2), maxScroll];
      // eslint-disable-next-line no-console
      console.log(
        'QUEUE_BLEED_STOPS',
        JSON.stringify({
          context,
          scrollHeight: list.scrollHeight,
          clientHeight: list.clientHeight,
          stops: scrollStops,
        }),
      );
      for (const stop of scrollStops) {
        list.scrollTop = stop;
        await sleep(60);
        const stripRect = rectOf(strip);
        const listRect = rectOf(list);
        // eslint-disable-next-line no-console
        console.log(
          'QUEUE_BLEED_MEASURE',
          JSON.stringify({
            context,
            stop,
            scrollTop: list.scrollTop,
            strip: stripRect,
            list: listRect,
          }),
        );

        // 1. The scroller and the strip never intersect.
        expect(
          boxesOverlap(listRect, stripRect),
          `${context} scrollTop ${list.scrollTop}: queue scroller ${JSON.stringify(listRect)} overlaps tab strip ${JSON.stringify(stripRect)}`,
        ).toBe(false);

        // 2. The topmost fully visible row is not clipped or covered by the
        // strip: its box stays clear of the strip, and its centre hit-tests
        // inside the row itself (proving no overlay - strip or otherwise -
        // covers it). The row is fully inside the scroller by construction,
        // so the centre point is inside the listbox and the hit-test is
        // meaningful.
        const row = topmostFullyVisibleRow(list);
        const rowRect = rectOf(row);
        // eslint-disable-next-line no-console
        console.log(
          'QUEUE_BLEED_ROW',
          JSON.stringify({
            context,
            stop,
            scrollTop: list.scrollTop,
            row: rowRect,
          }),
        );
        expect(
          boxesOverlap(rowRect, stripRect),
          `${context} scrollTop ${list.scrollTop}: topmost row ${describeEl(row)} ${JSON.stringify(rowRect)} intersects tab strip ${JSON.stringify(stripRect)}`,
        ).toBe(false);
        const hit = document.elementFromPoint(
          (rowRect.left + rowRect.right) / 2,
          (rowRect.top + rowRect.bottom) / 2,
        );
        expect(
          hit != null && row.contains(hit),
          `${context} scrollTop ${list.scrollTop}: topmost row centre hits ${hit != null ? describeEl(hit) : 'nothing'}, not the row`,
        ).toBe(true);
      }

      // Passing-run capture for pixel review (not an assertion): one PNG per
      // viewport so both sizes are reviewable.
      await page.screenshot({
        path: `__screenshots__/queue-bleed-${vp.name}-${vp.width}x${vp.height}.png`,
      });
    },
  );
}
