/**
 * Settings overflow acceptance: the Library folder list must never force a
 * horizontal scrollbar, and long folder paths must truncate with an ellipsis
 * (full path kept in `title`) instead of clipping mid-word.
 *
 * Black-box only: navigation via the existing Settings route, assertions via
 * accessible roles plus geometry reads. No imports of route components.
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import { beforeEachSetup, getMainNavigation } from './e2e-helpers';

beforeEachSetup();

async function gotoLibrarySettings(): Promise<void> {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await expect
    .element(page.getByRole('button', { name: 'Add folder' }))
    .toBeVisible();
}

function foldersList() {
  return page.getByRole('list', { name: 'Library folders' });
}

test('the folder list and the page never scroll horizontally', async () => {
  await gotoLibrarySettings();
  await expect.element(foldersList()).toBeVisible();

  const list = foldersList().element() as HTMLElement;
  expect(list.scrollWidth, 'folders list scrollWidth').toBeLessThanOrEqual(
    list.clientWidth + 1,
  );
  expect(
    document.documentElement.scrollWidth,
    'page scrollWidth',
  ).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);
});

test('the folder path truncates with an ellipsis and keeps its full title', async () => {
  await gotoLibrarySettings();

  const row = foldersList().getByRole('listitem', {
    name: /\/home\/user\/music/,
  });
  await expect.element(row).toBeVisible();

  const pathEl = row.getByText('/home/user/music').element() as HTMLElement;
  expect(getComputedStyle(pathEl).textOverflow).toBe('ellipsis');
  expect(pathEl.title).toBe('/home/user/music');
});

test('every settings section fits without a page-level horizontal scrollbar', async () => {
  await gotoLibrarySettings();

  const settingsNav = page.getByRole('navigation', {
    name: 'Settings sections',
  });

  for (const section of [
    'Library',
    'Audio',
    'Interface',
    'About',
    'Advanced',
  ]) {
    await settingsNav.getByRole('link', { name: section, exact: true }).click();
    expect(
      document.documentElement.scrollWidth,
      `${section} page scrollWidth`,
    ).toBeLessThanOrEqual(document.documentElement.clientWidth + 1);
  }
});
