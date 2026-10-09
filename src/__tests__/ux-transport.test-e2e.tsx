/**
 * Transport/player-surface UX gate: keyboard-complete seek, no rendered debug
 * text, and the Burn readout exposed to assistive tech.
 *
 * Black-box only: role/name selectors against the live shell, no component
 * imports. Never emits audible sound: the browser runs with `--mute-audio`
 * (vitest.config.ts) and here the graph output is forced to 0
 * (`setSilentTest`) AND the master gain to 0 (`setVolume(0)`), exactly like
 * `dense-ui.test-e2e.tsx`.
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';

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

/** The dense seek slider inside the Now-playing column. */
function denseSeek() {
  return page
    .getByRole('region', { name: 'Now playing' })
    .getByRole('slider', { name: 'Seek' });
}

test('the stop-after-current toggle never renders shortcode text', async () => {
  await setupScannedLibrary();
  const item = page.getByRole('menuitem', { name: /Stop after current/i });
  await expect.element(item).toBeVisible();

  // The raw `:white_check_mark:` string must never reach the screen, armed
  // or disarmed. Arm it first: the shortcode only ever rendered while armed.
  const before = item.element().getAttribute('data-on');
  if (before !== 'true') await item.click();
  await waitFor(() => item.element().getAttribute('data-on') === 'true', 3000);
  await expect.element(item).toHaveAttribute('data-on', 'true');
  await expect
    .element(page.getByText(':white_check_mark:', { exact: false }))
    .not.toBeInTheDocument();
  // The accessible name stays text-only (no glyph leaks into the name).
  expect(item.element().getAttribute('aria-label')).toMatch(
    /Stop after current/i,
  );

  // Restore the fresh disarmed state for later tests in this file.
  if (before !== 'true') await item.click();
  await waitFor(
    () => (item.element().getAttribute('data-on') ?? '') === (before ?? ''),
    3000,
  );
  await expect.element(item).toHaveAttribute('data-on', before ?? '');
});

test(
  'the dense seek slider is keyboard-operable with live slider semantics',
  { timeout: 30_000 },
  async () => {
    await playFirstTrack();
    const p = player();
    p.pause();
    p.setCurrentTime(100);
    await sleep(100);

    const seek = denseSeek();
    await expect.element(seek).toBeVisible();
    const max = String(Math.round(p.getTrack()?.duration ?? 0));
    await waitFor(
      () => seek.element().getAttribute('aria-valuenow') === '100',
      3000,
    );
    await expect.element(seek).toHaveAttribute('aria-valuemin', '0');
    await expect.element(seek).toHaveAttribute('aria-valuemax', max);
    await expect.element(seek).toHaveAttribute('aria-valuenow', '100');
    expect(seek.element().getAttribute('aria-valuetext')).toMatch(/of/);

    seek.element().focus();
    expect(document.activeElement).toBe(seek.element());

    // ArrowRight seeks forward through the real engine position.
    const at = p.getCurrentTime();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => p.getCurrentTime() > at, 3000);
    expect(p.getCurrentTime()).toBeGreaterThan(at);

    // ArrowLeft seeks back.
    const ahead = p.getCurrentTime();
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => p.getCurrentTime() < ahead, 3000);

    // Home jumps to the start, End to the reachable end of the track.
    await userEvent.keyboard('{Home}');
    await waitFor(() => p.getCurrentTime() < 1, 3000);
    const atHome = p.getCurrentTime();
    await userEvent.keyboard('{End}');
    // The e2e stub media has no playable bytes, so Chromium clamps a seek
    // past its seekable range (a probe measured `setCurrentTime(300)` reading
    // back 240.024 on the 300s mock track). Assert the jump lands at that
    // reachable end rather than the metadata duration.
    await waitFor(() => p.getCurrentTime() > atHome + 50, 3000);
    expect(p.getCurrentTime()).toBeGreaterThan(atHome + 50);
    expect(p.getTrack()?.title).toMatch(/Whiskey/);

    // The live value follows the engine position.
    expect(seek.element().getAttribute('aria-valuenow')).not.toBeNull();
  },
);

