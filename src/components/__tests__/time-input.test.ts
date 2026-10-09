import { describe, expect, test } from 'vite-plus/test';

import {
  formatTimeInput,
  parseTimeInput,
  resolvePointCommit,
  type ParsedTimeInput,
  type PointCommit,
} from '../time-input';

/**
 * Ported from pear-desktop's section-repeat `engine.test.ts` case table, with
 * the fractional-part cases added (this app displays milliseconds).
 */
const EMPTY: ParsedTimeInput = { kind: 'empty' };
const INVALID: ParsedTimeInput = { kind: 'invalid' };
const time = (seconds: number): ParsedTimeInput => ({ kind: 'time', seconds });

const parseCases: { input: string; expected: ParsedTimeInput }[] = [
  { input: '', expected: EMPTY },
  { input: '   ', expected: EMPTY },
  { input: '5', expected: time(5) },
  { input: '0:30', expected: time(30) },
  { input: '5:00', expected: time(300) },
  { input: '1:02:03', expected: time(3723) },
  { input: ' 5:00 ', expected: time(300) },
  // Fractions (the app's millisecond dialect).
  { input: '1:23.5', expected: time(83.5) },
  { input: '1:23.500', expected: time(83.5) },
  { input: '59.999', expected: time(59.999) },
  { input: '0:59.999', expected: time(59.999) },
  // Rejected shapes.
  { input: '5:60', expected: INVALID },
  { input: '1:60:00', expected: INVALID },
  { input: 'abc', expected: INVALID },
  { input: '-5', expected: INVALID },
  { input: '1:2:3:4', expected: INVALID },
  { input: '1:2.', expected: INVALID },
  { input: ':30', expected: INVALID },
  { input: '1::30', expected: INVALID },
  { input: '1:23.', expected: INVALID },
];

describe('parseTimeInput', () => {
  for (const { input, expected } of parseCases) {
    test(`parses ${JSON.stringify(input)}`, () => {
      expect(parseTimeInput(input)).toStrictEqual(expected);
    });
  }
});

const formatCases: { input: number | null; expected: string }[] = [
  { input: 300, expected: '5:00.000' },
  { input: 59, expected: '0:59.000' },
  { input: 0, expected: '0:00.000' },
  { input: 83.5, expected: '1:23.500' },
  { input: 59.999, expected: '0:59.999' },
  { input: 3723, expected: '62:03.000' },
  { input: null, expected: '' },
];

describe('formatTimeInput', () => {
  for (const { input, expected } of formatCases) {
    test(`formats ${input}`, () => {
      expect(formatTimeInput(input)).toBe(expected);
    });
  }
});

/**
 * The instant-commit path (`LoopControls` live-on-change) and the Enter/blur
 * path share `resolvePointCommit`, so these cases pin both.
 */
const DURATION = 300;

const commitCases: {
  name: string;
  point: 'A' | 'B';
  raw: string;
  current: { a: number | null; b: number | null };
  expected: PointCommit;
}[] = [
  {
    name: 'A with no B set commits the point and seeks to it',
    point: 'A',
    raw: '0:10',
    current: { a: null, b: null },
    expected: { kind: 'commit', a: 10, b: null, seek: 10 },
  },
  {
    name: 'B with no A set commits the point and seeks to it',
    point: 'B',
    raw: '0:20.500',
    current: { a: null, b: null },
    expected: { kind: 'commit', a: null, b: 20.5, seek: 20.5 },
  },
  {
    name: 'A clear of B keeps B and seeks to A',
    point: 'A',
    raw: '0:10',
    current: { a: null, b: 20 },
    expected: { kind: 'commit', a: 10, b: 20, seek: 10 },
  },
  {
    // 2% of 300s is a 6s gap; A at 10 with B at 12 inverts, so B is pushed
    // forward 10% (30s) to 40. The region commits but the playhead stays:
    // the typed A still landed exactly, so it seeks there.
    name: 'A on B pushes B forward and still seeks to A',
    point: 'A',
    raw: '0:10',
    current: { a: null, b: 12 },
    expected: { kind: 'commit', a: 10, b: 40, seek: 10 },
  },
  {
    // B at 8 with A at 10 inverts, so A is pulled back 10% (30s), clamped to
    // 0 - and the playhead seeks to the typed B, which landed exactly.
    name: 'B behind A pulls A back and seeks to B',
    point: 'B',
    raw: '0:08',
    current: { a: 10, b: null },
    expected: { kind: 'commit', a: 0, b: 8, seek: 8 },
  },
  {
    // A at 300 with B at 10 inverts with no room left: the geometry pins
    // {270, 300}, so the typed A did not land - the region commits but the
    // playhead stays (a seek there would end the track outright).
    name: 'A past B with no room commits the region without seeking',
    point: 'A',
    raw: '5:00',
    current: { a: null, b: 10 },
    expected: { kind: 'commit', a: 270, b: 300, seek: null },
  },
  {
    // B at 0 with A at 0 inverts with no room left: the geometry pins
    // {0, 30}, so the typed B did not land - the region commits but the
    // playhead stays.
    name: 'B at A with no room commits the region without seeking',
    point: 'B',
    raw: '0',
    current: { a: 0, b: null },
    expected: { kind: 'commit', a: 0, b: 30, seek: null },
  },
  {
    // Exactly the track end lands exactly, but no seek can honor it: the
    // platform would end the track instead.
    name: 'a point exactly at the track end commits without seeking',
    point: 'A',
    raw: '5:00',
    current: { a: null, b: null },
    expected: { kind: 'commit', a: DURATION, b: null, seek: null },
  },
  {
    // Past the end clamps to the duration; the clamp lands on the end
    // itself, where no seek can honor it - so the region commits unmoved.
    name: 'a point past the track end clamps without seeking',
    point: 'A',
    raw: '10:00',
    current: { a: null, b: null },
    expected: { kind: 'commit', a: DURATION, b: null, seek: null },
  },
  {
    name: 'invalid input never commits',
    point: 'B',
    raw: '5:60',
    current: { a: 10, b: 20 },
    expected: { kind: 'invalid' },
  },
  {
    name: 'an emptied field leaves the loop untouched',
    point: 'A',
    raw: '   ',
    current: { a: 10, b: 20 },
    expected: { kind: 'empty' },
  },
];

describe('resolvePointCommit', () => {
  for (const { name, point, raw, current, expected } of commitCases) {
    test(`commits ${name}`, () => {
      expect(resolvePointCommit(point, raw, current, DURATION)).toStrictEqual(
        expected,
      );
    });
  }
});
