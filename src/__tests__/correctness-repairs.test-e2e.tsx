/**
 * Correctness repairs: focused proofs for the four defects fixed in this
 * pass (folder-prune boundary, stop-after-current race, queue drag reorder,
 * art-tint ordering). Each test targets the shipped seam directly.
 *
 * Silent verification: the browser is muted by `vitest.config.ts`, and
 * playback is silenced via `setSilentTest` plus `setVolume(0)` where audio
 * plays.
 */
import { afterEach, expect, test, vi } from 'vite-plus/test';

import type { Track } from '../generated/typings';
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
async function playFirstTrack(): Promise<Player> {
  await setupScannedLibrary();
  const p = player();
  p.getEffects().setSilentTest(true);
  p.setVolume(0);
  await getTrackByName(/Whiskey Blues/).dblClick();
  await waitFor(() => !p.getState().isPaused, 5000);
  return p;
}

function fakeTrack(id: string, path: string): Track {
  return {
    id,
    path,
    title: id,
    artists: ['artist'],
    album: 'album',
    album_artist: 'artist',
    year: 2024,
    disk_no: 1,
    disk_of: 1,
    track_no: 1,
    track_of: 1,
    genres: [],
    is_compilation: false,
    format: 'mp3',
    is_lossless: false,
    sample_rate: 44100,
    bit_depth: null,
    channels: 2,
    bitrate: 128000,
    file_size: 1000,
    modified: 0,
    date_added: '2026-01-01T00:00:00Z',
    play_count: 0,
    last_played: null,
    duration: 300,
  } as Track;
}

// Item 1: folder removal prunes by separator boundary, so `/music/rock`
// does not take `/music/rockabilly` with it.
test('removing a folder prunes only tracks under it, keeping sibling-prefixed folders', async () => {
  const { default: LibraryAPI, isPathUnderFolder } =
    await import('../api/LibraryAPI');

  expect(isPathUnderFolder('/music/rock/song.mp3', '/music/rock')).toBe(true);
  expect(isPathUnderFolder('/music/rock', '/music/rock')).toBe(true);
  expect(isPathUnderFolder('/music/rockabilly/song.mp3', '/music/rock')).toBe(
    false,
  );
  expect(isPathUnderFolder('C:\\Music\\Rock\\song.mp3', 'c:/music/rock/')).toBe(
    true,
  );

  const ConfigBridge = (await import('../lib/bridge-config')).default;
  const DatabaseBridge = (await import('../lib/bridge-database')).default;

  await ConfigBridge.set('library_folders', [
    '/music/rock',
    '/music/rockabilly',
  ]);
  const getAllSpy = vi
    .spyOn(DatabaseBridge, 'getAllTracks')
    .mockResolvedValue([
      fakeTrack('r1', '/music/rock/song.mp3'),
      fakeTrack('r2', '/music/rockabilly/song.mp3'),
    ]);
  const removeSpy = vi
    .spyOn(DatabaseBridge, 'removeTracks')
    .mockResolvedValue([]);

  try {
    await LibraryAPI.removeLibraryFolder('/music/rock');

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy.mock.calls[0]?.[0]).toStrictEqual(['r1']);
    const folders = await ConfigBridge.get('library_folders');
    expect(folders).toStrictEqual(['/music/rockabilly']);
  } finally {
    getAllSpy.mockRestore();
    removeSpy.mockRestore();
  }
});

// Item 2a: a seek that jumps past the preemption window still stops on the
// current track (the `seeked` guard engages before any `ended`).
test('stop-after-current holds the current track when a seek jumps past the preemption window', async () => {
  const p = await playFirstTrack();
  const { useStopAfterCurrentStore } =
    await import('../components/PlayerEvents');
  useStopAfterCurrentStore.getState().arm();

  const cursor = p.getQueueCursor();
  const trackId = p.getTrack()?.id;
  const duration = p.getTrack()?.duration ?? 300;
  p.setCurrentTime(duration - 0.05);

  await waitFor(
    () =>
      p.isPaused() &&
      p.getQueueCursor() === cursor &&
      p.getTrack()?.id === trackId,
    5000,
  );
  expect(useStopAfterCurrentStore.getState().armed).toBe(false);
});

