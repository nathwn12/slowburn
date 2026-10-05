/**
 * Silent numeric verification of the A-B section loop engine.
 *
 * Hard rule: never emit audible sound. The output gain is forced to 0 (via
 * `setSilentTest`) AND the master gain to 0 (volume 0), and the browser is
 * launched with `--mute-audio` (see `vitest.config.ts`). Nothing here is
 * asserted by listening: only `currentTime` values, playback rate and gain
 * readings are used.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { MOCK_CONFIG } from '../lib/__mocks__/bridge-config';

const TRACK = {
  id: '0',
  path: '/whiskey-blues.mp3',
  title: 'Whiskey Blues',
  album: 'Another Album',
  album_artist: 'Captain_Sleepy',
  artists: ['Captain_Sleepy'],
  genres: ['blues'],
  year: 2025,
  duration: 240,
  track_no: 1,
  track_of: 1,
  disk_no: 1,
  disk_of: 1,
  is_compilation: false,
  format: 'mp3',
  is_lossless: false,
  sample_rate: 44100,
  bit_depth: null,
  channels: 2,
  bitrate: 320000,
  file_size: null,
  modified: null,
  date_added: '2026-01-01T00:00:00Z',
  play_count: 0,
  last_played: null,
};

const TRACK2 = {
  ...TRACK,
  id: '1',
  path: '/majestic-blues.mp3',
  title: 'Majestic Blues',
  album: 'Pixabay',
  album_artist: 'Desicomix07',
  artists: ['Desicomix07'],
};

type Player = (typeof import('../lib/player'))['default'];
type Jump = { from: number; to: number; atMs: number };

let current: Player | null = null;

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

/** Polls `currentTime` and records every backward seek as a jump event. */
async function recordJumps(player: Player, durationMs: number): Promise<Jump[]> {
  const jumps: Jump[] = [];
  let previous = player.getCurrentTime();
  const start = performance.now();
  while (performance.now() - start < durationMs) {
    await sleep(20);
    const now = player.getCurrentTime();
    if (now < previous - 0.5) {
      jumps.push({
        from: previous,
        to: now,
        atMs: Math.round(performance.now() - start),
      });
    }
    previous = now;
  }
  return jumps;
}

beforeEach(() => {
  vi.resetModules();

  vi.stubGlobal('__MUSEEKS_INITIAL_CONFIG', { ...MOCK_CONFIG });
  vi.stubGlobal('__MUSEEKS_INITIAL_QUEUE', []);
  vi.stubGlobal('__MUSEEKS_PLATFORM', 'windows');
  vi.stubGlobal('__TAURI_INTERNALS__', {
    __TAURI_PATTERN__: { pattern: 'brownfield' },
    plugins: { path: { sep: '/', delimiter: ':' } },
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' },
    },
    callbacks: new Map(),
    invoke: vi.fn(),
    convertFileSrc: (path: string) => path,
    ipc: vi.fn(),
    postMessage: vi.fn(),
    runCallback: vi.fn(),
    transformCallback: vi.fn(),
    unregisterCallback: vi.fn(),
  });
  vi.stubGlobal('__TAURI_EVENT_PLUGIN_INTERNALS__', {
    unregisterListener: vi.fn(),
  });

  vi.doMock('../lib/bridge-config');
  vi.doMock('../lib/bridge-database');
  vi.doMock('../lib/cover');

  // Fresh simulated database for each test.
  delete (globalThis as { __MUSEEKS_MOCK_AB_LOOPS?: unknown })
    .__MUSEEKS_MOCK_AB_LOOPS;
});

afterEach(() => {
  current?.pause();
  current = null;
});

async function bootPlayer(): Promise<Player> {
  const player = (await import('../lib/player')).default;
  current = player;
  // Force the graph silent before it is built: output gain 0 and master 0.
  player.getEffects().setSilentTest(true);
  player.setVolume(0);
  await player.start([TRACK], TRACK.id, { type: 'library' });
  await waitFor(() => player.getCurrentTime() > 0.2, 5000);
  return player;
}

