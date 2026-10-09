/**
 * Layout floor guard: the owner's ship rule, made executable.
 *
 * Never ship a build if anything is not aligned, goes out of order, or makes
 * the visuals misaligned or awkward. This suite fails when the app layout is
 * misaligned, overflowing, clipped, or awkward at or above the window floor,
 * in both `full` and `mini` modes.
 *
 * Floors are read from `src/lib/mini-window.ts` at runtime - never hardcoded
 * here. Each mode is only tested at or above its OWN floor (`full` only at or
 * above FULL_WINDOW_MIN_SIZE, `mini` only at or above MINI_WINDOW_MIN_SIZE):
 * widths covered are the mini floor, the full floor, and 1200 (heights ride
 * the matching floor heights), minus the unreachable `full`-below-900 combos.
 * Each reachable mode x width combo runs an
 * empty-library phase (empty-state copy, CTA, orphan wrap) and a populated
 * Burn phase (scanned library + playing track with an A-B loop, engaged
 * Slow/Reverb, and a multi-track queue, so the row list exists in both
 * modes and the Queue tab strip exists in mini mode; full mode renders no
 * tab strip).
 *
 * What it asserts per combo:
 * 1. No horizontal overflow: every scroll container and the root satisfy
 *    `scrollWidth <= clientWidth + 1`.
 * 2. No clipped content: text blocks and the empty-state copy satisfy
 *    `scrollHeight <= clientHeight + 1`, and the empty-state CTA is inside
 *    the viewport and not cut off (rect + hit-test).
 * 3. No overlap: sibling controls in the header, the transport row, the tab
 *    strip, and the search cluster must not intersect
 *    (`getBoundingClientRect()` pairwise, >1px depth on both axes fails).
 *    This catches the compressed header and the Full button crowding the
 *    search pill.
 * 4. No orphan wrap: the empty-state copy must not end with a single
 *    dangling word on its own line (measured line boxes via Range rects,
 *    not character counts).
 * 5. The vertical scrollbar gutter must not overlap row content: the list
 *    carries `scrollbarGutter: stable` and the first row ends before the
 *    reserved gutter lane starts.
 * 6. Burn state (populated phase only): the now-playing column's visible
 *    blocks - cover, title/artist block, format/quality box, effects chips
 *    group, seek times, seek slider, transport row - must not pairwise
 *    overlap, and their text lines must not be clipped. Full mode
 *    additionally asserts the A-B loop row's direct children.
 *
 * CRITICAL: if this guard finds a REAL misalignment, do NOT weaken it to
 * make it green. Report the measured numbers as a finding and stop.
 *
 * Black-box against the live shell (roles, text, rects) via the shared
 * `beforeEachSetup` harness. Silent: the browser is launched with
 * `--mute-audio` and playback is silenced via `setSilentTest` + volume 0.
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from '../../__tests__/e2e-helpers';
import type { Config, Track } from '../../generated/typings';
import {
  FULL_WINDOW_MIN_SIZE,
  MINI_WINDOW_MIN_SIZE,
} from '../../lib/mini-window';

beforeEachSetup();

type Mode = 'full' | 'mini';

const VIEWPORTS = [
  {
    name: 'mini-floor',
    width: MINI_WINDOW_MIN_SIZE.width,
    height: MINI_WINDOW_MIN_SIZE.height,
  },
  {
    name: 'full-floor',
    width: FULL_WINDOW_MIN_SIZE.width,
    height: FULL_WINDOW_MIN_SIZE.height,
  },
  {
    name: 'wide',
    width: 1200,
    height: FULL_WINDOW_MIN_SIZE.height,
  },
] as const;

const MODES: Array<Mode> = ['full', 'mini'];

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

async function setMode(mode: Mode): Promise<void> {
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
 * Burn-state setup: the loop + effects + queue the guard used to never
 * model, so the mini-mode chips, the format/quality box, and the seek times
 * are actually on screen (and overlapping, if the layout is broken) instead
 * of unnoticed. Runs after `playFirstTrack`, while the track is playing.
 */
