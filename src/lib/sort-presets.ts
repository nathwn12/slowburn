import type { SortKey } from '../generated/typings';

/**
 * The key bundle restored when the last sort key is removed (Review Focus 1).
 *
 * An empty stack has no defined rendering, so "off" on the only key means "back
 * to the default", not "sort arbitrarily". This mirrors the backend default
 * introduced by the sorting-data-model change: newest modified first, then
 * artist / album / disk / track.
 */
export const DEFAULT_SORT_KEYS: SortKey[] = [
  { field: 'fileModified', direction: 'Dsc' },
  { field: 'artist', direction: 'Asc' },
  { field: 'album', direction: 'Asc' },
  { field: 'diskNo', direction: 'Asc' },
  { field: 'trackNo', direction: 'Asc' },
];
