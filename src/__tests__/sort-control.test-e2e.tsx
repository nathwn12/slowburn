/**
 * The single readable sort control.
 *
 * The header renders ONE control naming the active sort in plain words
 * (`Sort: Recently modified`) plus a direction button that flips the primary
 * key - never the old strip of truncating per-field chips. Activating the
 * trigger opens a menu listing every supported field by its full name;
 * choosing one applies it. Multi-key editing (priority, add, remove,
 * reorder) lives inside that menu. The compact variant is the same control
 * for narrow surfaces and opens the same menu.
 *
 * Silent by construction: only `TrackListHeader`/`SortControl` plus a probe
 * list are rendered and the config bridge is mocked, so no audio graph is
 * ever built and the app is never launched.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';
import { cleanup, render } from 'vitest-browser-react';

import TrackListHeader, { SortControl } from '../components/TrackListHeader';
import type { Config, SortKey, Track } from '../generated/typings';
import { MOCK_CONFIG } from '../lib/__mocks__/bridge-config';
import { configQuery } from '../lib/queries';
import { sortTracks } from '../lib/utils-library';
import { messages } from '../translations/en.po';

const harness = vi.hoisted(() => ({
  config: {} as Config,
  multiSet: vi.fn<(updates: Partial<Config>) => Promise<void>>(async () => {}),
}));

vi.mock('../lib/bridge-config', () => ({
  default: {
    getAll: async () => harness.config,
    getInitial: (key: string) =>
      (harness.config as unknown as Record<string, unknown>)[key],
    multiSet: harness.multiSet,
  },
}));

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
 * Orders deliberately distinct per key so a reorder proves which key won:
 * - fileModified desc: a, b, c (300, 200, 100)
 * - artist asc:        b, c, a (Amy, Mia, Zed)
 * - title asc:         b, a, c (Alpha, Whiskey, Zulu)
 */
const FIXTURE: Track[] = [
  makeTrack({ id: 'a', title: 'Whiskey', artists: ['Zed'], modified: 300 }),
  makeTrack({ id: 'b', title: 'Alpha', artists: ['Amy'], modified: 200 }),
  makeTrack({ id: 'c', title: 'Zulu', artists: ['Mia'], modified: 100 }),
];

/**
 * A probe list wired exactly like the library route: it sorts through the
 * live config keys, so it reorders whenever the control writes.
 */
function ProbeList() {
  const config = useSuspenseQuery(configQuery).data;
  const ordered = sortTracks(FIXTURE, config.library_sort_keys);
  return (
    <ol aria-label="Probe order">
      {ordered.map((track) => (
        <li key={track.id}>{track.title}</li>
      ))}
    </ol>
  );
}

async function mount(stack: SortKey[], compact = false): Promise<void> {
  harness.config = { ...MOCK_CONFIG, library_sort_keys: stack };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(configQuery.queryKey, harness.config);

  await render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n}>
        {compact ? <SortControl compact /> : <TrackListHeader />}
        <ProbeList />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const headerGroup = () =>
  page.getByRole('group', { name: 'Track list sorting options' });

const sortTrigger = (name: string | RegExp) =>
  headerGroup().getByRole('button', { name });

const menu = () => page.getByRole('menu', { name: 'Sort options' });

const probeAt = (index: number) =>
  page
    .getByRole('list', { name: 'Probe order' })
    .getByRole('listitem')
    .nth(index);

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

test('the header is one readable control, not a chip strip', async () => {
  await mount([...MOCK_CONFIG.library_sort_keys]);

  // The control names the active sort in full words.
  const trigger = sortTrigger('Sort: Recently modified');
  await expect.element(trigger).toBeVisible();
  await expect.element(trigger).toHaveTextContent('Sort: Recently modified');

  // The old chip strip is gone: no preset combobox, no per-field buttons.
  await expect
    .element(page.getByRole('combobox', { name: 'Sort' }))
    .not.toBeInTheDocument();
  for (const cell of ['Title', 'Duration', 'Artist', 'Album', 'Genre']) {
    await expect
      .element(headerGroup().getByRole('button', { name: cell, exact: true }))
      .not.toBeInTheDocument();
  }
});

test('the menu lists every supported field by its full name', async () => {
  await mount([...MOCK_CONFIG.library_sort_keys]);

  await sortTrigger('Sort: Recently modified').click();
  await expect.element(menu()).toBeVisible();

  for (const field of [
    'Artist',
    'Album',
    'Title',
    'Genre',
    'Duration',
    'Track number',
    'Disc number',
    'Play count',
    'Date added',
    'Date modified',
  ]) {
    await expect
      .element(menu().getByRole('menuitem', { name: new RegExp(field) }))
      .toBeVisible();
  }

  // The presets are reachable from the same menu, by full name too.
  for (const preset of [
    'Recently modified',
    'Recently added',
    'Artist / Album',
    'Album',
    'Length',
    'Most played',
  ]) {
    await expect
      .element(menu().getByRole('menuitemradio', { name: preset, exact: true }))
      .toBeVisible();
  }
});

test('choosing a field applies it, closes the menu, and reorders the list', async () => {
  await mount([...MOCK_CONFIG.library_sort_keys]);

  // Default stack (modified desc): Whiskey, Alpha, Zulu.
  await expect.element(probeAt(0)).toHaveTextContent('Whiskey');
  await expect.element(probeAt(1)).toHaveTextContent('Alpha');
  await expect.element(probeAt(2)).toHaveTextContent('Zulu');

  await sortTrigger('Sort: Recently modified').click();
  await menu().getByRole('menuitem', { name: 'Title' }).click();

  await expect.element(menu()).not.toBeInTheDocument();
  await expect
    .poll(lastWrittenKeys)
    .toStrictEqual([{ field: 'title', direction: 'Asc' }]);

  // Title asc: Alpha, Whiskey, Zulu - and the trigger names the custom stack.
  await expect.element(probeAt(0)).toHaveTextContent('Alpha');
  await expect.element(probeAt(1)).toHaveTextContent('Whiskey');
  await expect.element(probeAt(2)).toHaveTextContent('Zulu');
  await expect.element(sortTrigger('Sort: Custom (1 levels)')).toBeVisible();
});

