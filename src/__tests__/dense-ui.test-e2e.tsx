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
import { page, userEvent } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  getTrackList,
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
  delete (globalThis as { __MUSEEKS_MOCK_RECORD_PLAYS?: unknown })
    .__MUSEEKS_MOCK_RECORD_PLAYS;
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
  'Burn steppers move by 1 unit (0.01× / 1%) and read back truthfully',
  { timeout: 30_000 },
  async () => {
    await playFirstTrack();
    const p = player();

    // One click up from neutral: reverb 0% -> 1%.
    await page.getByRole('button', { name: 'Increase reverb' }).click();
    expect(p.getEffectsConfig().reverbIntensity).toBeCloseTo(0.01, 5);

    // One click down from neutral: speed 1.00× -> 0.99×.
    await page.getByRole('button', { name: 'Decrease speed' }).click();
    expect(p.getEffectsConfig().slow).toBeCloseTo(0.99, 5);

    // A second single click each proves the step is 1 unit, not a 5-grid snap.
    await page.getByRole('button', { name: 'Decrease speed' }).click();
    await page.getByRole('button', { name: 'Increase reverb' }).click();
    expect(p.getEffectsConfig().slow).toBeCloseTo(0.98, 5);
    expect(p.getEffectsConfig().reverbIntensity).toBeCloseTo(0.02, 5);

    // eslint-disable-next-line no-console
    console.log(
      'DENSE_EFFECTS_READBACK',
      JSON.stringify(p.getEffectsConfig()),
    );

    // The chip restates the same values (one source of truth, no drift).
    await expect
      .element(page.getByText(/Slow 0\.98× · Reverb 2% engaged/))
      .toBeVisible();

    // Reset lands on exactly neutral; one click up from neutral reads 1.01×.
    await page.getByRole('button', { name: 'Reset reverb to dry' }).click();
    expect(p.getEffectsConfig().reverbIntensity).toBe(0);
    await page.getByRole('button', { name: 'Reset speed to normal' }).click();
    expect(p.getEffectsConfig().slow).toBeCloseTo(1, 5);
    await page.getByRole('button', { name: 'Increase speed' }).click();
    expect(p.getEffectsConfig().slow).toBeCloseTo(1.01, 5);
  },
);

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

test('the header carries the logo, brand and the Main navigation breadcrumb', async () => {
  await setupScannedLibrary();
  const banner = page.getByRole('banner');

  await expect
    .element(banner.getByRole('img', { name: 'Slowburn logo' }))
    .toBeVisible();
  await expect.element(banner.getByText('Slowburn')).toBeVisible();
  await expect
    .element(banner.getByRole('navigation', { name: 'Main navigation' }))
    .toBeVisible();
});

test('the breadcrumb drives the right-column view stack', async () => {
  await setupScannedLibrary();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });

  // Library (all tracks) is the routed view for /library.
  await expect.element(getTrackList()).toBeInTheDocument();

  const switchView = async (name: 'Queue' | 'All tracks' | 'Artists' | 'Playlists') => {
    await nav.getByRole('button', { name: 'Switch view' }).click();
    await page.getByRole('menuitem', { name }).click();
  };

  // Queue is the stack's default item.
  await switchView('Queue');
  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .toBeVisible();

  // Library > Artists.
  await switchView('Artists');
  await expect
    .element(page.getByRole('heading', { name: 'ARTISTS' }))
    .toBeVisible();

  // Playlists.
  await switchView('Playlists');
  await expect
    .element(page.getByRole('heading', { name: 'PLAYLISTS' }))
    .toBeVisible();

  // Back to Library (all tracks).
  await switchView('All tracks');
  await expect.element(getTrackList()).toBeInTheDocument();
});

test(
  'a wheel notch over a Burn slider moves exactly one step',
  { timeout: 30_000 },
  async () => {
    await playFirstTrack();
    const p = player();

    // Start from exactly neutral so the deltas are unambiguous, and let React
    // re-render before the wheel reads `sliderValue`.
    p.setEffectsConfig({ slow: 1, reverbIntensity: 0, enabled: true });
    await sleep(50);

    const wheel = async (name: RegExp, deltaY: number) => {
      const el = page.getByRole('slider', { name }).element();
      el.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY,
          deltaMode: 0,
          bubbles: true,
          cancelable: true,
        }),
      );
      // Real wheel events are separate turns; let React flush between them.
      await sleep(20);
    };

    // Wheel UP (negative deltaY) raises the value: reverb +1%.
    const reverbBefore = p.getEffectsConfig().reverbIntensity;
    await wheel(/Reverb intensity/, -100);
    expect(p.getEffectsConfig().reverbIntensity).toBeCloseTo(
      reverbBefore + 0.01,
      5,
    );

    // Wheel DOWN (positive deltaY) lowers the value: speed -0.01×.
    const slowBefore = p.getEffectsConfig().slow;
    await wheel(/Playback speed/, 100);
    expect(p.getEffectsConfig().slow).toBeCloseTo(slowBefore - 0.01, 5);

    // A trackpad flick of small deltas accumulates: 3 × 10px is < one notch
    // and must not move the value at all.
    const slowMid = p.getEffectsConfig().slow;
    await wheel(/Playback speed/, 10);
    await wheel(/Playback speed/, 10);
    await wheel(/Playback speed/, 10);
    expect(p.getEffectsConfig().slow).toBeCloseTo(slowMid, 5);

    // Completing the notch (7 more × 10px down) applies at most one step down;
    // a flick must never move more than one step per notch-equivalent.
    for (let i = 0; i < 7; i += 1) await wheel(/Playback speed/, 10);
    const afterFlick = p.getEffectsConfig().slow;
    expect(afterFlick).toBeLessThanOrEqual(slowMid + 1e-9);
    expect(afterFlick).toBeGreaterThanOrEqual(slowMid - 0.01 - 1e-9);

    // A wheel nowhere near a slider changes nothing.
    const noHoverBefore = p.getEffectsConfig().slow;
    document.body.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: 100,
        deltaMode: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(p.getEffectsConfig().slow).toBeCloseTo(noHoverBefore, 5);

    // eslint-disable-next-line no-console
    console.log('DENSE_WHEEL_READBACK', JSON.stringify(p.getEffectsConfig()));
  },
);

