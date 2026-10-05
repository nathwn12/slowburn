import { describe, expect, test } from 'vitest';

import {
  clamp,
  clampIntensity,
  clampSlow,
  DEFAULT_SETTINGS,
  formatPercent,
  formatRate,
  getDefaultSettings,
  isNeutral,
  isReverbEngaged,
  isSlowEngaged,
  normalize,
} from './slowed';

/*
 * Ported from:
 *  - pear-desktop `slowed-reverb/engine.test.ts` (Source A): isSlowEngaged,
 *    isReverbEngaged.
 *  - slowed-reverb-audio `qa/shared-unit.js` (Source B): normalize /
 *    getDefaultSettings / isNeutral / formatRate / formatPercent and the
 *    clamp bounds behind them.
 * Two Source B assertions conflict with the chosen Source A clamp semantics;
 * they are adapted below and flagged inline.
 */

const slowCases: {
  name: string;
  config: { active: boolean; slow: number };
  expected: boolean;
}[] = [
  {
    name: 'inactive at 0.8x is disengaged',
    config: { active: false, slow: 0.8 },
    expected: false,
  },
  {
    name: 'inactive at 1x is disengaged',
    config: { active: false, slow: 1 },
    expected: false,
  },
  {
    name: 'active at exactly 1x is disengaged',
    config: { active: true, slow: 1 },
    expected: false,
  },
  {
    name: 'active just below 1x is engaged',
    config: { active: true, slow: 0.99 },
    expected: true,
  },
  {
    name: 'active below 1x is engaged',
    config: { active: true, slow: 0.8 },
    expected: true,
  },
  {
    name: 'active just above 1x is engaged',
    config: { active: true, slow: 1.01 },
    expected: true,
  },
  {
    name: 'active above 1x is engaged',
    config: { active: true, slow: 1.2 },
    expected: true,
  },
  {
    name: 'a slow below the floor clamps to a non-1x rate',
    config: { active: true, slow: 0.5 },
    expected: true,
  },
  {
    name: 'a slow above the ceiling clamps to a non-1x rate',
    config: { active: true, slow: 5 },
    expected: true,
  },
  {
    name: 'a non-finite slow clamps to 1x',
    config: { active: true, slow: NaN },
    expected: false,
  },
  {
    name: 'a slow that rounds to 1x is disengaged',
    config: { active: true, slow: 1.001 },
    expected: false,
  },
];

describe('isSlowEngaged', () => {
  for (const { name, config, expected } of slowCases) {
    test(name, () => {
      expect(isSlowEngaged(config)).toBe(expected);
    });
  }
});

const reverbCases: {
  name: string;
  config: { active: boolean; reverbIntensity: number };
  expected: boolean;
}[] = [
  {
    name: 'inactive at 0.5 intensity is disengaged',
    config: { active: false, reverbIntensity: 0.5 },
    expected: false,
  },
  {
    name: 'inactive at 0 intensity is disengaged',
    config: { active: false, reverbIntensity: 0 },
    expected: false,
  },
  {
    name: 'active at 0 intensity is disengaged',
    config: { active: true, reverbIntensity: 0 },
    expected: false,
  },
  {
    name: 'active just above 0 is engaged',
    config: { active: true, reverbIntensity: 0.01 },
    expected: true,
  },
  {
    name: 'active at a partial intensity is engaged',
    config: { active: true, reverbIntensity: 0.5 },
    expected: true,
  },
  {
    name: 'active at full intensity is engaged',
    config: { active: true, reverbIntensity: 1 },
    expected: true,
  },
  {
    name: 'a negative intensity clamps to 0',
    config: { active: true, reverbIntensity: -1 },
    expected: false,
  },
  {
    name: 'an intensity above the ceiling clamps to 1',
    config: { active: true, reverbIntensity: 2 },
    expected: true,
  },
  {
    name: 'a non-finite intensity clamps to 0',
    config: { active: true, reverbIntensity: NaN },
    expected: false,
  },
  {
    name: 'an intensity that rounds to 0 is disengaged',
    config: { active: true, reverbIntensity: 0.001 },
    expected: false,
  },
];

describe('isReverbEngaged', () => {
  for (const { name, config, expected } of reverbCases) {
    test(name, () => {
      expect(isReverbEngaged(config)).toBe(expected);
    });
  }
});

