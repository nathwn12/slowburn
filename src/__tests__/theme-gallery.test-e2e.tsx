/**
 * S1 themes: the appearance gallery scans every `src/themes/*.json` flavor,
 * `__system` stays the default, and the art-tint toggle flips `--main-color`.
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

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
