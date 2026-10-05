/**
 * Silent numeric verification of the Dense now-playing surface wiring.
 *
 * Same hard rule as `ab-loop.test-e2e.ts`: never emit audible sound. The
 * browser is launched with `--mute-audio` (vitest.config.ts) and here the graph
 * output is forced to 0 (`setSilentTest`) AND the master gain to 0
 * (`setVolume(0)`). Nothing is asserted by listening: the checks read back
 * `getEffects()`, `getAbLoop()` and sampled `currentTime` values.
 */
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

type Player = (typeof window)['__MUSEEKS_PLAYER'];

function player(): Player {
  return window.__MUSEEKS_PLAYER;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fires a keydown on <body>, bubbling to the document Keybinding listener. */
function pressKey(key: string): void {
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
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

/** Records every backward seek (a loop wrap) over `durationMs`. */
async function recordJumps(durationMs: number): Promise<number> {
  let jumps = 0;
  let previous = player().getCurrentTime();
  const start = performance.now();
  while (performance.now() - start < durationMs) {
    await sleep(20);
    const now = player().getCurrentTime();
    if (now < previous - 0.5) jumps += 1;
    previous = now;
  }
  return jumps;
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

test('Burn steppers drive the real effects engine', { timeout: 30_000 }, async () => {
  await playFirstTrack();
  const p = player();

  await page.getByRole('button', { name: 'Increase reverb' }).click();
  expect(p.getEffectsConfig().reverbIntensity).toBeCloseTo(0.05, 5);

  await page.getByRole('button', { name: 'Decrease speed' }).click();
  expect(p.getEffectsConfig().slow).toBeCloseTo(0.95, 5);

  // eslint-disable-next-line no-console
  console.log(
    'DENSE_EFFECTS_READBACK',
    JSON.stringify(p.getEffectsConfig()),
  );

  await page.getByRole('button', { name: 'Reset reverb to dry' }).click();
  expect(p.getEffectsConfig().reverbIntensity).toBe(0);
  await page.getByRole('button', { name: 'Reset speed to normal' }).click();
  expect(p.getEffectsConfig().slow).toBeCloseTo(1, 5);
});

test('A-B buttons and keyboard drive the real loop engine', { timeout: 30_000 }, async () => {
  await playFirstTrack();
  const p = player();

  p.pause();
  p.setCurrentTime(10);
  await page.getByRole('button', { name: 'Set loop point A' }).click();
  await waitFor(() => p.getAbLoop().startSeconds != null, 3000);
  expect(p.getAbLoop().startSeconds).toBeGreaterThan(9);
  expect(p.getAbLoop().startSeconds).toBeLessThan(11);

  p.setCurrentTime(20);
  await page.getByRole('button', { name: 'Set loop point B' }).click();
  await waitFor(() => p.getAbLoop().endSeconds != null, 3000);
  expect(p.getAbLoop().endSeconds).toBeGreaterThan(19);
  expect(p.getAbLoop().endSeconds).toBeLessThan(21);
  expect(p.getAbLoop().active).toBe(true);

  // eslint-disable-next-line no-console
  console.log('DENSE_AB_READBACK', JSON.stringify(p.getAbLoop()));

  // The LOOPING pill is only rendered while the region is actually running.
  await p.play();
  await waitFor(() => !p.getState().isPaused, 3000);
  await expect.element(page.getByText('● LOOPING')).toBeVisible();

  await page.getByRole('button', { name: 'Clear the A-B region for this track' }).click();
  await waitFor(() => p.getAbLoop().startSeconds === null, 3000);
  expect(p.getAbLoop().endSeconds).toBeNull();

  // Keyboard: [ sets A, \ clears. (Dispatched on <body>, bubbling to the
  // document where the app's Keybinding listens.)
  p.pause();
  p.setCurrentTime(15);
  pressKey('[');
  await waitFor(() => p.getAbLoop().startSeconds != null, 3000);
  expect(p.getAbLoop().startSeconds).toBeGreaterThan(14);
  expect(p.getAbLoop().startSeconds).toBeLessThan(16);
  pressKey('\\');
  await waitFor(() => p.getAbLoop().startSeconds === null, 3000);
});

test(
  'a saved region auto-applies and loops when the track is reopened',
  { timeout: 30_000 },
  async () => {
    await playFirstTrack();
    const p = player();

    await p.setAbPoint('A', 3);
    await p.setAbPoint('B', 6);
    p.pause();
    await sleep(50);

    // Open another track: it has no region, so nothing is armed.
    await getTrackByName(/Majestic Blues/).dblClick();
    await waitFor(() => !p.getState().isPaused, 5000);
    await sleep(50);
    expect(p.getAbLoop().active).toBe(false);

    // Reopen the saved track: it must arm, seek to A, and start looping.
    await getTrackByName(/Whiskey Blues/).dblClick();
    await waitFor(() => p.getAbLoop().active, 3000);

    expect(p.getAbLoop()).toMatchObject({
      active: true,
      startSeconds: 3,
      endSeconds: 6,
    });
    await expect.element(page.getByText('● LOOPING')).toBeVisible();

    const jumps = await recordJumps(8000);
    // eslint-disable-next-line no-console
    console.log('DENSE_REOPEN_JUMPS', JSON.stringify(jumps));
    expect(jumps).toBeGreaterThanOrEqual(2);
  },
);
