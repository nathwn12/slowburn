/**
 * S1 themes: the appearance gallery scans every `src/themes/*.json` flavor,
 * `__system` stays the default, and the art-tint toggle flips `--main-color`.
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import type { Config } from '../generated/typings';
import { beforeEachSetup, getMainNavigation } from './e2e-helpers';

beforeEachSetup();

async function openAppearance(): Promise<void> {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Interface' }).click();
}

async function persistedAccent(): Promise<string> {
  // Dynamic import: `player` reads the injected config at module load, which
  // only exists after `beforeEachSetup` has run.
  const { DEFAULT_MAIN_COLOR } = await import('../api/SettingsAPI');
  return DEFAULT_MAIN_COLOR;
}

function rootVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name).trim();
}

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

test('gallery lists System plus the 4 scanned flavors', async () => {
  await openAppearance();

  for (const name of [
    'System (default)',
    'Light',
    'Dark',
    'Dark Warm',
    'AMOLED',
  ]) {
    await expect
      .element(page.getByRole('radio', { name, exact: true }))
      .toBeVisible();
  }
});

test('selecting AMOLED applies its pure-black background', async () => {
  await openAppearance();

  await page.getByRole('radio', { name: 'AMOLED', exact: true }).click();

  expect(rootVar('--background')).toBe('#000000');
  expect(rootVar('--bg')).toBe('#000000');
});

test('a stored AMOLED choice survives a reload', async () => {
  await openAppearance();

  await page.getByRole('radio', { name: 'AMOLED', exact: true }).click();

  // The write path persists the choice, not just paints it.
  const bridge = await appBridge();
  expect(bridge.config.theme).toBe('amoled');

  // Simulate a reload: wipe the painted variables, then re-run the real boot
  // path against the persisted value while the OS reports light.
  document.documentElement.removeAttribute('style');
  expect(rootVar('--background')).toBe('');

  const { applyBootTheme, default: SettingsAPI } =
    await import('../api/SettingsAPI');
  await applyBootTheme(bridge.config.theme, 'light');

  // Still AMOLED: the stored flavor wins over the OS theme, the radio stays
  // selected, and the stored value was not clobbered by the fallback.
  expect(rootVar('--background')).toBe('#000000');
  expect(rootVar('--bg')).toBe('#000000');
  expect(bridge.config.theme).toBe('amoled');
  expect(
    (
      page
        .getByRole('radio', { name: 'AMOLED', exact: true })
        .element() as HTMLInputElement
    ).checked,
  ).toBe(true);

  // The wipe above also cleared the accent; repaint what the boot path paints
  // so later tests start from the booted state (`init` runs once per file).
  const { DEFAULT_MAIN_COLOR } = await import('../api/SettingsAPI');
  SettingsAPI.applyUIMainColorToUI(
    bridge.config.ui_accent_color ?? DEFAULT_MAIN_COLOR,
  );
});

test('an OS theme change never clobbers a picked flavour, but follows __system', async () => {
  const { handleSystemThemeChange } = await import('../components/AppEvents');
  const { default: SettingsAPI } = await import('../api/SettingsAPI');
  const bridge = await appBridge();

  // A picked flavour survives an OS flip: paint AMOLED, store it, then the OS
  // reports light - the painted variables must not move.
  bridge.config.theme = 'amoled';
  SettingsAPI.applyThemeToUI('amoled');
  expect(rootVar('--background')).toBe('#000000');

  await handleSystemThemeChange('light');

  expect(rootVar('--background')).toBe('#000000');
  expect(bridge.config.theme).toBe('amoled');

  // `__system` still follows the OS: the same event repaints to light.
  bridge.config.theme = '__system';
  await handleSystemThemeChange('light');

  expect(rootVar('--background')).toBe('hsl(0, 0%, 100%)');

  // Restore the default for later tests in this file.
  bridge.config.theme = 'light';
  SettingsAPI.applyThemeToUI('light');
});

test('art-tint toggle persists and restores the accent without a track', async () => {
  await openAppearance();

  const tint = page.getByRole('checkbox', {
    name: 'Tint accent from cover art',
  });
  await expect.element(tint).toBeVisible();

  // Default off: the persisted accent is applied
  expect(rootVar('--main-color')).toBe(await persistedAccent());

  // On with no playing track: falls back to the persisted accent, no crash
  await tint.click();
  expect(rootVar('--main-color')).toBe(await persistedAccent());

  // Off again: still the persisted accent
  await tint.click();
  expect(rootVar('--main-color')).toBe(await persistedAccent());
});