async function populateBurnState(): Promise<void> {
  const p = window.__MUSEEKS_PLAYER;
  await p.setAbPoint('A', 2);
  await p.setAbPoint('B', 5);
  await p.setAbEnabled(true);
  p.setEffectsConfig({ slowEnabled: true, slow: 0.8 });
  p.setEffectsConfig({ reverbEnabled: true, reverbIntensity: 0.5 });
  // The dblClick path starts the whole scanned list as the queue; pin it so
  // a single-track queue can never hide the queue-strip/row assertions below.
  if (p.getQueue().length < 2) {
    const { default: queryClient } = await import('../../lib/query-client');
    const { allTracksQuery } = await import('../../lib/queries');
    const tracks = queryClient.getQueryData(allTracksQuery.queryKey) as
      | Array<Track>
      | undefined;
    if (tracks != null && tracks.length >= 2) {
      p.setQueue([...tracks]);
      await p.startFromQueue(0);
      await waitFor(() => !p.getState().isPaused, 5000);
    }
  }
  await waitFor(
    () => p.getAbLoop().startSeconds === 2 && p.getAbLoop().endSeconds === 5,
    5000,
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
 * skipped (hidden kbd hint, icon-only crumbs); containment pairs must never
 * be passed in - scope to one flex row's direct items.
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

function expectNoHorizontalOverflow(context: string): void {
  const candidates: Array<HTMLElement> = [document.documentElement];
  if (document.body instanceof HTMLElement) candidates.push(document.body);
  for (const el of Array.from(document.querySelectorAll('*'))) {
    if (!(el instanceof HTMLElement)) continue;
    const style = getComputedStyle(el);
    if (
      style.overflowX === 'auto' ||
      style.overflowX === 'scroll' ||
      style.overflowY === 'auto' ||
      style.overflowY === 'scroll'
    ) {
      candidates.push(el);
    }
  }
  for (const el of candidates) {
    expect(
      el.scrollWidth,
      `${context} horizontal overflow: ${describeEl(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`,
    ).toBeLessThanOrEqual(el.clientWidth + 1);
  }
}

/**
 * Deliberate screen-reader mirror, not clipped text: `EffectControls.tsx`
 * styles its `role="status"` readout mirror (`srValue`, lines 344-352) - and
 * `Navigation.tsx` its narrow-layout crumb words - with the classic
 * visually-hidden recipe (`position: absolute`, 1x1 px, `overflow: hidden`,
 * `clip-path: inset(50%)`). Such elements paint a 1px box by design, so they
 * pass `isPainted` yet always report `scrollHeight > clientHeight`. Skipping
 * them here does not weaken the guard: any genuinely visible text block still
 * fails the clip assertion below.
 */
function isVisuallyHidden(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node != null) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
    // An `aria-hidden` ancestor marks the subtree decorative; `aria-hidden`
    // on the element itself does NOT hide it (the visible readout mirrors
    // stay `aria-hidden="true"` yet must still be checked for clipping).
    if (node !== el && node.getAttribute('aria-hidden') === 'true') return true;
    node = node.parentElement;
  }
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const tiny = rect.width <= 2 && rect.height <= 2;
  const clipped =
    style.clipPath !== 'none' ||
    (style.clip !== 'auto' && style.clip !== 'none' && style.clip !== '');
  if (
    style.position === 'absolute' &&
    tiny &&
    (style.overflowX === 'hidden' || style.overflowY === 'hidden') &&
    clipped
  ) {
    return true;
  }
  return false;
}

function expectTextBlocksUnclipped(context: string): void {
  const blocks = Array.from(
    document.querySelectorAll(
      'p, h1, h2, h3, [role="heading"], [role="status"]',
    ),
  ).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      isPainted(el) &&
      !isVisuallyHidden(el) &&
      getComputedStyle(el).overflowY !== 'auto' &&
      getComputedStyle(el).overflowY !== 'scroll',
  );
  expect(
    blocks.length,
    `${context} expected text blocks to exist`,
  ).toBeGreaterThan(0);
  for (const el of blocks) {
    expect(
      el.scrollHeight,
      `${context} clipped text: ${describeEl(el)} scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}`,
    ).toBeLessThanOrEqual(el.clientHeight + 1);
  }
}

