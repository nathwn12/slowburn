/**
 * Queue "Most played" ordering.
 *
 * The chip was a real `play_count` descending sort, but applied *after*
 * pagination: it ranked only the first 20 upcoming rows, so "most played" meant
 * "most played among the rows already on screen" and the top row was not
 * reliably the most-played track. The fix sorts the whole queue before
 * paginating, and this test pins both the order and the label.
 *
 * Silent by construction: `player` and the database bridge are mocked, so no
 * audio graph is ever built and the app is never launched. The browser is
 * launched with `--mute-audio` as a second layer.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';
import { cleanup, render } from 'vitest-browser-react';

import type { Track } from '../../generated/typings';
import { MOCK_CONFIG } from '../../lib/__mocks__/bridge-config';
import { configQuery } from '../../lib/queries';
import { messages } from '../../translations/en.po';
import Queue from '../Queue';

vi.mock('../../lib/player', () => ({
  default: {
    setQueue: vi.fn<() => void>(),
    clearQueue: vi.fn<() => void>(),
    removeFromQueue: vi.fn<() => void>(),
    startFromQueue: vi.fn<() => void>(),
    getAbLoop: () => ({
      trackId: null,
      enabled: true,
      active: false,
      startSeconds: null,
      endSeconds: null,
    }),
    on: vi.fn<() => void>(),
    off: vi.fn<() => void>(),
    // S4: Queue reads queueOrigin/shuffle via usePlayerState -> getState.
    getState: () => ({ queueOrigin: null, shuffle: false }),
  },
}));

vi.mock('../../lib/bridge-database', () => ({
  default: { getAbLoop: async () => null, getAllPlaylists: async () => [] },
}));

function makeTrack(index: number): Track {
  return {
    id: `id-${index}`,
    path: `/music/track-${index}.flac`,
    title: `Track ${index}`,
    album: `Album ${index}`,
    album_artist: 'Artist',
    artists: ['Artist'],
    genres: ['Genre'],
    year: 2024,
    duration: 100,
    track_no: index + 1,
    track_of: 25,
    disk_no: 1,
    disk_of: 1,
    is_compilation: false,
    format: 'flac',
    is_lossless: true,
    sample_rate: 44100,
    bit_depth: 16,
    channels: 2,
    bitrate: 1_000_000,
    file_size: 1_000,
    modified: 0,
    date_added: '2026-01-01T00:00:00Z',
    play_count: index,
    last_played: null,
  };
}

/** More upcoming rows than one page (INITIAL_QUEUE_SIZE = 20). */
const QUEUE: Track[] = Array.from({ length: 25 }, (_, index) =>
  makeTrack(index),
);

const rowAt = (index: number) =>
  page.getByRole('listbox', { name: 'Queue' }).getByRole('option').nth(index);

async function mount(): Promise<void> {
  // Queue reads config via useSuspenseQuery(configQuery) to compute isMini,
  // so the render needs a client seeded with a non-mini config (same pattern
  // as sort-control.test-e2e.tsx). MOCK_CONFIG's ui_mode is 'minimal'.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(configQuery.queryKey, { ...MOCK_CONFIG });

  await render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <Queue queue={QUEUE} queueCursor={0} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  i18n.load('en', messages);
  i18n.activate('en');
  vi.clearAllMocks();
});

afterEach(async () => {
  await cleanup();
});

test('most-played ordering considers the whole queue, not the first page', async () => {
  await mount();

  // Row 0 is the playing track (queue index 0); rows 1.. are upcoming.
  // Before "Most played" is on, the upcoming order is the queue order, and
  // the trigger button names the Manual order.
  await expect.element(rowAt(1)).toHaveTextContent('Track 1');
  await expect
    .element(page.getByRole('button', { name: 'Sort: Manual' }))
    .toBeVisible();

  // The sort state is a clickable control: open the menu and pick Most played.
  await page.getByRole('button', { name: 'Sort: Manual' }).click();
  await page.getByRole('menuitemradio', { name: 'Most played' }).click();

  // Track 24 has the highest play_count and sits *after* the first page. If the
  // sort runs after pagination it never reaches this row.
  await expect.element(rowAt(1)).toHaveTextContent('Track 24');
  await expect.element(rowAt(2)).toHaveTextContent('Track 23');

  // Review Focus 5: the label and the behaviour move together. The old
  // static `sorted: most played` span is gone; the state is now announced
  // through the trigger button's accessible name.
  await expect
    .element(page.getByRole('button', { name: 'Sort: Most played' }))
    .toBeVisible();
  await expect
    .element(page.getByText('sorted: most played'))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByText('sorted: manual'))
    .not.toBeInTheDocument();

  // A sort is a view, never a mutation of the stored queue.
  expect(QUEUE.map((track) => track.id)).toStrictEqual(
    Array.from({ length: 25 }, (_, index) => `id-${index}`),
  );
});

test('the sort menu offers exactly the two orders the queue honours', async () => {
  await mount();

  await page.getByRole('button', { name: 'Sort: Manual' }).click();
  const menu = page.getByRole('menu', { name: 'Queue sort options' });
  await expect.element(menu).toBeVisible();
  await expect
    .element(menu.getByRole('menuitemradio', { name: 'Manual' }))
    .toHaveAttribute('aria-checked', 'true');
  await expect
    .element(menu.getByRole('menuitemradio', { name: 'Most played' }))
    .toHaveAttribute('aria-checked', 'false');

  // Choosing Manual keeps the queue order and closes the menu back onto a
  // trigger that still names the Manual order.
  await menu.getByRole('menuitemradio', { name: 'Manual' }).click();
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(rowAt(1)).toHaveTextContent('Track 1');
  await expect
    .element(page.getByRole('button', { name: 'Sort: Manual' }))
    .toBeVisible();
});
