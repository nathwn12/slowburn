/**
 * Track-list header sort control.
 *
 * The header is a control over the ordered `library_sort_keys` stack: clicking a
 * field not in the stack appends it, clicking a stacked field cycles
 * asc -> desc -> off, shift-click resets the stack to the single clicked field,
 * and a numbered badge renders the key's position in the stack.
 *
 * Silent by construction: only `TrackListHeader` is rendered and the config
 * bridge is mocked, so no audio graph is ever built and the app is never
 * launched. The browser is launched with `--mute-audio` as a second layer.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';
import { cleanup, render } from 'vitest-browser-react';

import type { Config, SortKey, Track } from '../../generated/typings';
import { MOCK_CONFIG } from '../../lib/__mocks__/bridge-config';
import { configQuery } from '../../lib/queries';
import { SORT_PRESETS } from '../../lib/sort-presets';
import { sortTracks } from '../../lib/utils-library';
import { messages } from '../../translations/en.po';
import TrackListHeader from '../TrackListHeader';

const harness = vi.hoisted(() => ({
  config: {} as Config,
  multiSet: vi.fn<(updates: Partial<Config>) => Promise<void>>(async () => {}),
}));

vi.mock('../../lib/bridge-config', () => ({
  default: {
    getAll: async () => harness.config,
    getInitial: (key: string) =>
      (harness.config as unknown as Record<string, unknown>)[key],
    multiSet: harness.multiSet,
  },
}));

/** The bundle the control falls back to when the last key is removed. */
const DEFAULT_KEYS: SortKey[] = [
  { field: 'fileModified', direction: 'Dsc' },
  { field: 'artist', direction: 'Asc' },
  { field: 'album', direction: 'Asc' },
  { field: 'diskNo', direction: 'Asc' },
  { field: 'trackNo', direction: 'Asc' },
];

const ARTIST_ASC: SortKey = { field: 'artist', direction: 'Asc' };

