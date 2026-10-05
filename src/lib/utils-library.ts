import uniq from 'lodash-es/uniq';

import type { SortField, SortKey, Track } from '../generated/typings';

/**
 * Filter an array of tracks by string
 */
export function filterTracks(tracks: Track[], search: string): Track[] {
  // Avoid performing useless searches
  if (search.length === 0) return tracks;

  // Unoptimized, bad
  return tracks.filter(
    (track) =>
      stripAccents(track.artists.toString().toLowerCase()).includes(search) ||
      stripAccents(track.album.toLowerCase()).includes(search) ||
      stripAccents(track.genres.toString().toLowerCase()).includes(search) ||
      stripAccents(track.title.toLowerCase()).includes(search),
  );
}

/**
 * Strip accent from a string and lowercase them. From https://jsperf.com/strip-accents
 * Intentionally not idiomatic, it needs to be *fast*.
 */
export function stripAccents(str: string): string {
  let newStr = '';

  for (let i = 0; i < str.length; i++) {
    if (ACCENT_MAP.has(str[i])) {
      newStr += ACCENT_MAP.get(str[i]);
    } else {
      newStr += str[i];
    }
  }

  return newStr.toLowerCase();
}

const ACCENTS =
  'ÀÁÂÃÄÅĄĀàáâãäåąāÒÓÔÕÕÖØòóôõöøÈÉÊËĘĒèéêëðęēÇĆČçćčÐÌÍÎÏĪìíîïīÙÚÛÜŪùúûüūÑŅñņŠŚšśŸÿýŽŹŻžźżŁĻłļŃŅńņàáãảạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệđùúủũụưừứửữựòóỏõọôồốổỗộơờớởỡợìíỉĩịäëïîüûñçýỳỹỵỷğışĞİŞĢģĶķ';

const ACCENT_REPLACEMENTS =
  'AAAAAAAAaaaaaaaaOOOOOOOooooooEEEEEEeeeeeeeCCCcccDIIIIIiiiiiUUUUUuuuuuNNnnSSssYyyZZZzzzLLllNNnnaaaaaaaaaaaaaaaaaeeeeeeeeeeeduuuuuuuuuuuoooooooooooooooooiiiiiaeiiuuncyyyyygisGISGgKk';

const ACCENT_MAP = new Map();

for (let i = 0; i < ACCENTS.length; i++) {
  ACCENT_MAP.set(ACCENTS[i], ACCENT_REPLACEMENTS[i]);
}

/**
 * Given multiple paths as string, remove duplicates or child paths in case on parent exist in the array
 */
export const removeRedundantFolders = (paths: Array<string>): Array<string> => {
  return uniq(
    paths.filter((path) => {
      const isDuplicate = paths.some((otherPath) => {
        return path.startsWith(otherPath) && path !== otherPath;
      });

      return !isDuplicate;
    }),
  );
};

/** ----------------------------------------------------------------------------
 * Sort utilities
 * -------------------------------------------------------------------------- */

/** A resolved sort value: text, a number, or missing (`null`). */
type SortValue = string | number | null;

/**
 * `Intl.Collator` with `numeric` so "Track 2" precedes "Track 10", and
 * `sensitivity: 'base'` so accents and case do not matter.
 */
const COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Fields compared as numbers rather than text. `dateAdded` is deliberately NOT
 * here: it is an ISO-8601 string whose fixed-width format already sorts
 * chronologically as text. `fileModified` is epoch milliseconds, so a
 * `Collator` would sort it wrongly (900 > 10_000 as text).
 */
const NUMERIC_FIELDS: ReadonlySet<SortField> = new Set([
  'duration',
  'diskNo',
  'trackNo',
  'playCount',
  'fileModified',
]);

/** An empty (or whitespace-only) tag is missing, not a value. */
function text(value: string): string | null {
  return value.trim().length === 0 ? null : value;
}

function valueFor(track: Track, field: SortField): SortValue {
  switch (field) {
    case 'artist':
      return track.artists.length === 0 ? null : track.artists.join(', ');
    case 'album':
      return text(track.album);
    case 'title':
      return text(track.title);
    case 'duration':
      return track.duration;
    case 'genre':
      return track.genres.length === 0 ? null : track.genres.join(', ');
    case 'diskNo':
      return track.disk_no;
    case 'trackNo':
      return track.track_no;
    case 'playCount':
      return track.play_count;
    case 'dateAdded':
      return text(track.date_added);
    case 'fileModified':
      return track.modified;
  }
}

function isMissing(value: SortValue): boolean {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

function comparePresent(
  a: string | number,
  b: string | number,
  field: SortField,
): number {
  if (NUMERIC_FIELDS.has(field)) {
    return (a as number) - (b as number);
  }

  return COLLATOR.compare(String(a), String(b));
}

/**
 * Order tracks by an ordered list of sort keys (the AIMP-style model).
 *
 * Presence is decided before value: a key where one side is missing always
 * yields "missing last", under every direction and at every key position — a
 * direction only flips values that are both present. The comparison is a
 * stable multi-key sort, so an equal first key falls through to the next one.
 *
 * The input array is never mutated (a sort is a view, not a mutation). An
 * empty key list returns a stable copy, so the list still renders
 * deterministically rather than in whatever order the store handed it.
 */
export function sortTracks(tracks: Track[], keys: SortKey[]): Track[] {
  const sorted = [...tracks];

  sorted.sort((a, b) => {
    for (const key of keys) {
      const aValue = valueFor(a, key.field);
      const bValue = valueFor(b, key.field);

      const aMissing = isMissing(aValue);
      const bMissing = isMissing(bValue);

      // Missing-last is a presence rule, applied before direction.
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing && bMissing) continue;

      const difference = comparePresent(
        aValue as string | number,
        bValue as string | number,
        key.field,
      );

      if (difference !== 0) {
        return key.direction === 'Asc' ? difference : -difference;
      }
    }

    return 0;
  });

  return sorted;
}