test('a saved loop pins the row with the ◆ mark', async () => {
  await playFirstTrack();
  const p = player();

  await p.setAbPoint('A', 3);
  await p.setAbPoint('B', 6);

  await expect
    .element(getTrackByName(/Whiskey Blues/))
    .toHaveTextContent('◆');
});

test('the playing row is magenta and the cursor selection is info blue', async () => {
  await playFirstTrack();

  const selectedRow = getTrackByName(/Majestic Blues/);
  await selectedRow.click();

  const playingRow = getTrackByName(/Whiskey Blues/);

  const playingBorder = getComputedStyle(
    playingRow.element(),
  ).borderLeftColor;
  const selectedBorder = getComputedStyle(
    selectedRow.element(),
  ).borderLeftColor;

  // eslint-disable-next-line no-console
  console.log(
    'DENSE_ROW_COLORS',
    JSON.stringify({ playingBorder, selectedBorder }),
  );

  expect(playingBorder).toBe('rgb(255, 20, 147)');
  expect(selectedBorder).toBe('rgb(59, 130, 246)');
  await expect.element(playingRow).toHaveAttribute('data-is-playing', 'true');
  await expect.element(selectedRow).toHaveAttribute('aria-selected', 'true');
});

test('the status bar restates the effects and the loop state', async () => {
  await playFirstTrack();
  const p = player();

  await p.setAbPoint('A', 3);
  await p.setAbPoint('B', 6);
  await page.getByRole('button', { name: 'Increase reverb' }).click();

  await expect.element(page.getByText('Effects engaged')).toBeVisible();
  await expect.element(page.getByText(/A.B saved/)).toBeVisible();
});

test('a completed listen is recorded exactly once', async () => {
  await playFirstTrack();
  const p = player();
  const recorded = () =>
    (globalThis as { __MUSEEKS_MOCK_RECORD_PLAYS?: Set<string> })
      .__MUSEEKS_MOCK_RECORD_PLAYS;

  // Passing 75% elapsed credits one play (stay below the end so the track
  // does not auto-advance during the test).
  p.setCurrentTime(240);
  await waitFor(() => recorded()?.has('0') === true, 3000);

  // More time updates must not double-count the same listen.
  p.setCurrentTime(250);
  await sleep(200);
  expect(recorded()?.size).toBe(1);
});

test('typed A-B points commit, reject invalid input, and never invert', async () => {
  await playFirstTrack();
  const p = player();

  const fieldA = page.getByRole('textbox', { name: 'Loop point A' });
  const fieldB = page.getByRole('textbox', { name: 'Loop point B' });

  // Type into the field, then blur (the documented commit path).
  const type = async (field: typeof fieldA, text: string) => {
    await field.click();
    await userEvent.keyboard(text);
    await sleep(50);
    (field.element() as HTMLInputElement).blur();
    await sleep(120);
  };

  // A valid typed value commits through the engine.
  await type(fieldA, '0:10');
  await waitFor(() => p.getAbLoop().startSeconds === 10, 3000);
  expect(p.getAbLoop().startSeconds).toBeCloseTo(10, 3);

  // A fractional value commits too.
  await type(fieldB, '0:20.500');
  await waitFor(() => p.getAbLoop().endSeconds === 20.5, 3000);

  // Invalid input leaves the loop untouched and marks the field.
  await type(fieldB, '5:60');
  await expect.element(fieldB).toHaveAttribute('aria-invalid', 'true');
  expect(p.getAbLoop().endSeconds).toBeCloseTo(20.5, 3);

  // B at/behind A must not invert the region: the engine pushes A back.
  await type(fieldB, '0:08');
  await waitFor(() => p.getAbLoop().endSeconds === 8, 3000);
  const loop = p.getAbLoop();
  expect(loop.startSeconds).not.toBeNull();
  expect(loop.endSeconds).not.toBeNull();
  expect(loop.startSeconds!).toBeLessThan(loop.endSeconds!);

  // Escape reverts the draft without changing the loop.
  const settled = p.getAbLoop().endSeconds;
  await fieldB.click();
  await userEvent.keyboard('0:42');
  await sleep(50);
  await userEvent.keyboard('{Escape}');
  await sleep(100);
  expect(p.getAbLoop().endSeconds).toBe(settled);
});
