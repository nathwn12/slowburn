import { describe, expect, it, test } from 'vite-plus/test';

import type { SortKey, Track } from '../../generated/typings';
import {
  removeRedundantFolders,
  sortTracks,
  stripAccents,
} from '../utils-library';

describe('stripAccents', () => {
  test('should remove all accentutated characters in a string by its non-accentuated version', () => {
    expect(
      stripAccents(
        'AbCdÀÁÂÃÄÅĄĀàáâãäåąāÒÓÔÕÕÖØòóôõöøÈÉÊËĘĒèéêëðęēÇĆČçćčÐÌÍÎÏĪìíîïīÙÚÛÜŪùúûüūÑŅñņŠŚšśŸÿýŽŹŻžźżŁĻłļŃŅńņàáãảạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệđùúủũụưừứửữựòóỏõọôồốổỗộơờớởỡợìíỉĩịäëïîüûñçýỳỹỵỷğışĞİŞĢģĶķ',
      ),
    ).toStrictEqual(
      'abcdaaaaaaaaaaaaaaaaoooooooooooooeeeeeeeeeeeeeccccccdiiiiiiiiiiuuuuuuuuuunnnnssssyyyzzzzzzllllnnnnaaaaaaaaaaaaaaaaaeeeeeeeeeeeduuuuuuuuuuuoooooooooooooooooiiiiiaeiiuuncyyyyygisgisggkk',
    );
  });
});

describe('removeRedundantFolders', () => {
  test('should return the same array if there are no duplicates or subpaths', () => {
    expect(
      removeRedundantFolders(['/users/me/music', '/users/me/videos']),
    ).toStrictEqual(['/users/me/music', '/users/me/videos']);
  });

  test('should remove duplicate entries', () => {
    expect(
      removeRedundantFolders([
        '/users/me/music',
        '/users/me/videos',
        '/users/me/music',
      ]),
    ).toStrictEqual(['/users/me/music', '/users/me/videos']);
  });

  test('should remove subpaths', () => {
    expect(
      removeRedundantFolders([
        '/tmp/data/music',
        '/users/me/music',
        '/users/me/music/archive',
        '/tmp/data',
      ]),
    ).toStrictEqual(['/users/me/music', '/tmp/data']);
  });
});

describe('sortTracks', () => {
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

  const MODIFIED_DESC: SortKey = { field: 'fileModified', direction: 'Dsc' };
  const ARTIST_ASC: SortKey = { field: 'artist', direction: 'Asc' };

  const ids = (tracks: Track[]): string[] => tracks.map((track) => track.id);

  // A fixture whose modified times are deliberately OPPOSITE to its title
  // order: by title it is alpha, bravo, charlie; by mtime it is charlie,
  // bravo, alpha.
  const byModified = [
    makeTrack({ id: 'alpha', title: 'Alpha', modified: 100 }),
    makeTrack({ id: 'bravo', title: 'Bravo', modified: 200 }),
    makeTrack({ id: 'charlie', title: 'Charlie', modified: 300 }),
  ];

  it('sorts by modified descending first (AC4)', () => {
    expect(ids(sortTracks(byModified, [MODIFIED_DESC]))).toStrictEqual([
      'charlie',
      'bravo',
      'alpha',
    ]);
  });

  it('uses the second key to break a tie in the first', () => {
    const tracks = [
      makeTrack({ id: 'zed', modified: 500, artists: ['Zed'] }),
      makeTrack({ id: 'amy', modified: 500, artists: ['Amy'] }),
    ];

    expect(ids(sortTracks(tracks, [MODIFIED_DESC, ARTIST_ASC]))).toStrictEqual([
      'amy',
      'zed',
    ]);
  });

  it('honours a per-key descending direction independently', () => {
    const tracks = [
      makeTrack({ id: 'short', artists: ['Same'], duration: 100 }),
      makeTrack({ id: 'long', artists: ['Same'], duration: 200 }),
    ];
    const durationDesc: SortKey = { field: 'duration', direction: 'Dsc' };
    const durationAsc: SortKey = { field: 'duration', direction: 'Asc' };

    expect(ids(sortTracks(tracks, [ARTIST_ASC, durationDesc]))).toStrictEqual([
      'long',
      'short',
    ]);
    expect(ids(sortTracks(tracks, [ARTIST_ASC, durationAsc]))).toStrictEqual([
      'short',
      'long',
    ]);
  });

  it('sorts a missing tag last under ascending (AC6)', () => {
    const tracks = [
      makeTrack({ id: 'missing', artists: [] }),
      makeTrack({ id: 'zed', artists: ['Zed'] }),
      makeTrack({ id: 'amy', artists: ['Amy'] }),
    ];

    expect(ids(sortTracks(tracks, [ARTIST_ASC]))).toStrictEqual([
      'amy',
      'zed',
      'missing',
    ]);
  });

  it('sorts a missing tag last under descending (AC6)', () => {
    const tracks = [
      makeTrack({ id: 'missing', artists: [] }),
      makeTrack({ id: 'zed', artists: ['Zed'] }),
      makeTrack({ id: 'amy', artists: ['Amy'] }),
    ];
    const artistDesc: SortKey = { field: 'artist', direction: 'Dsc' };

    expect(ids(sortTracks(tracks, [artistDesc]))).toStrictEqual([
      'zed',
      'amy',
      'missing',
    ]);
  });

  it('treats an empty tag as missing (Review Focus 1)', () => {
    const tracks = [
      makeTrack({ id: 'empty', album: '' }),
      makeTrack({ id: 'beta', album: 'Beta' }),
      makeTrack({ id: 'alpha', album: 'Alpha' }),
    ];
    const albumAsc: SortKey = { field: 'album', direction: 'Asc' };

    expect(ids(sortTracks(tracks, [albumAsc]))).toStrictEqual([
      'alpha',
      'beta',
      'empty',
    ]);
  });

  it('compares modified numerically, not as text (Review Focus 4)', () => {
    const tracks = [
      makeTrack({ id: 'nine-hundred', modified: 900 }),
      makeTrack({ id: 'ten-thousand', modified: 10_000 }),
    ];
    const modifiedAsc: SortKey = { field: 'fileModified', direction: 'Asc' };

    // As text, "10000" < "900"; numerically 900 < 10000.
    expect(ids(sortTracks(tracks, [modifiedAsc]))).toStrictEqual([
      'nine-hundred',
      'ten-thousand',
    ]);
  });

  it('is deterministic for an empty key list (Review Focus 5)', () => {
    const tracks = [
      makeTrack({ id: 'a' }),
      makeTrack({ id: 'b' }),
      makeTrack({ id: 'c' }),
    ];

    const first = ids(sortTracks(tracks, []));
    const second = ids(sortTracks(tracks, []));

    expect(first).toStrictEqual(['a', 'b', 'c']);
    expect(second).toStrictEqual(first);
  });

  it('does not mutate the input array (AC7)', () => {
    const tracks = [
      makeTrack({ id: 'alpha', title: 'Alpha' }),
      makeTrack({ id: 'bravo', title: 'Bravo' }),
      makeTrack({ id: 'charlie', title: 'Charlie' }),
    ];
    const before = ids(tracks);
    const titleAsc: SortKey = { field: 'title', direction: 'Asc' };

    sortTracks(tracks, [titleAsc]);

    expect(ids(tracks)).toStrictEqual(before);
  });
});