test('the Burn sliders expose their value to assistive tech', async () => {
  await playFirstTrack();

  // The Burn strip lives behind the `Details and effects` disclosure.
  const toggle = page.getByRole('button', { name: 'Details and effects' });
  if (
    (toggle.element() as HTMLButtonElement).getAttribute('aria-expanded') !==
    'true'
  ) {
    await toggle.click();
  }

  // Drive both sliders off neutral so the readouts are unambiguous, then
  // prove the value is a real slider value, not only a visual span.
  await page.getByRole('button', { name: 'Increase speed' }).click();
  await page.getByRole('button', { name: 'Increase reverb' }).click();

  const speed = page.getByRole('slider', {
    name: 'Playback speed, pitch follows',
  });
  await expect.element(speed).toBeVisible();
  await expect.element(speed).toHaveAttribute('aria-valuetext', '1.01×');

  const reverb = page.getByRole('slider', { name: 'Reverb intensity' });
  await expect.element(reverb).toBeVisible();
  await expect.element(reverb).toHaveAttribute('aria-valuetext', '1%');

  // The visually-hidden live mirrors carry the same readouts: query the
  // live regions directly (getByText would also match the visual spans).
  const speedText = speed.element().getAttribute('aria-valuetext') ?? '';
  const reverbText = reverb.element().getAttribute('aria-valuetext') ?? '';
  const liveTexts = Array.from(
    document.querySelectorAll('[role="status"]'),
    (el) => el.textContent ?? '',
  );
  expect(liveTexts).toContain(speedText);
  expect(liveTexts).toContain(reverbText);
});

test('the A-B region band renders alone without overlapping the seek times', async () => {
  await playFirstTrack();
  const p = player();
  await p.setAbPoint('A', 3);
  await p.setAbPoint('B', 6);

  const seekGroup = page.getByRole('group', {
    name: 'Seek bar with A-B loop region',
  });

  // The floating pill is gone: no exact `A-B LOOP` text inside the seek
  // group (the details `SAVED A-B LOOP` header lives outside it).
  await expect
    .element(seekGroup.getByText('A-B LOOP', { exact: true }))
    .not.toBeInTheDocument();

  // (a) The hatched band is the sole indicator: wait for it, then read its
  // region left/width (3s-6s of the 300s mock track = 1% left, 1% wide).
  await waitFor(() => {
    const group = document.querySelector(
      '[aria-label="Seek bar with A-B loop region"]',
    );
    if (group == null) return false;
    return Array.from(group.querySelectorAll('div')).some(
      (el) =>
        (el as HTMLElement).style.left !== '' &&
        (el as HTMLElement).style.width !== '',
    );
  }, 3000);
  const groupEl = seekGroup.element() as HTMLElement;
  const band = Array.from(groupEl.querySelectorAll('div')).find(
    (el) =>
      (el as HTMLElement).style.left !== '' &&
      (el as HTMLElement).style.width !== '',
  ) as HTMLElement | undefined;
  expect(band).not.toBeUndefined();
  if (band == null) return;
  expect(band.style.left).toBe('1%');
  expect(band.style.width).toBe('1%');
  expect(band.style.display).toBe('block');

  // (b) Nothing overlaps the seek times row: the topmost element at its
  // centre is inside the times row itself (the removed pill floated at
  // top:-16px into this row).
  const times = groupEl.firstElementChild as HTMLElement;
  const rect = times.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.height).toBeGreaterThan(0);
  const hit = document.elementFromPoint(
    rect.left + rect.width / 2,
    rect.top + rect.height / 2,
  );
  expect(hit).not.toBeNull();
  expect(times.contains(hit)).toBe(true);

  // The band sits below the times row, never intersecting it.
  const bandRect = band.getBoundingClientRect();
  expect(bandRect.top).toBeGreaterThanOrEqual(rect.bottom - 1);

  // Passing-run capture for pixel review (not an assertion): widen the
  // saved region so the band-only indicator is unmistakable (90s-240s of
  // the 300s mock track = 30% left, 50% wide), then screenshot.
  await p.setAbPoint('A', 90);
  await p.setAbPoint('B', 240);
  await waitFor(() => {
    const group = document.querySelector(
      '[aria-label="Seek bar with A-B loop region"]',
    );
    if (group == null) return false;
    return Array.from(group.querySelectorAll('div')).some(
      (el) =>
        (el as HTMLElement).style.left === '30%' &&
        (el as HTMLElement).style.width === '50%',
    );
  }, 3000);
  await page.screenshot({
    path: '../components/__tests__/__screenshots__/ab-band-only.png',
  });
});