// Item 2b: when `ended` fires with the flag still armed, the stop lands on
// the ended track instead of pausing the auto-advanced next track.
test('stop-after-current pulls back to the ended track when ended fires while armed', async () => {
  const p = await playFirstTrack();
  const { useStopAfterCurrentStore } =
    await import('../components/PlayerEvents');
  useStopAfterCurrentStore.getState().arm();

  const cursor = p.getQueueCursor();
  const trackId = p.getTrack()?.id;
  p.getAudioElement().dispatchEvent(new Event('ended'));

  await waitFor(
    () =>
      p.isPaused() &&
      p.getQueueCursor() === cursor &&
      p.getTrack()?.id === trackId,
    8000,
  );
  expect(useStopAfterCurrentStore.getState().armed).toBe(false);
});

// Item 3: reorder positions come from the rendered list and the cursor
// track never moves.
test('queue drag reorder derives positions from the rendered list and keeps the cursor', async () => {
  const { reorderQueue } = await import('../components/QueueList');
  const queue = [
    fakeTrack('a', '/a.mp3'),
    fakeTrack('b', '/b.mp3'),
    fakeTrack('c', '/c.mp3'),
    fakeTrack('d', '/d.mp3'),
  ];
  const ids = (tracks: Track[]): Array<string> =>
    tracks.map((track) => track.id);

  // Moving down in the rendered order lands after the drop target.
  expect(
    ids(reorderQueue(queue, 0, ['b', 'c', 'd'], 'b', 'c') ?? []),
  ).toStrictEqual(['a', 'c', 'b', 'd']);

  // Moving up lands before the drop target.
  expect(
    ids(reorderQueue(queue, 0, ['b', 'c', 'd'], 'c', 'b') ?? []),
  ).toStrictEqual(['a', 'c', 'b', 'd']);

  // A drop target outside the rendered set (filtered row, playing row,
  // beyond-the-page row) is a no-op, not a full-queue splice.
  expect(reorderQueue(queue, 0, ['b', 'c', 'd'], 'b', 'zzz')).toBe(null);
  expect(reorderQueue(queue, 0, ['b', 'c', 'd'], 'a', 'b')).toBe(null);
  expect(reorderQueue(queue, 0, ['b', 'c', 'd'], 'b', 'b')).toBe(null);

  // A filtered view (only `b` and `d` rendered) reorders around the hidden
  // row without touching it or the cursor track.
  expect(ids(reorderQueue(queue, 0, ['b', 'd'], 'b', 'd') ?? [])).toStrictEqual(
    ['a', 'c', 'd', 'b'],
  );
});

// Item 4: unordered cover reads cannot paint a stale accent - only the
// newest refresh applies.
test('a slow cover read for an older track cannot overwrite a newer accent', async () => {
  const ConfigBridge = (await import('../lib/bridge-config')).default;
  const { default: SettingsAPI } = await import('../api/SettingsAPI');

  await ConfigBridge.set('ui_art_tint', true);
  await ConfigBridge.set('ui_accent_color', '#000000');

  // Slow cover for the older track, instant cover for the newer one. The
  // mock reads this hook; every other suite leaves it unset and sees the
  // previous all-null behaviour.
  const holder = globalThis as typeof globalThis & {
    __MUSEEKS_MOCK_COVER__?: unknown;
  };
  holder.__MUSEEKS_MOCK_COVER__ = {
    rules: [
      { match: 'whiskey', cover: 'cover-a', delayMs: 500 },
      { match: 'majestic', cover: 'cover-b' },
    ],
    accents: { 'cover-a': '#111111', 'cover-b': '#222222' },
  };

  try {
    const coverProbe = await import('../lib/cover');
    expect(await coverProbe.getCover('/majestic-blues.mp3')).toBe('cover-b');
    expect(await coverProbe.sampleCoverAccent('cover-b')).toBe('#222222');
    expect(await ConfigBridge.get('ui_art_tint')).toBe(true);

    const p = player();
    // Real asset paths: a 404 src would fire `error` and `player.stop()`
    // would clear the queue mid-test.
    const trackA = fakeTrack('art-a', '/whiskey-blues.mp3');
    const trackB = fakeTrack('art-b', '/majestic-blues.mp3');
    await p.start([trackA, trackB], trackA.id, { type: 'library' });

    // Older track's refresh starts first but its cover read hangs...
    const stale = SettingsAPI.refreshArtTint();
    // ...then the queue moves on and the newer refresh resolves fast.
    await p.start([trackA, trackB], trackB.id, { type: 'library' });
    await SettingsAPI.refreshArtTint();
    // The slow read finally lands; it must be discarded.
    await stale;
    await sleep(50);

    expect(
      document.documentElement.style.getPropertyValue('--main-color'),
    ).toBe('#222222');
  } finally {
    delete holder.__MUSEEKS_MOCK_COVER__;
  }
});
