/**
 * In-app menu bar: on frameless Windows chrome the native Tauri menu has no
 * frame to attach to, so File / Playback / View / Tools / Help render below
 * the TitleBar once `menu_bar_visible` is toggled (TitleBar button or Alt).
 * Black-box only: role/name selectors against the live shell, with the
 * config bridge flipped the same way `ui-mode.test-e2e.tsx` does it.
 */
import { expect, test } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';

import type { Config } from '../generated/typings';
import { beforeEachSetup } from './e2e-helpers';

beforeEachSetup();

const PLATFORM = import.meta.env.PLATFORM as string;

const bar = () => page.getByRole('menubar', { name: 'Application menu bar' });

/**
 * The app's config bridge. Imported through the specifier the app uses, so
 * the `vi.doMock` registered by `beforeEachSetup` hands back the *same*
 * instance.
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

/** Flip the same flag the TitleBar menu button and the Alt key flip. */
async function setMenuVisible(visible: boolean): Promise<void> {
  const bridge = await appBridge();
  bridge.config = { ...bridge.config, menu_bar_visible: visible };
  await invalidateConfig();
}

async function waitForHash(fragment: string): Promise<void> {
  const start = performance.now();
  while (!window.location.hash.includes(fragment)) {
    if (performance.now() - start > 5000) {
      throw new Error(`waitForHash timed out: ${fragment}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test.runIf(PLATFORM === 'windows')(
  'shows the familiar top-level menus once toggled visible',
  async () => {
    await setMenuVisible(true);

    await expect.element(bar()).toBeVisible();
    for (const name of ['File', 'Playback', 'View', 'Tools', 'Help']) {
      await expect.element(bar().getByRole('button', { name })).toBeVisible();
    }
  },
);

test.runIf(PLATFORM === 'windows')(
  'a menu entry triggers its action',
  async () => {
    await setMenuVisible(true);

    await bar().getByRole('button', { name: 'View' }).click();
    await expect
      .element(page.getByRole('menu', { name: 'View' }))
      .toBeVisible();

    await page.getByRole('menuitem', { name: 'Go to playlists' }).click();
    await waitForHash('#/playlists');
  },
);

test.runIf(PLATFORM === 'windows')(
  'menus open and close from the keyboard',
  async () => {
    await setMenuVisible(true);

    bar().getByRole('button', { name: 'File' }).element().focus();
    await userEvent.keyboard('{Enter}');
    await expect
      .element(page.getByRole('menu', { name: 'File' }))
      .toBeVisible();

    await userEvent.keyboard('{Escape}');
    await expect
      .element(page.getByRole('menu', { name: 'File' }))
      .not.toBeInTheDocument();
  },
);

test.runIf(PLATFORM !== 'windows')(
  'other platforms keep their native menu only',
  async () => {
    await setMenuVisible(true);
    expect(
      document.querySelector('[aria-label="Application menu bar"]'),
    ).toBeNull();
  },
);