async function mount(stack: SortKey[]): Promise<void> {
  harness.config = { ...MOCK_CONFIG, library_sort_keys: stack };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(configQuery.queryKey, harness.config);

  await render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        <TrackListHeader />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const sortButton = (name: string) =>
  page
    .getByRole('group', { name: 'Track list sorting options' })
    .getByRole('button', { name });

const badge = (name: string, position: string) =>
  sortButton(name).getByText(position, { exact: true });

/** The key stack from the most recent write to the config bridge. */
function lastWrittenKeys(): SortKey[] {
  const calls = harness.multiSet.mock.calls;
  return calls.at(-1)?.[0].library_sort_keys as SortKey[];
}

beforeEach(() => {
  i18n.load('en', messages);
  i18n.activate('en');
  vi.clearAllMocks();
});

afterEach(async () => {
  await cleanup();
});

test('clicking a field not in the stack appends it as the last key', async () => {
  await mount([ARTIST_ASC]);

  await sortButton('Title').click();

  await expect
    .poll(lastWrittenKeys)
    .toStrictEqual([ARTIST_ASC, { field: 'title', direction: 'Asc' }]);
  await expect.element(badge('Artist', '1')).toBeVisible();
  await expect.element(badge('Title', '2')).toBeVisible();
});

test('clicking the active ascending field makes it descending', async () => {
  await mount([ARTIST_ASC]);

  await sortButton('Artist').click();

  await expect
    .poll(lastWrittenKeys)
    .toStrictEqual([{ field: 'artist', direction: 'Dsc' }]);
});

test('clicking the active descending field removes it', async () => {
  await mount([
    { field: 'artist', direction: 'Dsc' },
    { field: 'album', direction: 'Asc' },
  ]);

  await sortButton('Artist').click();

  await expect
    .poll(lastWrittenKeys)
    .toStrictEqual([{ field: 'album', direction: 'Asc' }]);
});

test('removing the only key restores the default bundle', async () => {
  await mount([{ field: 'artist', direction: 'Dsc' }]);

  await sortButton('Artist').click();

  await expect.poll(lastWrittenKeys).toStrictEqual(DEFAULT_KEYS);
  // The default bundle puts artist second (fileModified owns position 1).
  await expect.element(badge('Artist', '2')).toBeVisible();
  await expect.element(badge('Album', '3')).toBeVisible();
});

test('shift-click replaces the stack with the single clicked field', async () => {
  await mount([ARTIST_ASC, { field: 'album', direction: 'Asc' }]);

  await sortButton('Title').click({ modifiers: ['Shift'] });

  await expect
    .poll(lastWrittenKeys)
    .toStrictEqual([{ field: 'title', direction: 'Asc' }]);
});

test('shift-clicking a field already in the stack leaves one key', async () => {
  await mount([ARTIST_ASC, { field: 'album', direction: 'Dsc' }]);

  await sortButton('Artist').click({ modifiers: ['Shift'] });

  await expect.poll(lastWrittenKeys).toStrictEqual([ARTIST_ASC]);
});

test('renders a badge numbered by stack position, not column position', async () => {
  // Column render order is Title, Duration, Artist, Album, Genre. This stack is
  // deliberately orthogonal to it: duration first, album second, title third.
  await mount([
    { field: 'duration', direction: 'Asc' },
    { field: 'album', direction: 'Asc' },
    { field: 'title', direction: 'Asc' },
  ]);

  await expect.element(badge('Duration', '1')).toBeVisible();
  await expect.element(badge('Album', '2')).toBeVisible();
  await expect.element(badge('Title', '3')).toBeVisible();
});

/* --------------------------------------------------------------------------
 * Presets (Task 2)
 * ------------------------------------------------------------------------ */

function makeTrack(overrides: Partial<Track>): Track {
  return {
    id: 'id',
    path: '/music/track.flac',
    title: 'Title',
    album: 'Album',
    album_artist: 'Artist',
    artists: ['Artist'],
    genres: ['Genre'],
    year: 2024,
    duration: 100,
    track_no: 1,
    track_of: 1,
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
    play_count: 0,
    last_played: null,
    ...overrides,
  };
}

/**
 * A fixture built so each preset yields a *different* order:
 * - modified  (desc): a, b, c
 * - dateAdded (desc): c, b, a
 * - artist    (asc) : b, c, a
 * - album     (asc) : a, c, b  (One < Three < Two)
 * - duration  (asc) : b, a, c
 * - playCount (desc): c, a, b
 */
const PRESET_FIXTURE: Track[] = [
  makeTrack({
    id: 'a',
    title: 'Alpha',
    artists: ['Zed'],
    album: 'One',
    duration: 200,
    date_added: '2023-01-01T00:00:00Z',
    modified: 300,
    play_count: 5,
  }),
  makeTrack({
    id: 'b',
    title: 'Bravo',
    artists: ['Amy'],
    album: 'Two',
    duration: 100,
    date_added: '2024-01-01T00:00:00Z',
    modified: 200,
    play_count: 1,
  }),
  makeTrack({
    id: 'c',
    title: 'Charlie',
    artists: ['Mia'],
    album: 'Three',
    duration: 300,
    date_added: '2025-01-01T00:00:00Z',
    modified: 100,
    play_count: 9,
  }),
];

const trackIds = (tracks: Track[]) => tracks.map((track) => track.id);

test('applying a preset replaces the whole stack', async () => {
  await mount([ARTIST_ASC]);

  await page
    .getByRole('combobox', { name: 'Sort' })
    .selectOptions('Most played');

  const mostPlayed = SORT_PRESETS.find((preset) => preset.id === 'mostPlayed');
  expect(mostPlayed).toBeDefined();
  await expect.poll(lastWrittenKeys).toStrictEqual(mostPlayed?.keys);
});

test('applying a preset updates every visible badge', async () => {
  await mount(DEFAULT_KEYS);
  // The default stack renders artist second, album third.
  await expect.element(badge('Artist', '2')).toBeVisible();
  await expect.element(badge('Album', '3')).toBeVisible();

  await page.getByRole('combobox', { name: 'Sort' }).selectOptions('Length');

  const length = SORT_PRESETS.find((preset) => preset.id === 'length');
  expect(length).toBeDefined();
  await expect.poll(lastWrittenKeys).toStrictEqual(length?.keys);

  // Every badge moved together: only duration is now in the stack.
  await expect.element(badge('Duration', '1')).toBeVisible();
  await expect.element(badge('Artist', '2')).not.toBeInTheDocument();
  await expect.element(badge('Album', '3')).not.toBeInTheDocument();
});

test('each preset sorts a fixture into its own distinct order', () => {
  const orders = new Map(
    SORT_PRESETS.map((preset) => [
      preset.id,
      trackIds(sortTracks(PRESET_FIXTURE, preset.keys)),
    ]),
  );

  // Six presets, six distinct orders: no preset is a copy of another.
  expect(new Set([...orders.values()].map((ids) => ids.join(','))).size).toBe(
    SORT_PRESETS.length,
  );

  // And each is the order its name promises.
  expect(orders.get('recentlyModified')).toStrictEqual(['a', 'b', 'c']);
  expect(orders.get('recentlyAdded')).toStrictEqual(['c', 'b', 'a']);
  expect(orders.get('artistAlbum')).toStrictEqual(['b', 'c', 'a']);
  expect(orders.get('album')).toStrictEqual(['a', 'c', 'b']);
  expect(orders.get('length')).toStrictEqual(['b', 'a', 'c']);
  expect(orders.get('mostPlayed')).toStrictEqual(['c', 'a', 'b']);
});
