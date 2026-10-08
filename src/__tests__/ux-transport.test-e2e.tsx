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

test('the A-B tag docks to the region start instead of floating centred', async () => {
  await playFirstTrack();
  const p = player();
  await p.setAbPoint('A', 3);
  await p.setAbPoint('B', 6);

  // Exact text: the details panel also renders `SAVED A-B LOOP ...`, which a
  // loose regex matches (strict-mode violation). The tag span is the only
  // element whose full text is exactly `A-B LOOP`.
  const tag = page.getByText('A–B LOOP', { exact: true });
  await expect.element(tag).toBeVisible();
  const style = getComputedStyle(tag.element());
  expect(style.left).toBe('0px');
  expect(style.transform).toBe('none');
});
