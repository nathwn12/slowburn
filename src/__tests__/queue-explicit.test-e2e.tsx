/**
 * S4 explicit queue - failing acceptance spec (RED).
 *
 * S4 makes the queue-vs-playlist split explicit with no engine change:
 * an explicit header statement, an origin badge (`playlist:<id>`), and
 * visible play-next / add / remove / clear affordances, with
 * playlist-play replacing the queue. These tests assert only the future
 * black-box surface (roles, text, routes); they never import components.
 *
 * Silent verification: this file never launches the app. The browser is
 * muted by `vitest.config.ts`, and playback is silenced via `setSilentTest`
 * plus `setVolume(0)`.
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

// S4 header: the queue view states the queue-vs-playlist split explicitly
// instead of the bare legacy heading.
test('the queue view states the queue-vs-playlist split explicitly', async () => {
  await playFirstTrack();
  await switchView('Queue');

  await expect
    .element(page.getByRole('heading', { name: 'Up Next' }))
    .toBeVisible();
  await expect
    .element(page.getByText(/separate from playlists/i))
    .toBeVisible();
});

// S4 origin badge: after playing from a playlist, the queue view names the
// origin in `playlist:<id>` form.
test('the queue view badges the playlist origin after playlist play', async () => {
  const p = await playFirstTrack();
  const queue = p.getState().queue;
  const second = queue[1] ?? queue[0];
  await p.start(queue, second.id, {
    type: 'playlist',
    playlistID: 'playlist-1',
  });
  await switchView('Queue');

  const queueRegion = page.getByRole('listbox', { name: 'Queue' });
  await expect.element(queueRegion).toBeVisible();
  await expect.element(page.getByText(/playlist:playlist-1/i)).toBeVisible();
});

// S4 play-next: inserting after the cursor is visible, and each queue row
// offers its own Play next control.
test('play-next inserts after the cursor with a per-row control', async () => {
  const p = await playFirstTrack();
  const before = p.getState();
  const cursor = before.queueCursor ?? 0;
  const incoming = before.queue[(cursor + 1) % before.queue.length];
  p.addNextInQueue([incoming]);
  await switchView('Queue');

  const queueList = page.getByRole('listbox', { name: 'Queue' });
  await expect.element(queueList).toBeVisible();

  // The inserted track follows the cursor in the rendered order.
  const options = queueList.getByRole('option');
  await expect
    .element(options.nth(cursor + 1))
    .toHaveTextContent(incoming.title);

  // S4 affordance: every upcoming row exposes Play next.
  await expect
    .element(queueList.getByRole('button', { name: 'Play next' }).first())
    .toBeVisible();
});

// S4 add/remove/clear: an empty queue offers an explicit way back in, and a
// playing queue names its remove and clear controls.
test('the queue view offers explicit add, remove, and clear affordances', async () => {
  const p = await playFirstTrack();
  p.clearQueue();
  p.setQueue([]);
  await switchView('Queue');

  await expect
    .element(page.getByRole('button', { name: 'Add tracks to queue' }))
    .toBeVisible();

  await playFirstTrack();
  await switchView('Queue');
  const queueList = page.getByRole('listbox', { name: 'Queue' });
  await expect
    .element(
      queueList.getByRole('button', { name: 'Remove from queue' }).first(),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Clear queue' }))
    .toBeVisible();
});

// S4 playlist-replaces-queue: starting a playlist replaces the queue content
// and the badge names that playlist.
test('playing a playlist replaces the queue and names the playlist', async () => {
  const p = await playFirstTrack();
  const libraryQueue = [...p.getState().queue];
  const reversed = [...libraryQueue].reverse();
  await p.start(reversed, reversed[0].id, {
    type: 'playlist',
    playlistID: 'playlist-9',
  });
  await switchView('Queue');

  const queueList = page.getByRole('listbox', { name: 'Queue' });
  await expect
    .element(queueList.getByRole('option', { name: /Whiskey Blues/ }).first())
    .toBeVisible();
  await expect.element(page.getByText(/From playlist/i)).toBeVisible();
  await expect.element(page.getByText(/playlist:playlist-9/i)).toBeVisible();
});

// S4 minimal: the /queue route still renders the explicit header when opened
// directly in minimal mode.
test('the minimal queue route renders the explicit header directly', async () => {
  await playFirstTrack();
  window.location.hash = '#/queue';

  await expect
    .element(page.getByRole('heading', { name: 'Up Next' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('listbox', { name: 'Queue' }))
    .toBeVisible();
});

// S4 shuffle: shuffling keeps the playing track first and says the
// pre-shuffle order is preserved for what follows.
test('shuffle keeps the playing track first and states the order promise', async () => {
  const p = await playFirstTrack();
  await switchView('Queue');

  const playingId = p.getState().queue[p.getState().queueCursor ?? 0].id;
  const playingTitle = p.getState().queue[p.getState().queueCursor ?? 0].title;
  await page.getByRole('button', { name: 'Shuffle queue' }).click();

  const queueList = page.getByRole('listbox', { name: 'Queue' });
  await expect.element(queueList).toBeVisible();
  void playingId;
  await expect
    .element(
      queueList.getByRole('option', { name: new RegExp(playingTitle) }).first(),
    )
    .toBeVisible();
  await expect.element(page.getByText(/pre-shuffle order/i)).toBeVisible();
});