type EmptyState =
  | { kind: 'library'; copies: Array<HTMLElement>; ctas: Array<HTMLElement> }
  | { kind: 'queue'; copies: Array<HTMLElement>; ctas: Array<HTMLElement> };

/** The empty-state surface showing right now (library notice or queue empty). */
function currentEmptyState(): EmptyState | null {
  const libCopy = Array.from(document.querySelectorAll('p')).find((p) =>
    (p.textContent ?? '').includes('There is no music in your library'),
  );
  if (libCopy instanceof HTMLElement && isPainted(libCopy)) {
    const copies: Array<HTMLElement> = [libCopy];
    const status = libCopy.closest('[role="status"]');
    const sub =
      status instanceof HTMLElement ? status.querySelector('div') : null;
    if (sub instanceof HTMLElement && isPainted(sub)) copies.push(sub);
    const ctas = Array.from(document.querySelectorAll('a, button')).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement &&
        isPainted(el) &&
        (el.textContent ?? '').includes('add your music here'),
    );
    return { kind: 'library', copies, ctas };
  }
  const queueBig = Array.from(document.querySelectorAll('div')).find((div) =>
    (div.textContent ?? '').trim().startsWith('Queue is empty'),
  );
  if (queueBig instanceof HTMLElement && isPainted(queueBig)) {
    const copies: Array<HTMLElement> = [queueBig];
    const small = Array.from(document.querySelectorAll('div')).find((div) =>
      (div.textContent ?? '').includes('Import music to get started'),
    );
    if (small instanceof HTMLElement && isPainted(small)) copies.push(small);
    const ctas = Array.from(document.querySelectorAll('button')).filter(
      (el): el is HTMLButtonElement =>
        el instanceof HTMLElement &&
        isPainted(el) &&
        (el.textContent ?? '').includes('Add tracks to queue'),
    );
    return { kind: 'queue', copies, ctas };
  }
  return null;
}

