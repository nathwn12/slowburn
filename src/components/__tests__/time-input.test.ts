import { describe, expect, test } from 'vite-plus/test';

import {
  formatTimeInput,
  parseTimeInput,
  type ParsedTimeInput,
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
