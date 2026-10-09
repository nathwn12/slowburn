/**
 * S8 mini-mode - failing acceptance spec (RED before the S8 builder lands).
 *
 * S8 flips the fresh default to Full and adds a Mini mode (AIMP-mini style:
 * a condensed player card stacked above the queue), with no engine or theme
 * changes. These tests assert only the future black-box surface (roles,
 * text, routes); they never import components.
 *
 * `mini` is not a member of `Config['ui_mode']` yet, so the tests smuggle it
 * through `as unknown as` - valid code that typechecks today and gates the
 * builder tomorrow.
 *
 * Silent verification: this file never launches the app. The browser is
 * muted by `vitest.config.ts`, and playback is silenced via `setSilentTest`
 * plus `setVolume(0)`.
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import type { Config } from '../generated/typings';
import {
  beforeEachSetup,
  getMainNavigation,
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

/** The 26px ledger is the one `<footer>` in the shell (full mode only). */
const ledger = () => page.getByRole('contentinfo');

/** The condensed player card keeps the shell's Now-playing region. */
const nowPlaying = () => page.getByRole('region', { name: 'Now playing' });

/** The queue surface reuses the queue props (the `Queue` listbox). */
const queueList = () => page.getByRole('listbox', { name: 'Queue' });

/**
 * The app's config bridge. Imported through the specifier the app uses, so the
 * `vi.doMock` registered by `beforeEachSetup` hands back the *same* instance.
 */
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

/**
 * Set the persisted mode without leaving the current route. `mini` is not in
 * `UiMode` yet, so it is cast - the S8 builder adds the member and the cast
 * keeps working.
 */
async function setMode(mode: string): Promise<void> {
  const bridge = await appBridge();
  bridge.config = {
    ...bridge.config,
    ui_mode: mode as unknown as Config['ui_mode'],
  };
  await invalidateConfig();
}

/** A config written before the field existed: the key is simply absent. */
async function clearMode(): Promise<void> {
  const bridge = await appBridge();
  const next = { ...bridge.config };
  delete (next as Partial<Config>).ui_mode;
  bridge.config = next;
  await invalidateConfig();
}

/** Read the live config query data (same plumbing as `invalidateConfig`). */
async function readConfigData(): Promise<Config | undefined> {
  const { default: queryClient } = await import('../lib/query-client');
  const { configQuery } = await import('../lib/queries');
  return queryClient.getQueryData(configQuery.queryKey) as Config | undefined;
}

/** Wait until the refetch triggered by `setMode`/`clearMode` has landed. */
async function waitForConfig(
  predicate: (config: Config | undefined) => boolean,
): Promise<void> {
  const start = performance.now();
  while (!predicate(await readConfigData())) {
    if (performance.now() - start > 5000) {
      throw new Error('waitForConfig timed out');
    }
    await sleep(20);
  }
}

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

// S8 settings: the Interface Mode select offers Mini next to Minimal and Full.
test('the Mode select offers Mini', async () => {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Interface' }).click();

  const mode = page.getByRole('combobox', { name: 'Mode' });
  await expect.element(mode).toBeVisible();
  await expect
    .element(mode.getByRole('option', { name: 'Mini', exact: true }))
    .toBeInTheDocument();
});

