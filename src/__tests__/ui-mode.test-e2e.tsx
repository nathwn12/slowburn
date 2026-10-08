/**
 * `ui_mode`: the shell renders either the minimal layout (default) or full.
 *
 * Silent verification — this file never launches the app and never emits sound.
 * Mode switches are driven through the config bridge plus a query invalidation
 * (no route change), which is the "toggle without a restart" path; the settings
 * control itself is exercised once in the last test.
 */
import { expect, test } from 'vite-plus/test';
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

/** The 26px ledger is the one `<footer>` in the shell. */
const ledger = () => page.getByRole('contentinfo');

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

/** Set the persisted mode without leaving the current route. */
async function setMode(mode: 'minimal' | 'full'): Promise<void> {
  const bridge = await appBridge();
  bridge.config = { ...bridge.config, ui_mode: mode };
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

// AC1: a fresh install starts minimal. Minimal drops the ledger, and the Queue
// becomes a route-level view rather than the full-mode column.
test('renders minimal by default: no ledger, queue is a route not a column', async () => {
  // The Queue route must lead somewhere real in minimal (the fix for the blank
  // `/queue` screen), so the heading is expected here.
  await switchView('Queue');
  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .toBeVisible();
  await expect.element(ledger()).not.toBeInTheDocument();

  // It is a view, not the full-mode column: navigating away drops it.
  await switchView('All tracks');
  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .not.toBeInTheDocument();

  // The player is never cut by the mode.
  await expect
    .element(page.getByRole('region', { name: 'Now playing' }))
    .toBeVisible();
});

// AC3: full mode restores the two additions.
test('renders full mode: ledger and queue column present', async () => {
  await setMode('full');
  await switchView('Queue');

  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .toBeVisible();
  await expect.element(ledger()).toBeVisible();
});

// Review Focus 3: toggling must not remount the player.
test('switches mode without remounting the player bands', async () => {
  const p = await playFirstTrack();
  await setMode('minimal');

  const regionBefore = page
    .getByRole('region', { name: 'Now playing' })
    .element();
  const abBefore = page
    .getByRole('textbox', { name: 'Loop point A' })
    .element();

  await setMode('full');
  await expect.element(ledger()).toBeVisible();
  await setMode('minimal');
  await expect.element(ledger()).not.toBeInTheDocument();

  // Same DOM nodes across the toggle: the player column never remounted.
  expect(page.getByRole('region', { name: 'Now playing' }).element()).toBe(
    regionBefore,
  );
  expect(page.getByRole('textbox', { name: 'Loop point A' }).element()).toBe(
    abBefore,
  );

  // Every band the spec says the mode must not cut is still there.
  await expect
    .element(page.getByRole('group', { name: 'Seek bar with A-B loop region' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('textbox', { name: 'Loop point A' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('textbox', { name: 'Loop point B' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Previous' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Increase reverb' }))
    .toBeVisible();

  // Playback was not disturbed by the switch.
  expect(p.getState().isPaused).toBe(false);
});

// Review Focus 2: a pre-existing config (no key) yields full, the fresh
// default since S8 (stored `minimal`/`full`/`mini` choices are still honored
// verbatim; only absent-or-unknown falls back to full).
test('falls back to full when ui_mode is absent', async () => {
  await setMode('minimal');
  await expect.element(ledger()).not.toBeInTheDocument();

  await clearMode();

  await expect.element(ledger()).toBeVisible();
  await expect
    .element(page.getByRole('region', { name: 'Now playing' }))
    .toBeVisible();
});

// Review Focus 4: the settings branch survives minimal, and its control writes
// through to the shell.
test('still renders the settings screen in minimal mode', async () => {
  await setMode('minimal');

  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Interface' }).click();

  const mode = page.getByRole('combobox', { name: 'Mode' });
  await expect.element(mode).toBeVisible();

  await mode.selectOptions('full');

  // The settings control persists the mode; the shell picks it up.
  await getMainNavigation().getByRole('link', { name: 'Library' }).click();
  await expect.element(ledger()).toBeVisible();
});
