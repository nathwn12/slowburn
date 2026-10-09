import { describe, expect, test } from 'vitest';

import {
  lookupSaved,
  sanitizeSaved,
  upsertSaved,
  type SavedLoop,
} from './saved';

/*
 * Ported from pear-desktop `player-actions/section-repeat/saved.test.ts`
 * (Source A). Source B has no saved-loop persistence. The only change is the
 * field rename `videoId` -> `trackId`; every case and expectation is
 * otherwise identical.
 */

const entry = (overrides: Partial<SavedLoop> = {}): SavedLoop => ({
  trackId: 'video-a',
  startSeconds: 10,
  endSeconds: 20,
  ...overrides,
});

const sanitizeCases: {
  name: string;
  raw: unknown;
  expected: SavedLoop[];
}[] = [
  { name: 'null', raw: null, expected: [] },
  { name: 'record', raw: { trackId: 'video-a' }, expected: [] },
  { name: 'string', raw: 'video-a', expected: [] },
  { name: 'number', raw: 7, expected: [] },
  { name: 'empty array', raw: [], expected: [] },
  {
    name: 'non-object entries',
    raw: [null, 7, 'video-a', []],
    expected: [],
  },
  {
    name: 'missing trackId',
    raw: [{ startSeconds: 1, endSeconds: 2 }],
    expected: [],
  },
  { name: 'empty trackId', raw: [entry({ trackId: '' })], expected: [] },
  {
    name: 'non-string trackId',
    raw: [{ trackId: 7, startSeconds: 1, endSeconds: 2 }],
    expected: [],
  },
  { name: 'missing times', raw: [{ trackId: 'video-a' }], expected: [] },
  {
    name: 'both times null',
    raw: [entry({ startSeconds: null, endSeconds: null })],
    expected: [],
  },
  { name: 'negative start', raw: [entry({ startSeconds: -1 })], expected: [] },
  { name: 'NaN end', raw: [entry({ endSeconds: NaN })], expected: [] },
  {
    name: 'infinite start',
    raw: [entry({ startSeconds: Infinity })],
    expected: [],
  },
  {
    name: 'string time',
    raw: [entry({ endSeconds: '20' as unknown as number })],
    expected: [],
  },
  {
    name: 'keeps valid entries and drops garbage',
    raw: [
      null,
      entry({ trackId: 'video-b', startSeconds: 0, endSeconds: null }),
      entry({ trackId: 'video-c', startSeconds: null, endSeconds: 5 }),
      entry({ trackId: 'video-d', startSeconds: NaN, endSeconds: 5 }),
      entry({ trackId: 'video-e', startSeconds: null, endSeconds: null }),
    ],
    expected: [
      { trackId: 'video-b', startSeconds: 0, endSeconds: null },
      { trackId: 'video-c', startSeconds: null, endSeconds: 5 },
    ],
  },
  {
    name: 'dedupes by trackId keeping the last occurrence',
    raw: [
      entry({ trackId: 'video-a', startSeconds: 1, endSeconds: 2 }),
      entry({ trackId: 'video-b', startSeconds: 3, endSeconds: 4 }),
      entry({ trackId: 'video-a', startSeconds: 5, endSeconds: 6 }),
    ],
    expected: [
      { trackId: 'video-b', startSeconds: 3, endSeconds: 4 },
      { trackId: 'video-a', startSeconds: 5, endSeconds: 6 },
    ],
  },
];

describe('sanitizeSaved', () => {
  test.each(sanitizeCases)('$name', ({ raw, expected }) => {
    expect(sanitizeSaved(raw)).toStrictEqual(expected);
  });
});

const lookupCases: {
  name: string;
  saved: SavedLoop[];
  trackId: string;
  expected: SavedLoop | null;
}[] = [
  { name: 'empty list', saved: [], trackId: 'video-a', expected: null },
  {
    name: 'miss',
    saved: [entry({ trackId: 'video-b' })],
    trackId: 'video-a',
    expected: null,
  },
  {
    name: 'hit',
    saved: [entry({ trackId: 'video-b' }), entry({ endSeconds: null })],
    trackId: 'video-a',
    expected: { trackId: 'video-a', startSeconds: 10, endSeconds: null },
  },
  {
    name: 'keeps the last occurrence on a raw duplicate',
    saved: [
      entry({ startSeconds: 1, endSeconds: 2 }),
      entry({ startSeconds: 5, endSeconds: 6 }),
    ],
    trackId: 'video-a',
    expected: { trackId: 'video-a', startSeconds: 5, endSeconds: 6 },
  },
];

describe('lookupSaved', () => {
  test.each(lookupCases)('$name', ({ saved, trackId, expected }) => {
    expect(lookupSaved(saved, trackId)).toStrictEqual(expected);
  });
});

const upsertCases: {
  name: string;
  saved: SavedLoop[];
  entry: SavedLoop;
  expected: SavedLoop[];
}[] = [
  {
    name: 'appends a new song',
    saved: [],
    entry: entry(),
    expected: [entry()],
  },
  {
    name: 'appends after existing songs',
    saved: [entry({ trackId: 'video-b' })],
    entry: entry({ startSeconds: 1, endSeconds: null }),
    expected: [
      entry({ trackId: 'video-b' }),
      entry({ startSeconds: 1, endSeconds: null }),
    ],
  },
  {
    name: 'replaces an existing song',
    saved: [
      entry({ startSeconds: 1, endSeconds: 2 }),
      entry({ trackId: 'video-b' }),
    ],
    entry: entry({ startSeconds: 7, endSeconds: 8 }),
    expected: [
      entry({ trackId: 'video-b' }),
      entry({ startSeconds: 7, endSeconds: 8 }),
    ],
  },
  {
    name: 'removes the entry when both times are null',
    saved: [entry(), entry({ trackId: 'video-b' })],
    entry: entry({ startSeconds: null, endSeconds: null }),
    expected: [entry({ trackId: 'video-b' })],
  },
  {
    name: 'removing an absent song changes nothing',
    saved: [entry({ trackId: 'video-b' })],
    entry: entry({ startSeconds: null, endSeconds: null }),
    expected: [entry({ trackId: 'video-b' })],
  },
  {
    name: 'removes every duplicate of the song',
    saved: [
      entry({ startSeconds: 1, endSeconds: 2 }),
      entry({ startSeconds: 3, endSeconds: 4 }),
    ],
    entry: entry({ startSeconds: null, endSeconds: null }),
    expected: [],
  },
];

describe('upsertSaved', () => {
  test.each(upsertCases)('$name', ({ saved, entry: next, expected }) => {
    expect(upsertSaved(saved, next)).toStrictEqual(expected);
  });
});
