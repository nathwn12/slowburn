/**
 * A-B typed-point focus contract (owner bug hunt, slowburn A-B):
 *
 *  1. Focus churn must not re-apply: clicking INTO a point field and back OUT
 *     with no edit leaves the loop state AND the playback position untouched.
 *  2. No commit while typing: a (partial or whole) value sitting in a focused
 *     field commits nothing and seeks nowhere; the commit lands only on blur
 *     or Enter, with the value the user finished typing.
 *
 * The A/B buttons and the `[` / `]` keys stay instant - that path is
 * untouched. Only the TYPED fields move to blur/Enter.
 *
 * Silent: the browser is launched with `--mute-audio` and playback is
 * silenced via `setSilentTest` + volume 0. Helpers are copied into this file
 * rather than imported across test files, per repo convention.
 */
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from '../../__tests__/e2e-helpers';

beforeEachSetup();

type Player = (typeof window)['__MUSEEKS_PLAYER'];

function player(): Player {
  return window.__MUSEEKS_PLAYER;
}

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

beforeEach(() => {
  delete (globalThis as { __MUSEEKS_MOCK_AB_LOOPS?: unknown })
    .__MUSEEKS_MOCK_AB_LOOPS;
});

afterEach(() => {
  player().pause();
});

/** Scan the mock library, silence the graph, and play the first track. */
async function playFirstTrack(): Promise<void> {
  await setupScannedLibrary();
  const p = player();
  p.getEffects().setSilentTest(true);
  p.setVolume(0);
  await getTrackByName(/Whiskey Blues/).dblClick();
  await waitFor(() => !p.getState().isPaused, 5000);
}

/** Type into a loop field and blur it (the documented commit path). */
async function commitField(
  field: ReturnType<typeof page.getByRole>,
  text: string,
): Promise<void> {
  await field.click();
  await userEvent.keyboard(text);
  await sleep(50);
  (field.element() as HTMLInputElement).blur();
  await sleep(120);
}

test(
  'focus churn on an A-B point field re-applies nothing and seeks nowhere',
  { timeout: 60_000 },
  async () => {
    await playFirstTrack();
    const p = player();
    await p.clearAbLoop();
    // Paused: the playback position is stable, so any seek is observable.
    p.pause();
    await openDisclosure('A-B loop options');

    const fieldA = page.getByRole('textbox', { name: 'Loop point A' });
    const fieldB = page.getByRole('textbox', { name: 'Loop point B' });
    await commitField(fieldA, '0:10');
    await commitField(fieldB, '0:20');
    await waitFor(
      () =>
        p.getAbLoop().startSeconds === 10 && p.getAbLoop().endSeconds === 20,
      3000,
    );
    // The B commit seeks onto B; that is the settled position.
    const settled = p.getCurrentTime();
    expect(Math.abs(settled - 20)).toBeLessThan(1.5);

    // Click INTO A and back OUT with no edit: loop and position untouched.
    await fieldA.click();
    await sleep(50);
    (fieldA.element() as HTMLInputElement).blur();
    await sleep(300);

    expect(p.getAbLoop().startSeconds).toBe(10);
    expect(p.getAbLoop().endSeconds).toBe(20);
    expect(Math.abs(p.getCurrentTime() - settled)).toBeLessThan(1);
  },
);

test(
  'a typed A-B value commits nothing while focused and commits on blur',
  { timeout: 60_000 },
  async () => {
    await playFirstTrack();
    const p = player();
    await p.clearAbLoop();
    p.pause();
    await openDisclosure('A-B loop options');

    const fieldA = page.getByRole('textbox', { name: 'Loop point A' });
    const before = p.getCurrentTime();

    // Mid-entry: `0:1` parses on its own (1 second). Past any idle window it
    // must still have committed nothing and sought nowhere.
    await fieldA.click();
    await userEvent.keyboard('0:1');
    await sleep(800);
    expect(p.getAbLoop().startSeconds).toBeNull();
    expect(Math.abs(p.getCurrentTime() - before)).toBeLessThan(1);

    // Finish the entry; still focused, still nothing.
    await userEvent.keyboard('0');
    await sleep(800);
    expect(p.getAbLoop().startSeconds).toBeNull();
    expect(
      (fieldA.element() as HTMLInputElement) === document.activeElement,
    ).toBe(true);

    // Blur commits the finished value and seeks there.
    (fieldA.element() as HTMLInputElement).blur();
    await waitFor(() => p.getAbLoop().startSeconds === 10, 3000);
    expect(p.getAbLoop().startSeconds).toBe(10);
    expect(Math.abs(p.getCurrentTime() - 10)).toBeLessThan(1.5);
  },
);

test(
  'a typed A-B value commits nothing while focused and commits on Enter',
  { timeout: 60_000 },
  async () => {
    await playFirstTrack();
    const p = player();
    await p.clearAbLoop();
    p.pause();
    await openDisclosure('A-B loop options');

    const fieldB = page.getByRole('textbox', { name: 'Loop point B' });
    const before = p.getCurrentTime();

    await fieldB.click();
    await userEvent.keyboard('0:20');
    await sleep(800);
    expect(p.getAbLoop().endSeconds).toBeNull();
    expect(Math.abs(p.getCurrentTime() - before)).toBeLessThan(1);

    await userEvent.keyboard('{Enter}');
    await waitFor(() => p.getAbLoop().endSeconds === 20, 3000);
    expect(p.getAbLoop().endSeconds).toBe(20);
    expect(Math.abs(p.getCurrentTime() - 20)).toBeLessThan(1.5);
  },
);