function expectCtaInViewport(cta: HTMLElement, context: string): void {
  const r = rectOf(cta);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ctaW = r.right - r.left;
  const ctaH = r.bottom - r.top;
  // Zero-sized CTA is never reachable.
  expect(
    ctaW > 0 && ctaH > 0,
    `${context} CTA zero-sized: ${describeEl(cta)} ${JSON.stringify(r)} vs viewport ${vw}x${vh}`,
  ).toBe(true);

  // Nearest scrolling ancestor (first parent with auto/scroll overflow).
  let scroller: HTMLElement | null = null;
  const intermediates: Array<HTMLElement> = [];
  let node = cta.parentElement;
  while (node != null) {
    const style = getComputedStyle(node);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') break;
    intermediates.push(node);
    node = node.parentElement;
  }
  // `node` is the first scrolling candidate (or null when the loop ran out).
  if (node instanceof HTMLElement) scroller = node;

  // Collect violations first; the single unconditional assertion at the end
  // keeps `vitest/no-conditional-expect` quiet without losing teeth: any
  // broken condition pushes a message and fails the suite.
  const violations: Array<string> = [];
  if (scroller != null) {
    const sRect = rectOf(scroller);
    // Content-coordinate offset of the CTA inside the scroller: viewport
    // rects differ by the current scroll position, so add it back to get
    // the position within the full scrollable extent.
    const contentTop = r.top - sRect.top + scroller.scrollTop;
    const contentLeft = r.left - sRect.left + scroller.scrollLeft;
    const detail =
      `${context} CTA scroll-reachable: ${describeEl(cta)} ${JSON.stringify(r)} ` +
      `in ${describeEl(scroller)} rect=${JSON.stringify(sRect)} ` +
      `scrollTop=${scroller.scrollTop} scrollLeft=${scroller.scrollLeft} ` +
      `scrollExtent=${scroller.scrollWidth}x${scroller.scrollHeight} ` +
      `client=${scroller.clientWidth}x${scroller.clientHeight} ` +
      `contentTop=${contentTop.toFixed(2)} contentLeft=${contentLeft.toFixed(2)} ` +
      `size=${ctaW.toFixed(2)}x${ctaH.toFixed(2)} vs viewport ${vw}x${vh}`;
    // (b) A non-scrolling ancestor between the CTA and its scroller that
    // clips it means scrolling can never reveal it - fail.
    for (const anc of intermediates) {
      const style = getComputedStyle(anc);
      const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
      const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
      if (!clipsX && !clipsY) continue;
      const ar = rectOf(anc);
      const outsideX = r.left < ar.left - 1 || r.right > ar.right + 1;
      const outsideY = r.top < ar.top - 1 || r.bottom > ar.bottom + 1;
      if ((clipsX && outsideX) || (clipsY && outsideY)) {
        violations.push(
          `${detail} clipped by non-scrolling ancestor ${describeEl(anc)} ${JSON.stringify(ar)} overflow=${style.overflowX}/${style.overflowY}`,
        );
      }
    }
    // (a) Inside the scroller's scrollable extent: scrolling brings it
    // into view, so below-the-fold is reachable, not cut off.
    if (
      !(
        contentTop >= -1 &&
        contentTop + ctaH <= scroller.scrollHeight + 1 &&
        contentLeft >= -1 &&
        contentLeft + ctaW <= scroller.scrollWidth + 1
      )
    ) {
      violations.push(`${detail} outside scrollable extent`);
    }
    // When currently on screen, it must also not be occluded.
    const onScreen =
      r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1;
    if (onScreen) {
      const hit = document.elementFromPoint(
        (r.left + r.right) / 2,
        (r.top + r.bottom) / 2,
      );
      if (!(hit != null && cta.contains(hit))) {
        violations.push(
          `${detail} CTA occluded: centre hits ${hit != null ? describeEl(hit) : 'nothing'}`,
        );
      }
    }
  } else {
    // No scrolling ancestor can reach it: the strict in-viewport check
    // applies, so a CTA genuinely cut off by a non-scrolling container
    // still fails.
    if (
      !(r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1)
    ) {
      violations.push(
        `${context} CTA cut off (no scrolling ancestor): ${describeEl(cta)} ${JSON.stringify(r)} vs viewport ${vw}x${vh}`,
      );
    }
    const hit = document.elementFromPoint(
      (r.left + r.right) / 2,
      (r.top + r.bottom) / 2,
    );
    if (!(hit != null && cta.contains(hit))) {
      violations.push(
        `${context} CTA occluded: ${describeEl(cta)} centre hits ${hit != null ? describeEl(hit) : 'nothing'}`,
      );
    }
  }
  expect(violations).toEqual([]);
}

type LineBox = { top: number; bottom: number; words: number };

/** Group one rect per word of `el` into line boxes by vertical position. */
function lineBoxesOf(el: HTMLElement): Array<LineBox> {
  const tops: Array<{ top: number; bottom: number }> = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent ?? '';
    const word = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = word.exec(text)) !== null) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      for (const rc of Array.from(range.getClientRects())) {
        if (rc.width > 0 && rc.height > 0) {
          tops.push({ top: rc.top, bottom: rc.bottom });
        }
      }
    }
  }
  const lines: Array<LineBox> = [];
  for (const w of tops.sort((a, b) => a.top - b.top)) {
    const line = lines.find((l) => Math.abs(l.top - w.top) <= 3);
    if (line == null) {
      lines.push({ top: w.top, bottom: w.bottom, words: 1 });
    } else {
      line.words += 1;
      line.bottom = Math.max(line.bottom, w.bottom);
    }
  }
  return lines;
}

function expectNoOrphanWrap(copy: HTMLElement, context: string): void {
  const lines = lineBoxesOf(copy);
  expect(
    lines.length,
    `${context} no measurable lines in ${describeEl(copy)}`,
  ).toBeGreaterThan(0);
  if (lines.length <= 1) return;
  const last = lines[lines.length - 1] as LineBox;
  expect(
    last.words,
    `${context} orphan wrap: ${describeEl(copy)} ends with 1 word on its own line (lines: ${lines.map((l) => l.words).join('/')})`,
  ).toBeGreaterThan(1);
}

function headerControls(): Array<Element> {
  const header = document.querySelector('header[aria-label="Header"]');
  if (header == null) throw new Error('header[aria-label="Header"] missing');
  return Array.from(
    header.querySelectorAll('a, button, input, kbd, b[aria-current="page"]'),
  );
}

