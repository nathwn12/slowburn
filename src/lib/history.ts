import type { Track } from '../generated/typings';

/**
 * The play history, derived from the all-tracks query the library already
 * loads: tracks with at least one completed play, newest `last_played`
 * first. Pure so the ordering is unit-testable without the query layer.
 *
 * No Tauri query is needed: `play_count` and `last_played` already ride
 * along on every `Track` (`get_all_tracks`), and `record_play` is the only
 * writer. Tracks with a `play_count` but a missing or unparseable
 * `last_played` sort after every dated play, ordered by `play_count`
 * descending; the input array is never mutated.
 */
export function selectHistoryTracks(tracks: Array<Track>): Array<Track> {
  return tracks
    .filter((track) => track.play_count > 0)
    .sort(
      (a, b) =>
        lastPlayedTime(b.last_played) - lastPlayedTime(a.last_played) ||
        b.play_count - a.play_count,
    );
}

/**
 * Epoch milliseconds for a `last_played` ISO string. Missing or
 * unparseable values sort as the oldest possible play, never as newest.
 */
function lastPlayedTime(lastPlayed: string | null): number {
  if (lastPlayed == null) return Number.NEGATIVE_INFINITY;
  const time = Date.parse(lastPlayed);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}
