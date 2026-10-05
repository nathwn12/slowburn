/**
 * Minimal mode must still have somewhere for the header's Queue item to land.
 *
 * `ui_mode` defaults to `minimal`, and minimal hides the right-column Queue, so
 * `/queue` renders the queue as a route-level view in the outlet
 * (`src/routes/queue.tsx`) instead of a blank screen. This file proves that the
 * queue actually renders (with content, and with its empty state) and that the
 * ledger stays hidden.
 *
 * Silent verification: this file never launches the app. The browser is muted
 * by `vitest.config.ts`, and playback is silenced via `setSilentTest` plus
 * `setVolume(0)`.
 */
import { afterEach, expect, test } from 'vite-plus/test';
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

/** The 26px ledger is the one `<footer>` in the shell, and Full-mode only. */
const ledger = () => page.getByRole('contentinfo');

async function switchView(
  name: 'Queue' | 'All tracks' | 'Artists' | 'Playlists',
): Promise<void> {
  await page.getByRole('button', { name: 'Switch view' }).click();
  await page.getByRole('menuitem', { name }).click();
}

/** Scan the mock library, silence the graph, and play the first track. */
async function playFirstTrack(): Promise<Player> {
  await setupScannedLibrary();
  const p = player();
  p.getEffects().setSilentTest(true);
  p.setVolume(0);
  await getTrackByName(/Whiskey Blues/).dblClick();
  await waitFor(() => !p.getState().isPaused, 5000);
  return p;
}

// A fresh config — no mode written, which is exactly what `beforeEachSetup`
// boots — starts minimal: the ledger is absent.
test('a fresh config still defaults to minimal', async () => {
  expect(
    (window as { __MUSEEKS_INITIAL_CONFIG?: { ui_mode?: string } })
      .__MUSEEKS_INITIAL_CONFIG?.ui_mode,
  ).toBe('minimal');

  await expect.element(ledger()).not.toBeInTheDocument();
  await expect
    .element(page.getByRole('region', { name: 'Now playing' }))
    .toBeVisible();
});

// The header's Queue item must lead somewhere real in minimal, not a blank
// screen: the queue route renders the queue surface and its content.
test('the header Queue view renders the queue in minimal mode', async () => {
  await playFirstTrack();
  await switchView('Queue');

  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .toBeVisible();

  const queueList = page.getByRole('listbox', { name: 'Queue' });
  await expect.element(queueList).toBeVisible();

  // Real content, not just a mounted shell: the playing track is in the queue.
  await expect
    .element(queueList.getByRole('option', { name: /Whiskey Blues/ }).first())
    .toBeVisible();

  // Minimal still means no ledger.
  await expect.element(ledger()).not.toBeInTheDocument();
});

// "Never looks empty": with an empty queue the route renders its empty state,
// not a blank screen (design §3.4).
test('the minimal queue view is never blank with an empty queue', async () => {
  // The player is a module singleton, so a previous test in this file may have
  // left a queue behind; empty it so this really is the empty state.
  player().setQueue([]);
  await switchView('Queue');

  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .toBeVisible();
  await expect.element(page.getByText(/Queue is empty/)).toBeVisible();
});