function transportItems(): Array<Element> {
  const region = document.querySelector('[aria-label="Now playing"]');
  if (region == null) throw new Error('[aria-label="Now playing"] missing');
  const prev = region.querySelector('button[aria-label="Previous"]');
  if (prev == null || prev.parentElement == null) {
    throw new Error('transport row (Previous button parent) missing');
  }
  return Array.from(prev.parentElement.children);
}

function searchClusterItems(): Array<Element> {
  const input = document.querySelector('input[aria-label="Search library"]');
  if (input == null) throw new Error('search input missing');
  const pill = input.parentElement;
  if (pill == null) throw new Error('search pill missing');
  return Array.from(pill.children);
}

function tabItems(): Array<Element> {
  const tablist = document.querySelector(
    '[role="tablist"][aria-label="Panel source"]',
  );
  if (tablist == null) {
    throw new Error(
      'tab strip [role="tablist"][aria-label="Panel source"] missing',
    );
  }
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  if (tabs.length === 0) throw new Error('tab strip has no tabs');
  return tabs;
}

type NamedBlock = { name: string; el: Element };

function nowPlayingRegion(): HTMLElement {
  const region = document.querySelector('[aria-label="Now playing"]');
  if (!(region instanceof HTMLElement)) {
    throw new Error('[aria-label="Now playing"] missing');
  }
  return region;
}

/**
 * The now-playing column's Burn-state blocks: cover, title/artist block,
 * format/quality box, effects chips group, seek times, seek slider,
 * transport row. Each mode renders its own variant (the dense header + tech
 * + chips in full, the condensed meta stack + format line in mini); a
 * candidate that is not rendered in the current mode (the Burn strip behind
 * its closed disclosure in mini) is absent and skipped by the checker - only
 * painted blocks participate. The seek row is split into times + slider so a
 * time label sliding under the gutter fails instead of hiding inside one
 * union rect.
 */
function nowPlayingBurnBlocks(): Array<NamedBlock> {
  const region = nowPlayingRegion();
  const blocks: Array<NamedBlock> = [];
  const push = (name: string, el: Element | null): void => {
    if (el != null) blocks.push({ name, el });
  };

  // Cover: the gradient stand-in tile (the cover mock returns no art) or the
  // zoom button wrapping real artwork.
  push(
    'cover',
    region.querySelector(
      '[role="img"][aria-label="Album art"], button[aria-label="View album art"]',
    ),
  );
  // Title/artist block: the dense header in full, the condensed meta stack
  // (parent of the mini title line) in mini.
  push('title-block', region.querySelector('[data-testid="np-header-block"]'));
  const miniTitle = region.querySelector('[data-testid="np-mini-title"]');
  push('title-block', miniTitle?.parentElement ?? null);
  // Format/quality box: the tech strip in full; the untestid'd format line in
  // the mini meta stack (its MarqueeLine siblings carry testids, it does not).
  push(
    'format-box',
    region.querySelector('[aria-label="Technical format information"]'),
  );
  const miniMeta = miniTitle?.parentElement;
  push(
    'format-box',
    miniMeta?.querySelector(':scope > div:not([data-testid])') ?? null,
  );
  // Effects chips group: the dense chips strip in full (parent of the
  // slow/reverb readout), the Burn strip when the details disclosure is open.
  const fxChip = region.querySelector('[title="Slow and reverb state"]');
  push('chips', fxChip?.parentElement ?? null);
  push(
    'chips',
    region.querySelector('[aria-label="Effects: slow and reverb"]'),
  );
  // Seek times + slider.
  const seek = region.querySelector(
    '[aria-label="Seek bar with A-B loop region"]',
  );
  const times = seek?.firstElementChild;
  if (times != null) {
    for (const span of Array.from(times.children)) {
      push('seek-times', span);
    }
  }
  push(
    'seek-slider',
    seek?.querySelector('[role="slider"][aria-label="Seek"]') ?? null,
  );
  // Transport row (the same parent the transportItems() check scopes to).
  const prev = region.querySelector('button[aria-label="Previous"]');
  push('transport', prev?.parentElement ?? null);

  return blocks;
}

