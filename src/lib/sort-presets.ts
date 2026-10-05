import type { SortKey } from '../generated/typings';

/**
 * A named, whole-stack sort preset (spec §3.5). Applying one replaces
 * `library_sort_keys` outright — it is not merged into the current stack.
 */
export type SortPreset = {
  /** Stable id, also the key for the translated label in the header. */
  id: string;
  /**
   * English source for the label. Used as a last-resort fallback; the UI
   * renders the label through the `t` macro, keyed by `id`.
   */
  labelKey: string;
  keys: SortKey[];
};

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

/** The six presets from spec §3.5, in menu order. */
export const SORT_PRESETS: SortPreset[] = [
  {
    id: 'recentlyModified',
    labelKey: 'Recently modified',
    keys: [
      { field: 'fileModified', direction: 'Dsc' },
      { field: 'artist', direction: 'Asc' },
      { field: 'album', direction: 'Asc' },
      { field: 'diskNo', direction: 'Asc' },
      { field: 'trackNo', direction: 'Asc' },
    ],
  },
  {
    id: 'recentlyAdded',
    labelKey: 'Recently added',
    keys: [
      { field: 'dateAdded', direction: 'Dsc' },
      { field: 'artist', direction: 'Asc' },
      { field: 'album', direction: 'Asc' },
      { field: 'diskNo', direction: 'Asc' },
      { field: 'trackNo', direction: 'Asc' },
    ],
  },
  {
    id: 'artistAlbum',
    labelKey: 'Artist / Album',
    keys: [
      { field: 'artist', direction: 'Asc' },
      { field: 'album', direction: 'Asc' },
      { field: 'diskNo', direction: 'Asc' },
      { field: 'trackNo', direction: 'Asc' },
    ],
  },
  {
    id: 'album',
    labelKey: 'Album',
    keys: [
      { field: 'album', direction: 'Asc' },
      { field: 'diskNo', direction: 'Asc' },
      { field: 'trackNo', direction: 'Asc' },
    ],
  },
  {
    id: 'length',
    labelKey: 'Length',
    keys: [{ field: 'duration', direction: 'Asc' }],
  },
  {
    id: 'mostPlayed',
    labelKey: 'Most played',
    keys: [
      { field: 'playCount', direction: 'Dsc' },
      { field: 'artist', direction: 'Asc' },
      { field: 'album', direction: 'Asc' },
      { field: 'diskNo', direction: 'Asc' },
      { field: 'trackNo', direction: 'Asc' },
    ],
  },
];
