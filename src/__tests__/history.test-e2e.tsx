/**
 * Play-history surface: a first-class view beside the play queue.
 *
 * Black-box only: role/name selectors against the live shell, no component
 * imports. The history route renders played tracks newest-first with their
 * play facts, offers the header view switcher as its entry point, and shows
 * a translated empty state with a way back to the library when nothing was
 * played yet.
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import type { Track } from '../generated/typings';
import { beforeEachSetup, setupScannedLibrary } from './e2e-helpers';

beforeEachSetup();

function historyList() {
  return page.getByRole('listbox', { name: 'Play history' });
}

function historyRows() {
  return historyList().getByRole('option');
}

type MockLibraryHolder = typeof globalThis & {
  __MUSEEKS_MOCK_TRACKS?: Array<Track>;
};

/**
 * Give the scanned mock library a two-track history: Whiskey Blues played
 * 5 times yesterday sorts before Majestic Blues played twice 3 days ago,
 * and Romantic Blues stays unplayed. The mock `getAllTracks` returns the
 * live store, so a query refetch picks the plays up; mapped copies keep the
 * shared `MOCK_TRACKS` fixtures pristine for later tests.
 */
async function seedTwoPlayedTracks(): Promise<void> {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();

  const store = (globalThis as MockLibraryHolder).__MUSEEKS_MOCK_TRACKS ?? [];
  (globalThis as MockLibraryHolder).__MUSEEKS_MOCK_TRACKS = store.map(
    (track) => {
      if (track.title === 'Whiskey Blues') {
        return { ...track, play_count: 5, last_played: yesterday };
      }
      if (track.title === 'Majestic Blues') {
        return { ...track, play_count: 2, last_played: threeDaysAgo };
      }
      return track;
    },
  );

  const { default: queryClient } = await import('../lib/query-client.ts');
  const { allTracksQuery } = await import('../lib/queries.ts');
  await queryClient.refetchQueries({ queryKey: allTracksQuery.queryKey });
}

test('the view switcher reaches history and the empty state leads back', async () => {
  await setupScannedLibrary();

  // The header view switcher is the entry point, beside Queue.
  await page.getByRole('button', { name: 'Switch view' }).click();
  await page
    .getByRole('menu', { name: 'Views' })
    .getByRole('menuitem', {
      name: 'History',
    })
    .click();

  // Nothing was played in the scanned mock library: the empty state shows.
  await expect
    .element(page.getByRole('heading', { name: /history/i }))
    .toBeVisible();
  await expect.element(page.getByText('No play history yet')).toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Browse the library' }))
    .toBeVisible();

  // The empty state is a way out, not a dead end.
  await page.getByRole('button', { name: 'Browse the library' }).click();
  await expect
    .element(page.getByRole('listbox', { name: 'Track list' }))
    .toBeVisible();
});

test('played tracks render newest-first with their play facts', async () => {
  await setupScannedLibrary();
  await seedTwoPlayedTracks();
  window.location.hash = '#/history';

  await expect.element(historyList()).toBeVisible();

  // Newest play first; the unplayed track never appears.
  const rows = historyRows();
  await expect.element(rows.nth(0)).toHaveTextContent(/Whiskey Blues/);
  await expect.element(rows.nth(1)).toHaveTextContent(/Majestic Blues/);
  await expect.element(rows.nth(2)).not.toBeInTheDocument();

  // Each row carries its dense play fact: count plus relative last play.
  await expect.element(rows.nth(0)).toHaveTextContent(/5 times · yesterday/);
  await expect.element(rows.nth(1)).toHaveTextContent(/2 times · 3 days ago/);

  // Rows expose listbox position metadata like the other track surfaces.
  await expect.element(rows.nth(0)).toHaveAttribute('aria-posinset', '1');
  await expect.element(rows.nth(0)).toHaveAttribute('aria-setsize', '2');

  // Clicking a row selects it without leaving the history view.
  await rows.nth(1).click();
  await expect.element(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect.element(historyList()).toBeVisible();
});
