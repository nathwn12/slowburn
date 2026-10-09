/**
 * Narrow-column geometry + occlusion guard for the Dense now-playing column.
 *
 * Why geometry and not `toBeVisible()`: the metadata block can be present,
 * non-empty and still have **zero painted height** — the flex column shrinks
 * it to nothing, after which the following transport card (opaque
 * `background: var(--surface)`) paints over its overflowing contents. Tree
 * reads and `toBeVisible()` (non-empty bbox + visibility) are blind to both the
 * collapse and sibling occlusion, which is exactly how this shipped
 * (`Slowburn-ops/ui/narrow-column-collapse.md` §2). This test therefore reads
 * `getBoundingClientRect()` and hit-tests with `document.elementFromPoint`.
 *
 * Full mode is requested because that is the layout the audit measured: it
 * carries the 26px status bar the height arithmetic assumes, so the smallest
 * viewports genuinely overflow the now-playing column.
 *
 * Silent: the browser is launched with `--mute-audio`, and here the graph
 * output is forced to 0 (`setSilentTest`) AND the master gain to 0
 * (`setVolume(0)`).
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

const SEL_COLUMN = '[aria-label="Now playing"]';
const SEL_TECH = '[aria-label="Technical format information"]';
const SEL_SEEK = '[aria-label="Seek bar with A-B loop region"]';

/** Declared app floor, plus the two sizes the audit named as still broken. */
const VIEWPORTS = [
  { width: 720, height: 480 },
  { width: 800, height: 560 },
  { width: 900, height: 600 },
] as const;

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

/** Two frames plus a beat: lets React and the ResizeObservers settle. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await sleep(60);
}

/** Force Full mode (the surface the audit's height arithmetic measured). */
async function setMode(mode: 'minimal' | 'full'): Promise<void> {
  const bridge = (await import('../lib/bridge-config')) as unknown as {
    default: { config: { ui_mode: 'minimal' | 'full' } };
  };
  bridge.default.config = { ...bridge.default.config, ui_mode: mode };

  const { default: queryClient } = await import('../lib/query-client');
  const { configQuery } = await import('../lib/queries');
  await queryClient.invalidateQueries({ queryKey: configQuery.queryKey });
}

async function playFirstTrack(): Promise<void> {
  await setupScannedLibrary();
  const p = window.__MUSEEKS_PLAYER;
  p.getEffects().setSilentTest(true);
  p.setVolume(0);
  await getTrackByName(/Whiskey Blues/).dblClick();
  await waitFor(() => !p.getState().isPaused, 5000);
}

afterEach(() => {
  window.__MUSEEKS_PLAYER.pause();
});

type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
};

function boxOf(selector: string): Box | null {
  const el = document.querySelector(selector);
  if (el == null) return null;
  const b = el.getBoundingClientRect();
  return {
    left: b.left,
    top: b.top,
    right: b.right,
    bottom: b.bottom,
    width: b.width,
    height: b.height,
    cx: b.left + b.width / 2,
    cy: b.top + b.height / 2,
  };
}

/**
 * Hit-tests the centre of the node. Returns `self` when the topmost painted
 * element at that point is the node (or one of its descendants/ancestors);
 * otherwise the id of whatever is covering it (`occluded` is the failure this
 * guard exists for).
 */
function hitOf(selector: string): string {
  const el = document.querySelector(selector);
  if (el == null) return 'missing';
  const b = el.getBoundingClientRect();
  if (b.width < 1 || b.height < 1) return 'empty';
  const hit = document.elementFromPoint(
    b.left + b.width / 2,
    b.top + b.height / 2,
  );
  if (hit == null) return 'none';
  if (el.contains(hit) || hit.contains(el)) return 'self';
  return hit.getAttribute('aria-label') ?? hit.tagName.toLowerCase();
}

function columnOverflow(): {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
} {
  const el = document.querySelector(SEL_COLUMN) as HTMLElement;
  return {
    scrollTop: el.scrollTop,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  };
}

for (const vp of VIEWPORTS) {
  test(
    `now-playing metadata is painted, unoccluded and reachable at ${vp.width}x${vp.height}`,
    { timeout: 30_000 },
    async () => {
      await setMode('full');
      await playFirstTrack();

      await page.viewport(vp.width, vp.height);
      await settle();

      const col = boxOf(SEL_COLUMN);
      const tech = boxOf(SEL_TECH);
      const seek = boxOf(SEL_SEEK);
      // eslint-disable-next-line no-console
      console.log(
        'NARROW_COLUMN',
        JSON.stringify({
          vp,
          col,
          tech,
          seek,
          overflow: columnOverflow(),
          techHit: hitOf(SEL_TECH),
          seekHit: hitOf(SEL_SEEK),
        }),
      );

      expect(col).not.toBeNull();
      expect(tech).not.toBeNull();
      expect(seek).not.toBeNull();
      if (col == null || tech == null || seek == null) return;

      // 1. Both landmarks have real painted size. The collapse shipped with
      //    the metadata at height 0 while the a11y tree still reported it.
      expect(tech.width, 'metadata width').toBeGreaterThan(1);
      expect(tech.height, 'metadata height').toBeGreaterThan(1);
      expect(seek.width, 'seek width').toBeGreaterThan(1);
      expect(seek.height, 'seek height').toBeGreaterThan(1);

      // 2. Both lie inside the now-playing scroll container's box.
      expect(tech.top, 'metadata top').toBeGreaterThanOrEqual(col.top - 1);
      expect(tech.bottom, 'metadata bottom').toBeLessThanOrEqual(
        col.bottom + 1,
      );
      expect(seek.top, 'seek top').toBeGreaterThanOrEqual(col.top - 1);
      expect(seek.bottom, 'seek bottom').toBeLessThanOrEqual(col.bottom + 1);

      // 3. Non-occlusion: the topmost painted element at the centre is the
      //    node itself, never the transport card painting over it.
      expect(hitOf(SEL_TECH), 'metadata hit-test').toBe('self');
      expect(hitOf(SEL_SEEK), 'seek hit-test').toBe('self');

      // 4. Reachability. Reset to the column start: the metadata must be
      //    genuinely present at rest, not merely clipped below the fold.
      //    Scrolling to the end clamps at the maximum: with an overflowing
      //    stack that maximum is above zero (the content is scrollable-to,
      //    not hidden); without overflow it stays at zero.
      const el = document.querySelector(SEL_COLUMN) as HTMLElement;
      el.scrollTop = 0;
      await settle();
      expect(hitOf(SEL_TECH), 'metadata reachable at scrollTop 0').toBe('self');
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = el.scrollHeight;
      await settle();
      expect(el.scrollTop, 'column scrolls to its end').toBe(maxScroll);
    },
  );
}
