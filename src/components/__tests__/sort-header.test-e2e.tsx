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

import type { Config, SortKey } from '../../generated/typings';
import { MOCK_CONFIG } from '../../lib/__mocks__/bridge-config';
import { configQuery } from '../../lib/queries';
import { messages } from '../../translations/en.po';

import TrackListHeader from '../TrackListHeader';

const harness = vi.hoisted(() => ({
  config: {} as Config,
  multiSet: vi.fn(async (_updates: Partial<Config>) => {}),
}));

vi.mock('../../lib/bridge-config', () => ({
  default: {
    getAll: async () => harness.config,
    get: async (key: string) =>
      (harness.config as unknown as Record<string, unknown>)[key],
    getInitial: (key: string) =>
      (harness.config as unknown as Record<string, unknown>)[key],
    set: vi.fn(async () => {}),
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

  await expect.poll(lastWrittenKeys).toStrictEqual([
    ARTIST_ASC,
    { field: 'title', direction: 'Asc' },
  ]);
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
  await mount([{ field: 'artist', direction: 'Dsc' }, { field: 'album', direction: 'Asc' }]);

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