describe('clamp helpers', () => {
  test('clamp keeps a value inside the range', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
  test('clamp collapses a non-finite value to min', () => {
    expect(clamp(NaN, 0.7, 1.3)).toBe(0.7);
  });
  test('clampSlow clamps to 0.7', () => {
    expect(clampSlow(0.1)).toBe(0.7);
  });
  test('clampSlow clamps to 1.3', () => {
    expect(clampSlow(99)).toBe(1.3);
  });
  test('clampSlow rounds to two decimals', () => {
    expect(clampSlow(0.744)).toBe(0.74);
    expect(clampSlow(1.236)).toBe(1.24);
  });
  // Adapted: Source B asserted 0.7 here. Chosen Source A semantics normalize a
  // non-finite speed to 1x (neutral) instead of the floor.
  test('clampSlow normalizes a non-finite value to 1x', () => {
    expect(clampSlow(NaN)).toBe(1);
  });
  test('clampIntensity clamps and rounds', () => {
    expect(clampIntensity(-1)).toBe(0);
    expect(clampIntensity(2)).toBe(1);
    expect(clampIntensity(0.567)).toBe(0.57);
    expect(clampIntensity(0.333)).toBe(0.33);
    expect(clampIntensity(NaN)).toBe(0);
  });
});

const defaults = { slow: 1, reverbIntensity: 0 };

describe('normalize', () => {
  test('fills defaults for missing input', () => {
    expect(normalize(undefined)).toStrictEqual(defaults);
    expect(normalize(null)).toStrictEqual(defaults);
    expect(normalize({})).toStrictEqual(defaults);
    expect(normalize(42)).toStrictEqual(defaults);
    expect(normalize('nope')).toStrictEqual(defaults);
    expect(normalize(true)).toStrictEqual(defaults);
  });

  test('drops unknown keys', () => {
    expect(
      Object.keys(normalize({ slow: 1, reverbIntensity: 0, foo: 1 })).sort(),
    ).toStrictEqual(['reverbIntensity', 'slow']);
  });

  test('slow clamps to its bounds', () => {
    expect(normalize({ slow: 0.1 }).slow).toBe(0.7);
    expect(normalize({ slow: 0 }).slow).toBe(0.7);
    expect(normalize({ slow: -5 }).slow).toBe(0.7);
    expect(normalize({ slow: 2 }).slow).toBe(1.3);
    expect(normalize({ slow: 99 }).slow).toBe(1.3);
    expect(normalize({ slow: 0.7 }).slow).toBe(0.7);
    expect(normalize({ slow: 1.3 }).slow).toBe(1.3);
  });

  test('slow rounds and accepts numeric strings', () => {
    expect(normalize({ slow: 0.744 }).slow).toBe(0.74);
    expect(normalize({ slow: 1.236 }).slow).toBe(1.24);
    expect(normalize({ slow: '0.75' }).slow).toBe(0.75);
  });

  test('slow normalizes non-finite and null to valid values', () => {
    // Adapted from Source B's 0.7 expectation for NaN; see clampSlow above.
    expect(normalize({ slow: NaN }).slow).toBe(1);
    expect(normalize({ slow: null }).slow).toBe(0.7);
  });

  test('intensity clamps, rounds, and accepts numeric strings', () => {
    expect(normalize({ reverbIntensity: -1 }).reverbIntensity).toBe(0);
    expect(normalize({ reverbIntensity: 2 }).reverbIntensity).toBe(1);
    expect(normalize({ reverbIntensity: 0 }).reverbIntensity).toBe(0);
    expect(normalize({ reverbIntensity: 1 }).reverbIntensity).toBe(1);
    expect(normalize({ reverbIntensity: 0.567 }).reverbIntensity).toBe(0.57);
    expect(normalize({ reverbIntensity: 0.333 }).reverbIntensity).toBe(0.33);
    expect(normalize({ reverbIntensity: '0.5' }).reverbIntensity).toBe(0.5);
    expect(normalize({ reverbIntensity: NaN }).reverbIntensity).toBe(0);
  });
});

describe('getDefaultSettings', () => {
  test('returns exactly the neutral settings', () => {
    expect(getDefaultSettings()).toStrictEqual(DEFAULT_SETTINGS);
  });
});

describe('isNeutral', () => {
  test('is true for neutral or omitted settings', () => {
    expect(isNeutral({ slow: 1, reverbIntensity: 0 })).toBe(true);
    expect(isNeutral({})).toBe(true);
    expect(isNeutral()).toBe(true);
    expect(isNeutral(null)).toBe(true);
    expect(isNeutral({ slow: 1.004, reverbIntensity: 0.004 })).toBe(true);
    expect(isNeutral({ slow: '1', reverbIntensity: '0' })).toBe(true);
  });

  test('is false when either knob is non-neutral', () => {
    expect(isNeutral({ slow: 1.01 })).toBe(false);
    expect(isNeutral({ slow: 0.99 })).toBe(false);
    expect(isNeutral({ reverbIntensity: 0.01 })).toBe(false);
    expect(isNeutral({ slow: 1, reverbIntensity: 0.5 })).toBe(false);
    expect(isNeutral({ slow: 1.3, reverbIntensity: 0 })).toBe(false);
    expect(isNeutral({ slow: 1, reverbIntensity: 1 })).toBe(false);
  });
});

describe('formatRate', () => {
  test('formats and clamps a rate', () => {
    expect(formatRate(1)).toBe('1.00x');
    expect(formatRate(0.7)).toBe('0.70x');
    expect(formatRate(1.3)).toBe('1.30x');
    expect(formatRate(0.744)).toBe('0.74x');
    expect(formatRate(0)).toBe('0.70x');
    expect(formatRate(5)).toBe('1.30x');
    // Adapted from Source B's "0.70x"; non-finite speed normalizes to 1x.
    expect(formatRate(NaN)).toBe('1.00x');
  });
});

describe('formatPercent', () => {
  test('formats and clamps an intensity', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.567)).toBe('57%');
    expect(formatPercent(0.004)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(2)).toBe('100%');
    expect(formatPercent(-1)).toBe('0%');
    expect(formatPercent(NaN)).toBe('0%');
  });
});