test(
  'A-B loop seeks back to A, and clearing stops it',
  { timeout: 45_000 },
  async () => {
    const player = await bootPlayer();

    await player.setAbPoint('A', 2);
    await player.setAbPoint('B', 5);

    expect(player.getAbLoop()).toMatchObject({
      trackId: '0',
      enabled: true,
      active: true,
      startSeconds: 2,
      endSeconds: 5,
    });

    // ~12 s of playback with a 3 s region should produce at least 3 jumps.
    const jumps = await recordJumps(player, 12_000);

    // eslint-disable-next-line no-console
    console.log('AB_JUMP_EVENTS', JSON.stringify(jumps));
    expect(jumps.length).toBeGreaterThanOrEqual(3);
    for (const jump of jumps) {
      expect(jump.from).toBeGreaterThanOrEqual(4.9);
      expect(jump.from).toBeLessThanOrEqual(5.2);
      expect(jump.to).toBeGreaterThanOrEqual(1.9);
      expect(jump.to).toBeLessThanOrEqual(2.2);
    }

    // Clearing disarms the loop and removes it from the store.
    await player.clearAbLoop();
    expect(player.getAbLoop().active).toBe(false);

    const afterClear = await recordJumps(player, 6000);
    // eslint-disable-next-line no-console
    console.log('AB_AFTER_CLEAR_EVENTS', JSON.stringify(afterClear));
    expect(afterClear).toHaveLength(0);
    expect(player.getCurrentTime()).toBeGreaterThan(5);
  },
);

test(
  'a saved region auto-applies (arm + seek to A) when the track loads',
  { timeout: 30_000 },
  async () => {
    const player = await bootPlayer();
    await player.setAbPoint('A', 3);
    await player.setAbPoint('B', 6);
    player.pause();
    await sleep(50);

    // Open a different track first: it has no region, so nothing is armed.
    await player.setTrack(TRACK2);
    await sleep(50);
    expect(player.getAbLoop().active).toBe(false);

    // Now open the track with the saved region again. Loading it must restore
    // and auto-apply the region with zero user action.
    await player.start([TRACK], TRACK.id, { type: 'library' });
    await waitFor(() => player.getAbLoop().active, 3000);

    expect(player.getAbLoop()).toMatchObject({
      trackId: '0',
      active: true,
      startSeconds: 3,
      endSeconds: 6,
    });

    // It sought to A and is already looping, zero clicks.
    const jumps = await recordJumps(player, 8000);
    expect(jumps.length).toBeGreaterThanOrEqual(2);
    for (const jump of jumps) {
      expect(jump.from).toBeGreaterThanOrEqual(5.9);
      expect(jump.from).toBeLessThanOrEqual(6.2);
      expect(jump.to).toBeGreaterThanOrEqual(2.9);
      expect(jump.to).toBeLessThanOrEqual(3.2);
    }
  },
);

test('effect layer (slowed rate + reverb) still works', async () => {
  const player = await bootPlayer();
  const effects = player.getEffects();

  // Slowed playback rate engages the element rate.
  player.setEffectsConfig({ slowEnabled: true, slow: 0.8 });
  await sleep(50);
  expect(player.getPlaybackRate()).toBeCloseTo(0.8, 3);

  // Reverb crossfades dry/wet, while the output stays silent.
  player.setEffectsConfig({ reverbEnabled: true, reverbIntensity: 0.5 });
  await sleep(300);
  const gains = effects.debugGains();
  // eslint-disable-next-line no-console
  console.log('AB_EFFECT_GAINS', JSON.stringify(gains));
  expect(gains.output).toBe(0);
  expect(gains.master).toBe(0);
  expect(gains.dry).not.toBeNull();
  expect(gains.dry as number).toBeLessThan(1);

  // The graph is live even though nothing reaches the speakers.
  const rms = await effects.measureRms(500);
  // eslint-disable-next-line no-console
  console.log('AB_EFFECT_RMS', JSON.stringify(rms));
  expect(rms.peak).toBeGreaterThan(0);
});