/**
 * Pairwise no-overlap across the column's Burn blocks. Unlike
 * `expectNoOverlap` (one flex row's direct items), these blocks nest (the
 * format box lives inside the title block), so containment pairs are skipped:
 * a child inside its parent is layout, not an overlap defect.
 */
function expectBurnBlocksNoOverlap(
  blocks: Array<NamedBlock>,
  context: string,
): void {
  const painted = blocks.filter((b) => isPainted(b.el));
  expect(
    painted.length,
    `${context} burn: no painted now-playing blocks found`,
  ).toBeGreaterThan(0);
  for (let i = 0; i < painted.length; i += 1) {
    for (let j = i + 1; j < painted.length; j += 1) {
      const a = painted[i] as NamedBlock;
      const b = painted[j] as NamedBlock;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ra = rectOf(a.el);
      const rb = rectOf(b.el);
      expect(
        boxesOverlap(ra, rb),
        `${context} burn overlap: ${a.name} ${describeEl(a.el)} ${JSON.stringify(ra)} overlaps ${b.name} ${describeEl(b.el)} ${JSON.stringify(rb)}`,
      ).toBe(false);
    }
  }
}

/**
 * The text lines inside the Burn blocks: titles, format lines, chips, and
 * seek times. Short mock strings never overflow by design (ellipsis only
 * engages on genuinely long text), so any excess here is a cut-off defect,
 * not the MarqueeLine doing its job.
 */
function nowPlayingBurnTextLines(): Array<Element> {
  const region = nowPlayingRegion();
  const lines: Array<Element> = [];
  for (const el of Array.from(
    region.querySelectorAll(
      '[data-testid="np-title"], [data-testid="np-artist"], [data-testid="np-album"], ' +
        '[data-testid="np-mini-title"], [data-testid="np-mini-artist"], ' +
        '[aria-label="Technical format information"], ' +
        '[title="Slow and reverb state"], [title="A-B loop state for this file"]',
    ),
  )) {
    lines.push(el);
  }
  const miniTitle = region.querySelector('[data-testid="np-mini-title"]');
  const miniMeta = miniTitle?.parentElement;
  if (miniMeta != null) {
    for (const div of Array.from(
      miniMeta.querySelectorAll(':scope > div:not([data-testid])'),
    )) {
      lines.push(div);
    }
  }
  const seek = region.querySelector(
    '[aria-label="Seek bar with A-B loop region"]',
  );
  const times = seek?.firstElementChild;
  if (times != null) {
    for (const span of Array.from(times.children)) lines.push(span);
  }
  return lines;
}

function expectBurnTextUnclipped(lines: Array<Element>, context: string): void {
  const painted = lines.filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && isPainted(el) && !isVisuallyHidden(el),
  );
  expect(
    painted.length,
    `${context} burn: no painted now-playing text lines found`,
  ).toBeGreaterThan(0);
  for (const el of painted) {
    const r = rectOf(el);
    expect(
      el.scrollWidth,
      `${context} burn clipped text (width): ${describeEl(el)} ${JSON.stringify(r)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`,
    ).toBeLessThanOrEqual(el.clientWidth + 1);
    expect(
      el.scrollHeight,
      `${context} burn clipped text (height): ${describeEl(el)} ${JSON.stringify(r)} scrollHeight ${el.scrollHeight} > clientHeight ${el.clientHeight}`,
    ).toBeLessThanOrEqual(el.clientHeight + 1);
  }
}

/** The A-B loop row's direct children (LoopControls `.ab-row` in its panel). */
function abRowChildren(): Array<Element> {
  const panel = document.querySelector('#np-loop-panel');
  if (panel == null || panel.firstElementChild == null) {
    throw new Error(
      'A-B loop panel (#np-loop-panel > LoopControls row) missing - the saved loop should auto-open its disclosure',
    );
  }
  return Array.from(panel.firstElementChild.children);
}

