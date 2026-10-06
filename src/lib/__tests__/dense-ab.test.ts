import { describe, expect, test } from 'vite-plus/test';

import {
  MIN_GAP_RATIO,
  isDeadRegion,
  clampSeconds,
  resolveSetA,
  resolveSetB,
} from '../dense-ab';

const DURATION = 300;
const MIN_GAP = DURATION * MIN_GAP_RATIO; // 6s

function hasUsableGap(
  a: number | null,
  b: number | null,
  duration: number,
): boolean {
  if (a == null || b == null) return true; // half-set regions are not dead
  return (
    a >= 0 && b <= duration && b > a && b - a >= duration * MIN_GAP_RATIO - 1e-9
  );
}

describe('resolveSetA (typed A)', () => {
  test('keeps B when A stays before it', () => {
    expect(resolveSetA(120, 200, DURATION)).toStrictEqual({ a: 120, b: 200 });
  });

  test('pushes B forward when A would meet it', () => {
    expect(resolveSetA(200, 100, DURATION)).toStrictEqual({ a: 200, b: 230 });
  });

  test('a lone A leaves B unset', () => {
    expect(resolveSetA(120, null, DURATION)).toStrictEqual({
      a: 120,
      b: null,
    });
  });

  test('A beyond the track with an existing B keeps a usable region', () => {
    // Was a zero-width `{300, 300}` collapse (edge-cases.md §2/§5).
    const next = resolveSetA(DURATION, 100, DURATION);
    expect(next).toStrictEqual({ a: 270, b: DURATION });
    expect(hasUsableGap(next.a, next.b, DURATION)).toBe(true);
  });

  test('A at the track end with no B stays a single point', () => {
    expect(resolveSetA(DURATION, null, DURATION)).toStrictEqual({
      a: DURATION,
      b: null,
    });
  });
});

describe('resolveSetB (typed B)', () => {
  test('keeps A when B stays after it', () => {
    expect(resolveSetB(100, 200, DURATION)).toStrictEqual({ a: 100, b: 200 });
  });

  test('pulls A back when B would meet it', () => {
    expect(resolveSetB(100, 100, DURATION)).toStrictEqual({ a: 70, b: 100 });
  });

  test('B behind A pushes A back', () => {
    expect(resolveSetB(10, 8, DURATION)).toStrictEqual({ a: 0, b: 8 });
  });

  test('A == B == 0 does not save a dead loop', () => {
    // Was a zero-width `{0, 0}` saved region (edge-cases.md §2/§5).
    const next = resolveSetB(0, 0, DURATION);
    expect(next).toStrictEqual({ a: 0, b: 30 });
    expect(hasUsableGap(next.a, next.b, DURATION)).toBe(true);
  });

  test('B beyond the track clamps to the duration', () => {
    expect(resolveSetB(10, 99999, DURATION)).toStrictEqual({
      a: 10,
      b: DURATION,
    });
  });
});

describe('geometry never yields a dead region', () => {
  const typedTimes = [NaN, -5, 0, 1, 3, 5, 100, 294, 299, 300, 3000];
  const existingPoints = [null, 0, 3, 100, 240, 299, 300];

  test('resolveSetA', () => {
    for (const seconds of typedTimes) {
      for (const b of existingPoints) {
        const next = resolveSetA(seconds, b, DURATION);
        expect(hasUsableGap(next.a, next.b, DURATION)).toBe(true);
      }
    }
  });

  test('resolveSetB', () => {
    for (const seconds of typedTimes) {
      for (const a of existingPoints) {
        const next = resolveSetB(a, seconds, DURATION);
        expect(hasUsableGap(next.a, next.b, DURATION)).toBe(true);
      }
    }
  });
});

describe('isDeadRegion', () => {
  test('a half-set region is not dead', () => {
    expect(isDeadRegion(5, null, DURATION)).toBe(false);
    expect(isDeadRegion(null, 5, DURATION)).toBe(false);
    expect(isDeadRegion(null, null, DURATION)).toBe(false);
  });

  test('inverted or zero-width regions are dead', () => {
    expect(isDeadRegion(5, 5, DURATION)).toBe(true);
    expect(isDeadRegion(300, 300, DURATION)).toBe(true);
    expect(isDeadRegion(0, 0, DURATION)).toBe(true);
    expect(isDeadRegion(10, 8, DURATION)).toBe(true);
  });

  test('regions below the 2% gap are dead', () => {
    expect(isDeadRegion(0, MIN_GAP - 1, DURATION)).toBe(true);
    expect(isDeadRegion(0, MIN_GAP, DURATION)).toBe(false);
    expect(isDeadRegion(10, 20, DURATION)).toBe(false);
  });
});

describe('clampSeconds', () => {
  test('clamps into [0, duration]', () => {
    expect(clampSeconds(-5, DURATION)).toBe(0);
    expect(clampSeconds(NaN, DURATION)).toBe(0);
    expect(clampSeconds(99999, DURATION)).toBe(DURATION);
    expect(clampSeconds(42, DURATION)).toBe(42);
  });
});
