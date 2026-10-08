import { describe, expect, test } from 'vite-plus/test';

import {
  __getSavedFullOuterSizeForTests,
  __resetMiniWindowStateForTests,
  FULL_WINDOW_MIN_SIZE,
  FULL_WINDOW_SIZE,
  MINI_WINDOW_MIN_SIZE,
  MINI_WINDOW_SIZE,
  windowGeometryForMode,
} from '../mini-window';

describe('windowGeometryForMode', () => {
  test('mini maps to the compact footprint with the small floor', () => {
    expect(windowGeometryForMode('mini')).toEqual({
      size: { width: 420, height: 660 },
      minSize: { width: 320, height: 420 },
    });
  });

  test('full maps to the default footprint with the full floor', () => {
    expect(windowGeometryForMode('full')).toEqual({
      size: { width: 960, height: 600 },
      minSize: { width: 900, height: 600 },
    });
  });

  test('minimal keeps full geometry (density, not a footprint)', () => {
    expect(windowGeometryForMode('minimal')).toEqual(
      windowGeometryForMode('full'),
    );
  });

  test('floors fit inside their footprints, and mini is smaller than full', () => {
    expect(MINI_WINDOW_MIN_SIZE.width).toBeLessThanOrEqual(
      MINI_WINDOW_SIZE.width,
    );
    expect(MINI_WINDOW_MIN_SIZE.height).toBeLessThanOrEqual(
      MINI_WINDOW_SIZE.height,
    );
    expect(FULL_WINDOW_MIN_SIZE.width).toBeLessThanOrEqual(
      FULL_WINDOW_SIZE.width,
    );
    expect(FULL_WINDOW_MIN_SIZE.height).toBeLessThanOrEqual(
      FULL_WINDOW_SIZE.height,
    );
    expect(MINI_WINDOW_SIZE.width).toBeLessThan(FULL_WINDOW_SIZE.width);
    // The mini floor must clear the 900px full floor that blocks the shrink.
    expect(MINI_WINDOW_MIN_SIZE.width).toBeLessThan(FULL_WINDOW_MIN_SIZE.width);
  });

  test('no restore is pending on a fresh boot', () => {
    __resetMiniWindowStateForTests();
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
  });
});
