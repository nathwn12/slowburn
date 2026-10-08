/**
 * S5 additive QOL (engine) acceptance spec - RED by design.
 *
 * Covers the four additive S5 behaviours as black-box assertions using only
 * public selectors/routes (no component imports):
 *
 *   1. Drag-drop audio files anywhere onto the main area enqueues them
 *      (today DropzoneImport only accepts folders: "Drop folders anywhere").
 *   2. A stop control offers "Stop after current".
 *   3. The single HTMLAudioElement preloads best-effort gapless
 *      (`preload="auto"`).
 *   4. ReplayGain tag data is displayed when present.
 *
 * The S5 builder turns these green without touching EffectsController/A-B
 * loop, player/minimal-queue e2e, or existing DropzoneImport folder import.
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

// Dropping audio files anywhere over the main area must offer queueing them,
// not just the folder-import dropzone ("Drop folders anywhere").
test('dropping audio files onto the main area offers to queue them', async () => {
  await expect
    .element(page.getByText(/Drop audio files.*queue/i))
    .toBeVisible();
});

// The stop control must expose a "Stop after current" action.
test('stop offers stop-after-current', async () => {
  await expect
    .element(page.getByRole('menuitem', { name: /Stop after current/i }))
    .toBeVisible();
});

// Best-effort gapless: the single audio element preloads with preload="auto".
test('audio element preloads best-effort gapless', async () => {
  const el = document.querySelector('audio[preload="auto"]');
  expect(el).not.toBeNull();
});

// ReplayGain tag data is surfaced in the UI when the track carries it.
test('ReplayGain tag is displayed when present', async () => {
  // Precondition the title states: load a track so the queue surface (which
  // names the playing track's ReplayGain value, or its absence) is rendered.
  await setupScannedLibrary();
  const p = window.__MUSEEKS_PLAYER;
  p.getEffects().setSilentTest(true);
  p.setVolume(0);
  await getTrackByName(/Whiskey Blues/).dblClick();
  // Wait for the queue to populate before switching to its view.
  const start = performance.now();
  while (window.__MUSEEKS_PLAYER.getState().queue.length === 0) {
    if (performance.now() - start > 5000) {
      throw new Error('timed out waiting for the queue to populate');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await page.getByRole('button', { name: 'Switch view' }).click();
  await page.getByRole('menuitem', { name: 'Queue' }).click();

  await expect.element(page.getByText(/ReplayGain/i).first()).toBeVisible();

  p.pause();
});
