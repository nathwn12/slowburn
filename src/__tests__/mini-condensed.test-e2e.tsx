/**
 * Mini condensed player card - height-bound spec.
 *
 * The owner's complaint: mini mode was just the full layout in a smaller
 * window, with NowPlaying rendering its full-height column (~283px) and the
 * list cramped below. This spec pins the fix: in mini the player card is a
 * compact horizontal strip, materially smaller than the full column, and the
 * queue below it keeps the majority of the height.
 *
 * Black-box surface only (roles, rects); never imports components.
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import type { Config } from '../generated/typings';
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

/** The condensed player card keeps the shell's Now-playing region. */
const nowPlaying = () => page.getByRole('region', { name: 'Now playing' });

/** The queue surface reuses the queue props (the `Queue` listbox). */
const queueList = () => page.getByRole('listbox', { name: 'Queue' });

async function appBridge(): Promise<{ config: Config }> {
  const mod = (await import('../lib/bridge-config')) as unknown as {
    default: { config: Config };
  };
  return mod.default;
}

async function invalidateConfig(): Promise<void> {
  const { default: queryClient } = await import('../lib/query-client');
  const { configQuery } = await import('../lib/queries');
  await queryClient.invalidateQueries({ queryKey: configQuery.queryKey });
}

async function setMode(mode: string): Promise<void> {
  const bridge = await appBridge();
  bridge.config = {
    ...bridge.config,
    ui_mode: mode as unknown as Config['ui_mode'],
  };
  await invalidateConfig();
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

function rectOf(locator: ReturnType<typeof nowPlaying>): {
  height: number;
  bottom: number;
  top: number;
} {
  const rect = locator.element().getBoundingClientRect();
  return { height: rect.height, bottom: rect.bottom, top: rect.top };
}

test(
  'mini condenses the player card and gives the queue the majority',
  { timeout: 30_000 },
  async () => {
    await playFirstTrack();

    // Full mode first: the reference height of the full vertical column.
    await setMode('full');
    await expect.element(nowPlaying()).toBeVisible();
    const fullHeight = rectOf(nowPlaying()).height;
    expect(fullHeight).toBeGreaterThan(0);

    // Mini: the card condenses to a compact strip.
    await setMode('mini');
    await expect.element(nowPlaying()).toBeVisible();
    await expect.element(queueList()).toBeVisible();

    const mini = rectOf(nowPlaying());
    const queue = rectOf(queueList());

    // Stack order is unchanged: the card sits above the queue.
    expect(mini.bottom).toBeLessThanOrEqual(queue.top);

    // The card is materially smaller than the full column (bound: at most
    // three-fifths of it, and inside the ~110-200px strip budget).
    expect(mini.height).toBeLessThan(fullHeight * 0.6);
    expect(mini.height).toBeLessThanOrEqual(200);

    // The queue below keeps the majority: taller than the card it follows.
    expect(queue.height).toBeGreaterThan(mini.height);
  },
);
