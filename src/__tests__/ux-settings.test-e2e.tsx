/**
 * Settings/edit-track UX acceptance: the settings seam affordances.
 *
 * Black-box only: navigation through the real app surface, assertions via
 * accessible roles plus DOM reads. Covers the read-only audit findings:
 * - an unknown year never renders as `0` (clearing Year stays empty)
 * - every settings select carries a visible chevron indicator
 * - the accent swatch ships a hex readout and its Reset lives outside <p>
 * - Save on edit-track is the primary action
 * - the library status line renders once, not per folder row
 * - the danger zone is a bordered panel with a warning-styled title
 * - sort presets render translated labels, not raw labelKeys
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getMainNavigation,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

async function openInterfaceSettings(): Promise<void> {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Interface' }).click();
}

async function openAdvancedSettings(): Promise<void> {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Advanced' }).click();
}

async function openEditTrack(): Promise<void> {
  await setupScannedLibrary();
  window.location.hash = '#/tracks/0';
  await expect
    .element(page.getByRole('heading', { name: /Edit/ }))
    .toBeVisible();
}

test('an unknown year renders empty, never 0', async () => {
  await openEditTrack();

  const year = page.getByRole('spinbutton', { name: 'Year' });
  await expect.element(year).toBeVisible();

  // The mock track ships year 2025: a real value still renders.
  expect((year.element() as HTMLInputElement).value).toBe('2025');

  // Clearing the field is "unknown", not zero: it must stay empty.
  await year.fill('');
  expect((year.element() as HTMLInputElement).value).toBe('');
});

test('settings selects render a chevron indicator', async () => {
  await openInterfaceSettings();

  const mode = page.getByRole('combobox', { name: 'Mode' });
  await expect.element(mode).toBeVisible();

  const selectEl = mode.element() as HTMLSelectElement;
  const chevron = selectEl.parentElement?.querySelector('span');
  expect(chevron?.textContent).toContain('▾');
  expect(chevron?.getAttribute('aria-hidden')).toBe('true');
});

test('the accent swatch ships a hex readout', async () => {
  await openInterfaceSettings();

  await expect.element(page.getByText(/^#[0-9A-F]{6}$/i)).toBeVisible();
});

test('the accent Reset button lives in its own row, not inside a <p>', async () => {
  await openInterfaceSettings();

  const reset = page.getByRole('button', { name: 'Reset' });
  await expect.element(reset).toBeVisible();
  expect((reset.element() as HTMLElement).closest('p')).toBeNull();
});

test('edit-track Save carries the primary affordance', async () => {
  await openEditTrack();

  const save = page.getByRole('button', { name: 'Save' });
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await expect.element(save).toBeVisible();

  const saveBg = getComputedStyle(
    save.element() as HTMLElement,
  ).backgroundColor;
  const cancelBg = getComputedStyle(
    cancel.element() as HTMLElement,
  ).backgroundColor;
  expect(saveBg).not.toBe(cancelBg);
});

test('the library status renders once above the list, not per row', async () => {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await expect
    .element(page.getByRole('button', { name: 'Add folder' }))
    .toBeVisible();

  // One status line for the whole list...
  await expect
    .element(page.getByText('Up to date', { exact: true }))
    .toBeVisible();

  // ...and none repeated inside the folder rows.
  const row = page
    .getByRole('list', { name: 'Library folders' })
    .getByRole('listitem', { name: /\/home\/user\/music/ });
  await expect.element(row).toBeVisible();
  await expect
    .element(row.getByText('Up to date', { exact: true }))
    .not.toBeInTheDocument();
});

test('the danger zone is a bordered panel with a warning-styled title', async () => {
  await openAdvancedSettings();

  const heading = page.getByRole('heading', { name: 'Danger zone' });
  await expect.element(heading).toBeVisible();

  const panel = (heading.element() as HTMLElement).closest('div');
  expect(panel).not.toBeNull();
  expect(getComputedStyle(panel as HTMLElement).borderStyle).toBe('solid');

  const titleColor = getComputedStyle(heading.element() as HTMLElement).color;
  const panelColor = getComputedStyle(panel as HTMLElement).color;
  expect(titleColor).not.toBe(panelColor);
});

test('advanced sort presets render translated labels', async () => {
  await openAdvancedSettings();

  const preset = page.getByRole('combobox', { name: 'Sort preset' });
  await expect.element(preset).toBeVisible();

  for (const name of [
    'Recently modified',
    'Recently added',
    'Artist / Album',
    'Album',
    'Length',
    'Most played',
  ]) {
    await expect
      .element(preset.getByRole('option', { name, exact: true }))
      .toBeInTheDocument();
  }
});