test('the direction toggle flips the order and names itself', async () => {
  await mount([{ field: 'artist', direction: 'Asc' }]);

  const ascending = sortTrigger(
    'Sort direction: ascending. Activate to sort descending.',
  );
  await expect.element(ascending).toBeVisible();
  await expect.element(ascending).toHaveTextContent('Ascending');

  // Artist asc: Alpha, Zulu, Whiskey.
  await expect.element(probeAt(0)).toHaveTextContent('Alpha');
  await expect.element(probeAt(2)).toHaveTextContent('Whiskey');

  await ascending.click();

  await expect
    .poll(lastWrittenKeys)
    .toStrictEqual([{ field: 'artist', direction: 'Dsc' }]);
  const descending = sortTrigger(
    'Sort direction: descending. Activate to sort ascending.',
  );
  await expect.element(descending).toBeVisible();
  await expect.element(descending).toHaveTextContent('Descending');

  // Artist desc: Whiskey, Zulu, Alpha.
  await expect.element(probeAt(0)).toHaveTextContent('Whiskey');
  await expect.element(probeAt(2)).toHaveTextContent('Alpha');
});

test('multi-key editing lives in the menu with priorities', async () => {
  await mount([{ field: 'artist', direction: 'Asc' }]);

  await sortTrigger('Sort: Custom (1 levels)').click();

  // Shift-click adds a second level and leaves the menu open.
  await menu()
    .getByRole('menuitem', { name: 'Album' })
    .click({ modifiers: ['Shift'] });
  await expect.element(menu()).toBeVisible();
  await expect.poll(lastWrittenKeys).toStrictEqual([
    { field: 'artist', direction: 'Asc' },
    { field: 'album', direction: 'Asc' },
  ]);
  await expect
    .element(menu().getByText('1. Artist . Ascending', { exact: true }))
    .toBeVisible();
  await expect
    .element(menu().getByText('2. Album . Ascending', { exact: true }))
    .toBeVisible();

  // Reorder: Album moves first.
  await menu().getByRole('button', { name: 'Move Album up' }).click();
  await expect.poll(lastWrittenKeys).toStrictEqual([
    { field: 'album', direction: 'Asc' },
    { field: 'artist', direction: 'Asc' },
  ]);
  await expect
    .element(menu().getByText('1. Album . Ascending', { exact: true }))
    .toBeVisible();

  // Flip inside the menu.
  await menu()
    .getByRole('button', {
      name: 'Artist: ascending. Activate to sort descending.',
    })
    .click();
  await expect.poll(lastWrittenKeys).toStrictEqual([
    { field: 'album', direction: 'Asc' },
    { field: 'artist', direction: 'Dsc' },
  ]);

  // Remove: Artist leaves, Album becomes the single level.
  await menu()
    .getByRole('button', { name: 'Remove Artist from the sort' })
    .click();
  await expect
    .poll(lastWrittenKeys)
    .toStrictEqual([{ field: 'album', direction: 'Asc' }]);
  await expect.element(menu()).toBeVisible();
  await expect
    .element(menu().getByText('1. Album . Ascending', { exact: true }))
    .toBeVisible();
});

test('menu keyboard: arrows, Home/End, Enter, Esc with focus return', async () => {
  await mount([...MOCK_CONFIG.library_sort_keys]);

  const trigger = sortTrigger('Sort: Recently modified');
  trigger.element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(menu()).toBeVisible();

  const focusedText = () => document.activeElement?.textContent ?? '';

  // Focus lands on the checked preset.
  expect(focusedText()).toContain('Recently modified');

  await userEvent.keyboard('[ArrowDown]');
  expect(focusedText()).toContain('Recently added');

  await userEvent.keyboard('[ArrowUp]');
  expect(focusedText()).toContain('Recently modified');

  await userEvent.keyboard('{End}');
  expect(focusedText()).toContain('Remove');

  await userEvent.keyboard('{Home}');
  expect(focusedText()).toContain('Recently modified');

  // Enter activates the focused item (same preset) and returns focus.
  await userEvent.keyboard('{Enter}');
  await expect.element(menu()).not.toBeInTheDocument();
  expect(document.activeElement).toBe(trigger.element());

  // Esc also closes back onto the trigger.
  await trigger.click();
  await expect.element(menu()).toBeVisible();
  await userEvent.keyboard('{Escape}');
  await expect.element(menu()).not.toBeInTheDocument();
  expect(document.activeElement).toBe(trigger.element());
});

test('the compact control is a button opening the same menu', async () => {
  await mount([...MOCK_CONFIG.library_sort_keys], true);

  // Compact still names the sort in full words and is clickable.
  const trigger = page.getByRole('button', {
    name: 'Sort: Recently modified',
  });
  await expect.element(trigger).toBeVisible();

  await trigger.click();
  await expect.element(menu()).toBeVisible();
  await expect
    .element(menu().getByRole('menuitem', { name: 'Date modified' }))
    .toBeVisible();
  await expect
    .element(menu().getByRole('menuitem', { name: 'Track number' }))
    .toBeVisible();
});
