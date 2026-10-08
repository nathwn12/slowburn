/**
 * Lists-and-queue empty states, affordances, and selection/sorting (ux audit).
 *
 * Black-box against the live shell (roles, text, computed style) plus unit
 * coverage of the pure playlist-name resolver. Never launches audio: the
 * browser is muted and playback is silenced via `setSilentTest` + volume 0.
 *
 * Written for the serialized fleet gate; NOT executed here (five workers are
 * editing in parallel and concurrent browser suites fail on load contention).
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import type { Playlist } from '../generated/typings';
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

function queueList() {
  return page.getByRole('listbox', { name: 'Queue' });
}

// The origin badge resolves the real playlist name from the playlists query.
// Dynamically imported: a static import would evaluate the player singleton
// (via Queue -> lib/player -> ConfigBridge.getInitial) before `beforeEach`
// stubs the backend globals.
test('resolveQueueOriginName maps a known id to its name', async () => {
  const { resolveQueueOriginName } = await import('../components/Queue');
  const playlists: Array<Playlist> = [
    { id: 'playlist-1', name: 'Road Trip', tracks: [], import_path: null },
    { id: 'playlist-2', name: 'Focus', tracks: [], import_path: null },
  ];

  expect(resolveQueueOriginName(playlists, 'playlist-1')).toBe('Road Trip');
  expect(resolveQueueOriginName(playlists, 'playlist-2')).toBe('Focus');
});

// Unknown ids resolve to null so the badge can fall back explicitly.
test('resolveQueueOriginName returns null for an unknown id', async () => {
  const { resolveQueueOriginName } = await import('../components/Queue');
  expect(resolveQueueOriginName([], 'playlist-9')).toBeNull();
});

// The badge names the origin section; an unknown playlist keeps the legacy
// `playlist:<id>` fallback instead of rendering nothing.
test('the queue badge names the playlist origin without dropping it', async () => {
  const p = await playFirstTrack();
  const queue = p.getState().queue;
  await p.start(queue, queue[0].id, {
    type: 'playlist',
    playlistID: 'playlist-1',
  });
  await switchView('Queue');

  await expect.element(page.getByText(/From playlist/i)).toBeVisible();
  await expect.element(page.getByText(/playlist:playlist-1/i)).toBeVisible();
});

// A filter hiding every row is not an empty queue: the panel names the
// filter, shows the 0-of-N count, and offers a clear-filter way out.
test('a filter hiding every row shows a filtered-empty state', async () => {
  await playFirstTrack();
  await switchView('Queue');
  await expect.element(queueList()).toBeVisible();

  // No saved loops exist in the mock library, so this hides every row.
  await page.getByRole('button', { name: 'Saved loops' }).click();

  await expect
    .element(page.getByText(/No Saved loops tracks in the queue/i))
    .toBeVisible();
  await expect.element(page.getByText(/0 of 3 tracks/i)).toBeVisible();
  await expect
    .element(page.getByText('Queue is empty'))
    .not.toBeInTheDocument();

  // The way out: clearing the filter restores the rows.
  await page.getByRole('button', { name: 'Clear filter' }).click();
  await expect.element(queueList().getByRole('option').first()).toBeVisible();
});

// Tracks without a ReplayGain tag say so instead of a bare `-`.
test('missing ReplayGain renders a friendly placeholder', async () => {
  await playFirstTrack();
  await switchView('Queue');

  await expect.element(page.getByText(/No ReplayGain tag/i)).toBeVisible();
});

// Hour-long durations (`1:00:00`) must not clip: the duration column keeps a
// 44px minimum instead of the fixed 38px box.
test('the queue duration column never clips hour-long tracks', async () => {
  await playFirstTrack();
  await switchView('Queue');

  const duration = queueList().getByText('5:00').first();
  await expect.element(duration).toBeVisible();
  expect(getComputedStyle(duration.element()).minWidth).toBe('44px');
});

// Click-to-select paints a real selection with a roving tab stop, and Enter
// on a focused row starts playback from it.
test('queue rows select on click and activate on Enter', async () => {
  const p = await playFirstTrack();
  await switchView('Queue');

  // options[0] is the now-playing row; the upcoming rows follow it.
  const first = queueList().getByRole('option').nth(1);
  const second = queueList().getByRole('option').nth(2);
  await expect.element(first).toHaveAttribute('aria-selected', 'false');
  await expect.element(first).toHaveAttribute('tabindex', '0');

  await second.click();
  await expect.element(second).toHaveAttribute('aria-selected', 'true');
  await expect.element(second).toHaveAttribute('tabindex', '0');
  await expect.element(first).toHaveAttribute('tabindex', '-1');

  second.element().focus();
  second
    .element()
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  await waitFor(() => p.getState().queueCursor === 2, 5000);
});
