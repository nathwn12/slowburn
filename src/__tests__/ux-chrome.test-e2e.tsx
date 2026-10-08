/**
 * Window-chrome unification (Slowburn chrome seam): the header controls read
 * as one system - one control height, one icon set, one token vocabulary, no
 * duplicate chrome. Black-box only: role/name selectors against the live
 * shell, plus computed-style reads for the unification assertions.
 */
import { expect, test } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';

import type { Config } from '../generated/typings';
import { beforeEachSetup } from './e2e-helpers';

beforeEachSetup();

const PLATFORM = import.meta.env.PLATFORM as string;

function heightOf(locator: ReturnType<typeof page.getByRole>): string {
  return getComputedStyle(locator.element() as HTMLElement).height;
}

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

test('header controls share one 28px control height', async () => {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });

  // The shell mounts asynchronously (queries resolve after first paint), so
  // wait for the search box before taking synchronous computed-style reads.
  const search = page.getByRole('textbox', { name: 'Search library' });
  await expect.element(search).toBeVisible();

  // Pill search, settings gear, mini/full mode toggle, view switcher. The
  // search control is the 28px pill container, not the inner text field.
  const pill = search.element().parentElement as HTMLElement;
  expect(getComputedStyle(pill).height).toBe('28px');
  expect(heightOf(nav.getByRole('link', { name: 'Settings' }))).toBe('28px');
  expect(
    heightOf(nav.getByRole('button', { name: /Switch to (mini|full) mode/ })),
  ).toBe('28px');
  expect(heightOf(nav.getByRole('button', { name: 'Switch view' }))).toBe(
    '28px',
  );
});

test('clear search uses the icon set with a 24px hit box', async () => {
  const search = page.getByRole('textbox', { name: 'Search library' });
  await search.fill('Blues');

  const clear = page.getByRole('button', { name: 'Clear search' });
  await expect.element(clear).toBeVisible();

  const box = (clear.element() as HTMLElement).getBoundingClientRect();
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);

  // Icon-set glyph, not the one-off 16px Arial multiplication-sign character.
  expect((clear.element() as HTMLElement).querySelector('svg')).not.toBeNull();

  const pill = (search.element() as HTMLElement).parentElement as HTMLElement;
  // No stale multiplication-sign text glyph (char code 215): the clear
  // control is the rotated-plus icon now.
  expect(pill.textContent?.includes(String.fromCharCode(215))).toBe(false);
});

test('no raw :white_check_mark: text reaches the UI', async () => {
  expect(document.body.textContent).not.toContain(':white_check_mark:');
});

test.runIf(PLATFORM === 'windows')(
  'open menus render a real check glyph, not the shortcode',
  async () => {
    await setMenuVisible(true);
    await page.getByRole('button', { name: 'Playback' }).click();
    await expect
      .element(page.getByRole('menu', { name: 'Playback' }))
      .toBeVisible();

    expect(document.body.textContent).not.toContain(':white_check_mark:');
  },
);

test('the version string renders exactly once', async () => {
  const matches = document.body.textContent?.match(/v\d+\.\d+\.\d+/g) ?? [];
  // The TitleBar owns the version; the Header must not repeat it.
  expect(matches.length).toBe(PLATFORM === 'windows' ? 1 : 0);
});

test('the status-bar library cell may shrink instead of pushing cells off-screen', async () => {
  // The ledger renders in full mode only; the mock boots `minimal`. Flip it
  // through the config bridge, the same seam `setMenuVisible` below uses.
  const bridge = await appBridge();
  bridge.config = { ...bridge.config, ui_mode: 'full' };
  await invalidateConfig();
  const bar = page.getByRole('contentinfo', { name: 'Status bar' });
  await expect.element(bar).toBeVisible();

  const library = (bar.element() as HTMLElement).firstElementChild;
  expect(library).not.toBeNull();
  expect(getComputedStyle(library as Element).flexShrink).toBe('1');
});

test.runIf(PLATFORM === 'windows')(
  'titlebar buttons use the pointer cursor',
  async () => {
    const bar = page.getByRole('toolbar', { name: 'Window title bar' });
    expect(
      getComputedStyle(
        bar.getByRole('button', { name: 'Minimize' }).element() as HTMLElement,
      ).cursor,
    ).toBe('pointer');
  },
);

test.runIf(PLATFORM === 'windows')(
  'switcher and menubar menus share one menu panel',
  async () => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await nav.getByRole('button', { name: 'Switch view' }).click();
    const switcherMenu = page.getByRole('menu', { name: 'Views' });
    await expect.element(switcherMenu).toBeVisible();
    const switcherMinWidth = getComputedStyle(
      switcherMenu.element() as HTMLElement,
    ).minWidth;

    await userEvent.keyboard('{Escape}');

    await setMenuVisible(true);
    // Exact: a loose `View` also substring-matches the header `Switch view`
    // button (strict-mode violation). The menubar button is exactly `View`.
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const menuBarMenu = page.getByRole('menu', { name: 'View' });
    await expect.element(menuBarMenu).toBeVisible();
    const menuBarMinWidth = getComputedStyle(
      menuBarMenu.element() as HTMLElement,
    ).minWidth;

    expect(switcherMinWidth).toBe(menuBarMinWidth);
  },
);
