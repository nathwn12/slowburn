import { describe, expect, test } from 'vite-plus/test';

import type { Track } from '../../generated/typings';
import { selectHistoryTracks } from '../history';

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

const ids = (tracks: Array<Track>): Array<string> =>
  tracks.map((track) => track.id);

describe('selectHistoryTracks', () => {
  test('keeps only tracks with at least one completed play', () => {
    const tracks = [
      makeTrack({
        id: 'played',
        play_count: 2,
        last_played: '2026-10-01T00:00:00Z',
      }),
      makeTrack({ id: 'never' }),
    ];

    expect(ids(selectHistoryTracks(tracks))).toStrictEqual(['played']);
  });

  test('orders newest last_played first', () => {
    const tracks = [
      makeTrack({
        id: 'old',
        play_count: 9,
        last_played: '2026-09-01T00:00:00Z',
      }),
      makeTrack({
        id: 'new',
        play_count: 1,
        last_played: '2026-10-10T00:00:00Z',
      }),
      makeTrack({
        id: 'mid',
        play_count: 4,
        last_played: '2026-10-01T00:00:00Z',
      }),
    ];

    expect(ids(selectHistoryTracks(tracks))).toStrictEqual([
      'new',
      'mid',
      'old',
    ]);
  });

  test('sorts undated plays after every dated play, most plays first', () => {
    const tracks = [
      makeTrack({ id: 'undated-few', play_count: 1, last_played: null }),
      makeTrack({
        id: 'dated',
        play_count: 1,
        last_played: '2026-10-10T00:00:00Z',
      }),
      makeTrack({
        id: 'undated-many',
        play_count: 7,
        last_played: 'not-a-date',
      }),
    ];

    expect(ids(selectHistoryTracks(tracks))).toStrictEqual([
      'dated',
      'undated-many',
      'undated-few',
    ]);
  });

  test('breaks an identical last_played by play_count descending', () => {
    const tracks = [
      makeTrack({
        id: 'few',
        play_count: 2,
        last_played: '2026-10-10T00:00:00Z',
      }),
      makeTrack({
        id: 'many',
        play_count: 8,
        last_played: '2026-10-10T00:00:00Z',
      }),
    ];

    expect(ids(selectHistoryTracks(tracks))).toStrictEqual(['many', 'few']);
  });

  test('returns an empty list when nothing was played yet', () => {
    expect(selectHistoryTracks([makeTrack({ id: 'a' })])).toStrictEqual([]);
    expect(selectHistoryTracks([])).toStrictEqual([]);
  });

  test('does not mutate the input array', () => {
    const tracks = [
      makeTrack({
        id: 'old',
        play_count: 9,
        last_played: '2026-09-01T00:00:00Z',
      }),
      makeTrack({
        id: 'new',
        play_count: 1,
        last_played: '2026-10-10T00:00:00Z',
      }),
    ];

    selectHistoryTracks(tracks);
    expect(ids(tracks)).toStrictEqual(['old', 'new']);
  });
});