function expectScrollbarGutterClean(context: string): { lane: number } {
  const lists = Array.from(
    document.querySelectorAll(
      '[role="listbox"][aria-label="Queue"], [role="listbox"][aria-label="Track list"]',
    ),
  ).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && isPainted(el),
  );
  expect(
    lists.length,
    `${context} expected a visible row list (Queue or Track list)`,
  ).toBeGreaterThan(0);
  const list = lists[0] as HTMLElement;
  const style = getComputedStyle(list);
  expect(
    style.scrollbarGutter,
    `${context} list ${describeEl(list)} scrollbarGutter is ${style.scrollbarGutter}, want stable`,
  ).toBe('stable');
  const rows = list.querySelectorAll('[role="option"]');
  expect(
    rows.length,
    `${context} expected rows in ${describeEl(list)}`,
  ).toBeGreaterThan(0);
  const row = rows[0] as HTMLElement;
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
  // Measured reserved lane for the vertical scrollbar (0 when overlay / idle).
  const lane = list.offsetWidth - list.clientWidth - borderLeft - borderRight;
  const gutterStart = listRect.right - borderRight - Math.max(lane, 0);
  expect(
    rowRect.right,
    `${context} row content overlaps the gutter: row right ${rowRect.right} > gutter start ${gutterStart} (list right ${listRect.right}, lane ${lane})`,
  ).toBeLessThanOrEqual(gutterStart + 1);
  return { lane };
}

/** One-line diagnostic: rect + computed style + short outerHTML. */
function dumpEl(el: Element): string {
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const html = el.outerHTML.slice(0, 200).replace(/\s+/g, ' ');
  return `${describeEl(el)} rect=${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)} display=${style.display} visibility=${style.visibility} position=${style.position} overflow=${style.overflowX}/${style.overflowY} html=${html}`;
}

/**
 * Distinguishes `legitimately absent` (no candidate copy exists in the DOM)
 * from `present but unpainted` (the copy exists yet has no painted size, so
 * `currentEmptyState` skips it). Dumped into the failure message so the next
 * reader can tell whether the selector/predicate is the bug - without
 * guessing. Bounded: first few candidates of each kind only.
 */
function emptyStateMissDetail(): string {
  const lines: Array<string> = [];
  const ps = Array.from(document.querySelectorAll('p'));
  lines.push(`p count=${ps.length}`);
  for (const p of ps.slice(0, 8)) lines.push(`  ${dumpEl(p)}`);
  const queueish = Array.from(document.querySelectorAll('div')).filter((div) =>
    (div.textContent ?? '').includes('Queue is empty'),
  );
  lines.push(`queue-copy div count=${queueish.length}`);
  for (const div of queueish.slice(0, 4)) lines.push(`  ${dumpEl(div)}`);
  const ctas = Array.from(document.querySelectorAll('a, button'));
  lines.push(`a/button count=${ctas.length}`);
  for (const cta of ctas.slice(0, 8)) lines.push(`  ${dumpEl(cta)}`);
  return lines.join('\n');
}

