import { useMemo } from 'react';

import type { SortKey, Track, TrackGroup } from '../generated/typings';
import useLibraryStore from '../lib/store';
import { filterTracks, sortTracks, stripAccents } from '../lib/utils-library';
/**
 * Filter and Sort a list of tracks depending on the user preferences and search
 * IMPORTANT: can only be used ONCE per view, as it has side effects
 */
export default function useFilteredTracks(
  tracks: Array<Track>,
  sortKeys?: SortKey[],
): Array<Track> {
  const search = useLibraryStore((state) => stripAccents(state.search));

  return useMemo(() => {
    // 1. Raw List
    let searchedTracks: Track[] = filterTracks(tracks, search);

    if (sortKeys && sortKeys.length > 0) {
      // sorting being a costly operation, do it after filtering, ignore it if not needed
      searchedTracks = sortTracks(searchedTracks, sortKeys);
    }

    return searchedTracks;
  }, [tracks, search, sortKeys]);
}

/**
 * Filter and Sort a list of tracks groups depending on the user preferences and
 * search
 * IMPORTANT: can only be used ONCE per view, as it has side effects
 */
export function useFilteredTrackGroup(
  tracks: TrackGroup[],
  sortKeys?: SortKey[],
): TrackGroup[] {
  const search = useLibraryStore((state) => stripAccents(state.search));

  return useMemo(() => {
    let searchedGroups: TrackGroup[] = tracks.map((group) => {
      return {
        ...group,
        tracks: filterTracks(group.tracks, search),
      };
    });

    if (sortKeys && sortKeys.length > 0) {
      // sorting being a costly operation, do it after filtering, ignore it if not needed
      searchedGroups = searchedGroups.map((group) => {
        return {
          ...group,
          tracks: sortTracks(group.tracks, sortKeys),
        };
      });
    }

    return searchedGroups.filter((group) => group.tracks.length > 0);
  }, [tracks, search, sortKeys]);
}
