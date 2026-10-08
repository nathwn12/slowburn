/**
 * S2 settings IA acceptance: the Advanced section.
 *
 * RED spec - the S2 builder turns these green. This file asserts only the
 * future black-box surface (routes reached through the settings nav and
 * accessible roles on screen); it never imports not-yet-existing components.
 *
 * Acceptance covered:
 * - an Advanced section exists in settings
 * * - every relocated Config key is reachable within 2 clicks from the main
 *   navigation (Settings -> Advanced, then no further navigation):
 *   sort-keys editor, autorefresh, stream server, follow-playing-track,
 *   menu bar, reset library (there is no platform-compatibility control:
 *   the removed Linux-only flag has no successor on Windows)
 * - the library reset stays contained in a danger zone
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import { beforeEachSetup, getMainNavigation } from './e2e-helpers';

beforeEachSetup();

/**
 * Settings (click 1) -> Advanced (click 2): the whole S2 surface must be
 * visible after exactly these two clicks, with no further navigation.
 */
async function openAdvancedSettings(): Promise<void> {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Advanced' }).click();
}

test('Advanced section is reachable within 2 clicks from the main navigation', async () => {
  await openAdvancedSettings();

  await expect
    .element(page.getByRole('heading', { name: 'Advanced' }))
    .toBeVisible();
});

test('every relocated Config key is reachable on the Advanced screen with no further navigation', async () => {
  await openAdvancedSettings();

  await expect
    .element(page.getByRole('heading', { name: 'Sort keys' }))
    .toBeVisible();
  await expect
    .element(
      page.getByRole('checkbox', {
        name: 'Automatically refresh library on startup',
      }),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole('checkbox', { name: /stream server/i }))
    .toBeVisible();
  await expect
    .element(page.getByRole('checkbox', { name: /follow.*playing/i }))
    .toBeVisible();
  await expect
    .element(page.getByRole('checkbox', { name: /menu bar/i }))
    .toBeVisible();
  // The removed Linux-only flag has no successor: the Advanced screen
  // offers no platform-compatibility control.
  await expect
    .element(page.getByRole('checkbox', { name: /compat/i }))
    .not.toBeInTheDocument();
});

test('the library reset stays contained in the Advanced danger zone', async () => {
  await openAdvancedSettings();

  await expect
    .element(page.getByRole('heading', { name: 'Danger zone' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Reset library' }))
    .toBeVisible();
});