// S8 layout: mini stacks a condensed player card (cover, condensed info,
// transport, seek with times) above the queue listbox with its count.
test('mini stacks the condensed player above the queue', async () => {
  await playFirstTrack();
  await setMode('mini');

  // The condensed card: cover, info, transport, seek - all still the shell's
  // black-box surface. The cover mock returns no art, so the card must render
  // the stand-in tile (`role="img" "Album art"`, visible even without art)
  // rather than the opacity-0 classic `<img alt="Album cover">`.
  await expect.element(nowPlaying()).toBeVisible();
  await expect
    .element(nowPlaying().getByRole('img', { name: 'Album art' }))
    .toBeVisible();
  await expect.element(nowPlaying().getByText('Whiskey Blues')).toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Previous' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Next' }))
    .toBeVisible();
  const seek = page.getByRole('group', {
    name: 'Seek bar with A-B loop region',
  });
  await expect.element(seek).toBeVisible();
  await expect.element(seek).toHaveTextContent(/\d+:\d+/);

  // The bottom half reuses the queue surface: listbox, playing track, count.
  await expect.element(queueList()).toBeVisible();
  await expect
    .element(
      queueList()
        .getByRole('option', { name: /Whiskey Blues/ })
        .first(),
    )
    .toBeVisible();
  await expect.element(page.getByText(/\d+ tracks?/)).toBeVisible();

  // Stack order: the player card sits above the queue.
  const playerBox = nowPlaying().element().getBoundingClientRect();
  const queueBox = queueList().element().getBoundingClientRect();
  expect(playerBox.bottom).toBeLessThanOrEqual(queueBox.top);
});

// Owner report: in mini the song list was lost (the list area rendered
// empty/cut). With an empty queue the panel falls back to the library source,
// so the list region must still be visible with real rows and actually own
// the remaining height below the condensed player.
test('mini with an empty queue still shows the song list', async () => {
  await setupScannedLibrary();
  player().setQueue([]);
  await setMode('mini');

  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .toBeVisible();
  // Empty queue: the Library source is selected, not a bare empty message.
  await expect
    .element(page.getByRole('tab', { name: 'Library' }))
    .toHaveAttribute('aria-selected', 'true');

  const panel = page.getByRole('tabpanel');
  await expect.element(panel).toBeVisible();

  // Real rows in the list region, and the region actually takes space.
  const first = page
    .getByRole('listbox', { name: 'Track list' })
    .getByRole('option')
    .nth(0);
  await expect.element(first).toBeVisible();
  expect(panel.element().getBoundingClientRect().height).toBeGreaterThan(0);
});

// S8 toggle: full -> mini -> full preserves the queue, the cursor, playback,
// and the Now-playing node identity (no remount, no restart of the engine).
// Only preservation is asserted here - the mini surface itself is gated by the
// condensed-stack test above - so this passes pre-S8 (mini falls through to
// the minimal shell) and keeps passing once mini is real.
test('full-to-mini-to-full preserves queue, cursor, playback, and the player node', async () => {
  // Start explicitly from Full (the contract in the test name): the config
  // bridge persists across tests in this file, so the previous test's Mini
  // would otherwise still be active - and Mini replaces the track list with
  // the queue, leaving nothing to double-click. Pre-S8 this setup worked
  // only because `mini` fell through to the minimal shell.
  await setMode('full');
  const p = await playFirstTrack();
  await setMode('full');

  const before = p.getState();
  const beforeIds = before.queue.map((track) => track.id);
  const regionBefore = nowPlaying().element();

  await setMode('mini');
  expect(p.getState().isPaused).toBe(false);

  await setMode('full');
  await expect.element(ledger()).toBeVisible();

  const after = p.getState();
  expect(after.queue.map((track) => track.id)).toEqual(beforeIds);
  expect(after.queueCursor).toBe(before.queueCursor);
  expect(after.isPaused).toBe(false);
  expect(nowPlaying().element()).toBe(regionBefore);
});

// S8 default: a clean config (no stored mode) boots Full - ledger plus the
// queue column - because the stored choice, not a minimal fallback, wins.
test('a clean config boots Full with the ledger and the queue column', async () => {
  await clearMode();
  // Settle first: without this the shell still shows the previous render and
  // the ledger assertion passes vacuously. The refetch must land with the key
  // still absent before the S8 Full-boot claim means anything.
  await waitForConfig((config) => config != null && !('ui_mode' in config));

  // Own setup: isolation clears the player between tests, so build the queue
  // this test asserts on (same scan-and-play pattern as the tests above).
  await playFirstTrack();

  await expect.element(ledger()).toBeVisible();
  await expect.element(nowPlaying()).toBeVisible();

  await switchView('Queue');
  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .toBeVisible();
  await expect.element(queueList()).toBeVisible();
});