for (const mode of MODES) {
  // Each mode is only tested at or above its OWN native floor: `full`'s floor
  // is FULL_WINDOW_MIN_SIZE (the 900x600 native default enforced in main.rs),
  // so `full` at the 320px mini floor is unreachable - the expected squeeze of
  // a 900-floor two-column grid into 320px is not a defect. Derived from the
  // imported constants; never hardcoded.
  const floor = mode === 'mini' ? MINI_WINDOW_MIN_SIZE : FULL_WINDOW_MIN_SIZE;
  const reachable = VIEWPORTS.filter(
    (vp) => vp.width >= floor.width && vp.height >= floor.height,
  );
  for (const vp of reachable) {
    test(
      `layout floor guard (${mode} @ ${vp.name} ${vp.width}x${vp.height})`,
      { timeout: 60_000 },
      async () => {
        await setMode(mode);
        await page.viewport(vp.width, vp.height);
        await settle();

        const context = `${mode}@${vp.width}x${vp.height}`;
        await expect.element(page.getByRole('banner')).toBeVisible();
        await expect
          .element(page.getByRole('navigation', { name: 'Main navigation' }))
          .toBeVisible();
        await expect
          .element(page.getByRole('textbox', { name: 'Search library' }))
          .toBeVisible();
        await expect
          .element(page.getByRole('region', { name: 'Now playing' }))
          .toBeVisible();

        // --- Phase A: empty library -------------------------------------
        expectNoHorizontalOverflow(`${context} empty`);
        expectTextBlocksUnclipped(`${context} empty`);

        const empty = currentEmptyState();
        if (empty == null) {
          throw new Error(
            `${context} no empty state found\n${emptyStateMissDetail()}`,
          );
        }
        expect(
          empty.ctas.length,
          `${context} empty state (${empty.kind}) has no call-to-action`,
        ).toBeGreaterThan(0);
        for (const copy of empty.copies) {
          expectNoOrphanWrap(copy, `${context} empty`);
        }
        for (const cta of empty.ctas) {
          expectCtaInViewport(cta, `${context} empty`);
        }

        expectNoOverlap(headerControls(), 'header', `${context} empty`);
        expectNoOverlap(transportItems(), 'transport', `${context} empty`);
        expectNoOverlap(searchClusterItems(), 'search', `${context} empty`);

        // --- Phase B: populated Burn state (loop + effects + queue) -------
        await playFirstTrack();
        await populateBurnState();
        await settle();

        expectNoHorizontalOverflow(`${context} populated`);
        expectTextBlocksUnclipped(`${context} populated`);
        expectNoOverlap(headerControls(), 'header', `${context} populated`);
        expectNoOverlap(transportItems(), 'transport', `${context} populated`);
        expectNoOverlap(searchClusterItems(), 'search', `${context} populated`);
        // Full mode renders no queue tab strip (live DOM dump: no
        // #queue-tabpanel, no tabs, at 900x600 and 1200x600), so only mini
        // asserts the strip. Full mode's invariant is the library empty
        // state seen in Phase A.
        if (mode === 'mini') {
          expectNoOverlap(tabItems(), 'tabs', `${context} populated`);
        }
        // Unconditional form of the full-mode empty-kind check: collect the
        // offender, then assert once. Vacuous in mini mode (inapplicable
        // there); in full mode a non-library kind fails the suite.
        const fullModeKindOffenders: Array<string> = [];
        if (mode !== 'mini' && empty.kind !== 'library') {
          fullModeKindOffenders.push(
            `${context} populated full mode has no tab strip; empty state should be the library copy, got ${empty.kind}`,
          );
        }
        expect(fullModeKindOffenders).toEqual([]);
        const { lane } = expectScrollbarGutterClean(`${context} populated`);

        // Burn blocks: the always-rendered pieces must actually be on screen
        // (a missing cover/seek/transport is itself a defect); the
        // conditionally-rendered ones (format line, chips) join when painted.
        const burnBlocks = nowPlayingBurnBlocks();
        for (const name of [
          'cover',
          'title-block',
          'seek-slider',
          'transport',
        ]) {
          expect(
            burnBlocks.some((b) => b.name === name && isPainted(b.el)),
            `${context} populated burn: expected a painted ${name} block`,
          ).toBe(true);
        }
        expectBurnBlocksNoOverlap(burnBlocks, `${context} populated`);
        const burnLines = nowPlayingBurnTextLines();
        expectBurnTextUnclipped(burnLines, `${context} populated`);
        // Full mode additionally asserts the A-B loop row's direct children.
        // The saved loop auto-opens its disclosure (see NowPlaying), so wait
        // for the row: a panel that never opens is itself a defect.
        if (mode === 'full') {
          await waitFor(() => {
            const panel = document.querySelector('#np-loop-panel');
            return panel instanceof HTMLElement && isPainted(panel);
          }, 5000);
          expectNoOverlap(
            abRowChildren(),
            'ab-row',
            `${context} populated burn`,
          );
        }

        // eslint-disable-next-line no-console
        console.log(
          'LAYOUT_FLOOR_GUARD',
          JSON.stringify({
            context,
            emptyKind: empty.kind,
            copies: empty.copies.length,
            ctas: empty.ctas.length,
            gutterLane: lane,
            burnBlocks: burnBlocks.filter((b) => isPainted(b.el)).length,
            burnLines: burnLines.filter((el) => isPainted(el)).length,
          }),
        );
      },
    );
  }
}
