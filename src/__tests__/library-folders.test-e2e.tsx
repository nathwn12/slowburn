/**
 * S3 multi-folder UX acceptance (RED scaffold - builder turns it green).
 *
 * Slowburn stores `library_folders: Vec<PathBuf>` (default empty) with
 * add/remove via LibraryAPI addLibraryFolders/removeRedundantFolders and
 * scanning via LibraryAPI.scan. S3 adds a per-root list UX on top of that
 * foundation: one row per root with its own path, track count and status,
 * plus rescan-all (distinct from Refresh-tags), remove-then-prune, and an
 * empty-state when no roots remain.
 *
 * Black-box only: navigation via the existing Settings route, assertions via
 * accessible roles/names. No imports of not-yet-existing components. Every
 * test below targets the future S3 surface, so each currently fails with an
 * element-not-found style RED.
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import type { Config } from '../generated/typings';
import { beforeEachSetup, getMainNavigation } from './e2e-helpers';

beforeEachSetup();

async function gotoLibrarySettings(): Promise<void> {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  // `/settings` redirects to `/settings/library`, the S3 surface.
  await expect
    .element(page.getByRole('button', { name: 'Add folder' }))
    .toBeVisible();
}

function foldersList() {
  return page.getByRole('list', { name: 'Library folders' });
}

async function setLibraryFolders(folders: Array<string>): Promise<void> {
  const mod = (await import('../lib/bridge-config')) as unknown as {
    default: { config: Config };
  };
  mod.default.config = { ...mod.default.config, library_folders: folders };
  const { default: queryClient } = await import('../lib/query-client');
  const { configQuery } = await import('../lib/queries');
  await queryClient.invalidateQueries({ queryKey: configQuery.queryKey });
}

test('each library root renders its own row with path, count and status', async () => {
  await gotoLibrarySettings();

  // One named list owns every root ...
  await expect.element(foldersList()).toBeVisible();

  // ... with a per-root row carrying the mock root's path ...
  const row = foldersList().getByRole('listitem', {
    name: /\/home\/user\/music/,
  });
  await expect.element(row).toBeVisible();

  // ... plus that root's track count and scan status, inside its own row.
  await expect.element(row.getByText(/track/)).toBeVisible();
  await expect
    .element(row.getByText(/up to date|scanned|needs rescan|scanning/i))
    .toBeVisible();
});

test('rescan-all is offered separately from refresh-tags', async () => {
  await gotoLibrarySettings();

  // The future bulk action: re-walk every root, distinct from tag refresh.
  await expect
    .element(page.getByRole('button', { name: 'Rescan all' }))
    .toBeVisible();

  // The existing tag-refresh path stays alongside it, not renamed into it.
  await expect
    .element(page.getByRole('button', { name: 'Refresh' }))
    .toBeVisible();
});

test('adding via the existing Add folder path lands a per-root row', async () => {
  await gotoLibrarySettings();

  // The entry point is the existing dialog button - S3 keeps that path.
  await expect
    .element(page.getByRole('button', { name: 'Add folder' }))
    .toBeVisible();

  // ... and whatever it adds must appear as a row in the per-root list.
  await expect.element(foldersList()).toBeVisible();
  await expect
    .element(
      foldersList().getByRole('listitem', {
        name: /\/home\/user\/music/,
      }),
    )
    .toBeVisible();
});

test('removing a root offers a per-folder remove that prunes its tracks', async () => {
  await gotoLibrarySettings();

  // Each row carries its own remove control, named for the folder it drops -
  // not the legacy single shared "Remove" button.
  await expect
    .element(
      page.getByRole('button', {
        name: 'Remove folder /home/user/music',
      }),
    )
    .toBeVisible();
});

test('empty-state appears when no library roots remain', async () => {
  await setLibraryFolders([]);
  await gotoLibrarySettings();

  await expect.element(foldersList()).not.toBeInTheDocument();
  await expect.element(page.getByText(/No library folders yet/)).toBeVisible();
});
