/**
 * A-B typed-field commit: typing a time into the A (or B) field commits
 * NOTHING while the field holds focus - the commit lands on blur or Enter,
 * setting the point AND seeking the playhead there. The owner's ask, verbatim
 * (slowburn A-B bug hunt): "while the field holds focus nothing commits and
 * nothing re-applies."
 *
 * Each test fills the field once (a single input event), waits past the old
 * idle-commit window to prove nothing fired, and only then commits
 * explicitly. The A/B buttons and the `[` / `]` keys stay instant - that path
 * is covered elsewhere and untouched here.
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

test(
  'typing a time into A commits nothing until blur, then sets and seeks',
  { timeout: 60_000 },
  async () => {
    await playFirstTrack();
    const p = player();
    await p.clearAbLoop();
    p.pause();
    await openDisclosure('A-B loop options');

    const fieldA = page.getByRole('textbox', { name: 'Loop point A' });
    // One fill, then hands off the keyboard: no Enter, no blur, no button.
    await fieldA.fill('0:05');

    // Past any idle window: still untouched, focus still inside the field.
    await sleep(800);
    expect(p.getAbLoop().startSeconds).toBeNull();
    expect(
      (fieldA.element() as HTMLInputElement) === document.activeElement,
    ).toBe(true);

    // Blur commits the finished value...
    (fieldA.element() as HTMLInputElement).blur();
    await waitFor(() => p.getAbLoop().startSeconds === 5, 5000);
    expect(p.getAbLoop().startSeconds).toBe(5);
    // ...and the playhead went there.
    expect(Math.abs(p.getCurrentTime() - 5)).toBeLessThan(1.5);
  },
);

test(
  'typing a time into B commits nothing until Enter, then sets and seeks',
  { timeout: 60_000 },
  async () => {
    await playFirstTrack();
    const p = player();
    await p.clearAbLoop();
    // Paused: seeking exactly onto B while playing would let the loop ticker
    // wrap back to A before the position is read. The commit and the seek
    // under test are the same either way.
    p.pause();
    await openDisclosure('A-B loop options');

    const fieldB = page.getByRole('textbox', { name: 'Loop point B' });
    // One fill, then hands off the keyboard: no Enter, no blur, no button.
    await fieldB.fill('0:20');

    // Past any idle window: still untouched, focus still inside the field.
    await sleep(800);
    expect(p.getAbLoop().endSeconds).toBeNull();
    expect(
      (fieldB.element() as HTMLInputElement) === document.activeElement,
    ).toBe(true);

    // Enter commits the finished value...
    await userEvent.keyboard('{Enter}');
    await waitFor(() => p.getAbLoop().endSeconds === 20, 5000);
    expect(p.getAbLoop().endSeconds).toBe(20);
    // ...and the playhead went there.
    expect(Math.abs(p.getCurrentTime() - 20)).toBeLessThan(1.5);
  },
);

test(
  'typing garbage into A marks it invalid and commits nothing without Enter',
  { timeout: 60_000 },
  async () => {
    await playFirstTrack();
    const p = player();
    await p.clearAbLoop();
    await openDisclosure('A-B loop options');

    const fieldA = page.getByRole('textbox', { name: 'Loop point A' });
    await fieldA.fill('xyz');

    // Past the old instant-commit idle window: still marked, still untouched.
    await sleep(700);
    await expect.element(fieldA).toHaveAttribute('aria-invalid', 'true');
    expect(p.getAbLoop().startSeconds).toBeNull();
  },
);
