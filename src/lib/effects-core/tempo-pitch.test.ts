import { describe, expect, test } from 'vitest';

import {
  clamp,
  clampPitch,
  clampRate,
  clampTempo,
  DEFAULT_SETTINGS,
  formatPitch,
  formatRate,
  formatSummary,
  formatTempo,
  getDefaultSettings,
  isNeutral,
  isPitchEngaged,
  isRateEngaged,
  isTempoEngaged,
  normalize,
  percentToRatio,
  PITCH_DEFAULT_SEMITONES,
  PITCH_MAX_SEMITONES,
  PITCH_MIN_SEMITONES,
  RATE_DEFAULT_PERCENT,
  RATE_MAX_PERCENT,
  RATE_MIN_PERCENT,
  ratioToPercent,
  ratioToSemitones,
  semitonesToRatio,
  TEMPO_DEFAULT_PERCENT,
  TEMPO_MAX_PERCENT,
  TEMPO_MIN_PERCENT,
} from './tempo-pitch';

/*
 * Provenance for the tempo/pitch/rate semantics under test: REA/Ghidra
 * analysis of AIMP 5.40.2727 (percent/100.0 tempo conversion with 100
 * neutral, semitone/octave pitch family with 0 neutral, percent-based rate
 * with 100 neutral). Every bound that is not an evidenced neutral is this
 * project's own choice; AIMP's live slider min/max, pitch bounds, and pitch
 * unit scale are UNKNOWN.
 */

const tempoCases: {
  name: string;
  config: { active: boolean; tempo: number };
  expected: boolean;
}[] = [
  {
    name: 'inactive at 150% is disengaged',
    config: { active: false, tempo: 150 },
    expected: false,
  },
  {
    name: 'inactive at 100% is disengaged',
    config: { active: false, tempo: 100 },
    expected: false,
  },
  {
    name: 'active at exactly 100% is disengaged',
    config: { active: true, tempo: 100 },
    expected: false,
  },
  {
    name: 'active just above 100% is engaged',
    config: { active: true, tempo: 100.01 },
    expected: true,
  },
  {
    name: 'active just below 100% is engaged',
    config: { active: true, tempo: 99.99 },
    expected: true,
  },
  {
    name: 'active above 100% is engaged',
    config: { active: true, tempo: 150 },
    expected: true,
  },
  {
    name: 'active below 100% is engaged',
    config: { active: true, tempo: 75 },
    expected: true,
  },
  {
    name: 'a tempo below the floor clamps to a non-100% rate',
    config: { active: true, tempo: 1 },
    expected: true,
  },
  {
    name: 'a tempo above the ceiling clamps to a non-100% rate',
    config: { active: true, tempo: 500 },
    expected: true,
  },
  {
    name: 'a non-finite tempo clamps to 100%',
    config: { active: true, tempo: NaN },
    expected: false,
  },
  {
    name: 'a tempo that rounds to 100% is disengaged',
    config: { active: true, tempo: 100.001 },
    expected: false,
  },
];

describe('isTempoEngaged', () => {
  test.each(tempoCases)('$name', ({ config, expected }) => {
    expect(isTempoEngaged(config)).toBe(expected);
  });
});

const pitchCases: {
  name: string;
  config: { active: boolean; pitch: number };
  expected: boolean;
}[] = [
  {
    name: 'inactive at +3 st is disengaged',
    config: { active: false, pitch: 3 },
    expected: false,
  },
  {
    name: 'inactive at 0 st is disengaged',
    config: { active: false, pitch: 0 },
    expected: false,
  },
  {
    name: 'active at exactly 0 st is disengaged',
    config: { active: true, pitch: 0 },
    expected: false,
  },
  {
    name: 'active just above 0 st is engaged',
    config: { active: true, pitch: 0.01 },
    expected: true,
  },
  {
    name: 'active just below 0 st is engaged',
    config: { active: true, pitch: -0.01 },
    expected: true,
  },
  {
    name: 'active sharp is engaged',
    config: { active: true, pitch: 3 },
    expected: true,
  },
  {
    name: 'active flat is engaged',
    config: { active: true, pitch: -4 },
    expected: true,
  },
  {
    name: 'a pitch below the floor clamps to a non-zero shift',
    config: { active: true, pitch: -99 },
    expected: true,
  },
  {
    name: 'a pitch above the ceiling clamps to a non-zero shift',
    config: { active: true, pitch: 99 },
    expected: true,
  },
  {
    name: 'a non-finite pitch clamps to 0 st',
    config: { active: true, pitch: NaN },
    expected: false,
  },
  {
    name: 'a pitch that rounds to 0 st is disengaged',
    config: { active: true, pitch: 0.001 },
    expected: false,
  },
];

describe('isPitchEngaged', () => {
  test.each(pitchCases)('$name', ({ config, expected }) => {
    expect(isPitchEngaged(config)).toBe(expected);
  });
});

const rateCases: {
  name: string;
  config: { active: boolean; rate: number };
  expected: boolean;
}[] = [
  {
    name: 'inactive at 200% is disengaged',
    config: { active: false, rate: 200 },
    expected: false,
  },
  {
    name: 'inactive at 100% is disengaged',
    config: { active: false, rate: 100 },
    expected: false,
  },
  {
    name: 'active at exactly 100% is disengaged',
    config: { active: true, rate: 100 },
    expected: false,
  },
  {
    name: 'active just above 100% is engaged',
    config: { active: true, rate: 100.01 },
    expected: true,
  },
  {
    name: 'active just below 100% is engaged',
    config: { active: true, rate: 99.99 },
    expected: true,
  },
  {
    name: 'active above 100% is engaged',
    config: { active: true, rate: 250 },
    expected: true,
  },
  {
    name: 'active below 100% is engaged',
    config: { active: true, rate: 60 },
    expected: true,
  },
  {
    name: 'a rate below the floor clamps to a non-100% rate',
    config: { active: true, rate: 1 },
    expected: true,
  },
  {
    name: 'a rate above the ceiling clamps to a non-100% rate',
    config: { active: true, rate: 900 },
    expected: true,
  },
  {
    name: 'a non-finite rate clamps to 100%',
    config: { active: true, rate: NaN },
    expected: false,
  },
  {
    name: 'a rate that rounds to 100% is disengaged',
    config: { active: true, rate: 100.001 },
    expected: false,
  },
];

describe('isRateEngaged', () => {
  test.each(rateCases)('$name', ({ config, expected }) => {
    expect(isRateEngaged(config)).toBe(expected);
  });
});

describe('clamp helpers', () => {
  test('clamp keeps a value inside the range', () => {
    expect(clamp(100, 50, 200)).toBe(100);
  });
  test('clamp collapses a non-finite value to min', () => {
    expect(clamp(NaN, 50, 200)).toBe(50);
  });
  test('clampTempo clamps to 50', () => {
    expect(clampTempo(1)).toBe(50);
  });
  test('clampTempo clamps to 200', () => {
    expect(clampTempo(500)).toBe(200);
  });
  test('clampTempo rounds to two decimals', () => {
    expect(clampTempo(99.995)).toBe(100);
    expect(clampTempo(123.456)).toBe(123.46);
  });
  test('clampTempo normalizes a non-finite value to 100', () => {
    expect(clampTempo(NaN)).toBe(100);
    expect(clampTempo(Infinity)).toBe(100);
  });
  test('clampPitch clamps to -12 and 12', () => {
    expect(clampPitch(-99)).toBe(-12);
    expect(clampPitch(99)).toBe(12);
  });
  test('clampPitch rounds to two decimals', () => {
    expect(clampPitch(2.555)).toBe(2.56);
    expect(clampPitch(-2.554)).toBe(-2.55);
  });
  test('clampPitch normalizes a non-finite value to 0', () => {
    expect(clampPitch(NaN)).toBe(0);
    expect(clampPitch(Infinity)).toBe(0);
  });
  test('clampRate clamps to 50 and 300', () => {
    expect(clampRate(1)).toBe(50);
    expect(clampRate(900)).toBe(300);
  });
  test('clampRate rounds to two decimals', () => {
    expect(clampRate(123.456)).toBe(123.46);
  });
  test('clampRate normalizes a non-finite value to 100', () => {
    expect(clampRate(NaN)).toBe(100);
    expect(clampRate(-Infinity)).toBe(100);
  });
});

describe('percent/ratio conversions', () => {
  test('percentToRatio converts percent with ratio = percent / 100', () => {
    expect(percentToRatio(100)).toBe(1);
    expect(percentToRatio(50)).toBe(0.5);
    expect(percentToRatio(200)).toBe(2);
  });
  test('ratioToPercent converts back to percent', () => {
    expect(ratioToPercent(1)).toBe(100);
    expect(ratioToPercent(0.5)).toBe(50);
    expect(ratioToPercent(2)).toBe(200);
  });
  test('percent/ratio round-trips', () => {
    for (const percent of [50, 75, 100, 123.45, 150, 200]) {
      expect(ratioToPercent(percentToRatio(percent))).toBeCloseTo(percent, 10);
    }
    for (const ratio of [0.5, 0.75, 1, 1.5, 2]) {
      expect(percentToRatio(ratioToPercent(ratio))).toBeCloseTo(ratio, 10);
    }
  });
  test('percentToRatio yields neutral 1 for non-finite input', () => {
    expect(percentToRatio(NaN)).toBe(1);
    expect(percentToRatio(Infinity)).toBe(1);
  });
  test('ratioToPercent yields neutral 100 for non-finite or non-positive input', () => {
    expect(ratioToPercent(NaN)).toBe(100);
    expect(ratioToPercent(Infinity)).toBe(100);
    expect(ratioToPercent(0)).toBe(100);
    expect(ratioToPercent(-2)).toBe(100);
  });
});

describe('semitone/ratio conversions', () => {
  test('an octave up doubles the ratio', () => {
    expect(semitonesToRatio(12)).toBe(2);
  });
  test('neutral 0 semitones is exactly ratio 1', () => {
    expect(semitonesToRatio(0)).toBe(1);
  });
  test('an octave down halves the ratio', () => {
    expect(semitonesToRatio(-12)).toBe(0.5);
  });
  test('ratioToSemitones inverts the ratio', () => {
    expect(ratioToSemitones(2)).toBe(12);
    expect(ratioToSemitones(1)).toBe(0);
    expect(ratioToSemitones(0.5)).toBe(-12);
  });
  test('semitone/ratio round-trips', () => {
    for (const semitones of [-12, -7, -2.5, 0, 3, 7, 12]) {
      expect(ratioToSemitones(semitonesToRatio(semitones))).toBeCloseTo(
        semitones,
        10,
      );
    }
    for (const ratio of [0.5, 0.75, 1, 1.5, 2]) {
      // Loose tolerance: ratioToSemitones rounds to 2 decimals by design.
      expect(semitonesToRatio(ratioToSemitones(ratio))).toBeCloseTo(ratio, 2);
    }
  });
  test('semitonesToRatio yields neutral 1 for non-finite input', () => {
    expect(semitonesToRatio(NaN)).toBe(1);
    expect(semitonesToRatio(-Infinity)).toBe(1);
  });
  test('ratioToSemitones yields neutral 0 for non-finite or non-positive input', () => {
    expect(ratioToSemitones(NaN)).toBe(0);
    expect(ratioToSemitones(Infinity)).toBe(0);
    expect(ratioToSemitones(0)).toBe(0);
    expect(ratioToSemitones(-1)).toBe(0);
  });
});

const neutralDefaults = { tempo: 100, pitch: 0, rate: 100 };

describe('neutral defaults', () => {
  test('DEFAULT_SETTINGS is the documented neutral', () => {
    expect(DEFAULT_SETTINGS).toStrictEqual(neutralDefaults);
  });
  test('default constants carry the evidenced neutrals', () => {
    expect(TEMPO_DEFAULT_PERCENT).toBe(100);
    expect(PITCH_DEFAULT_SEMITONES).toBe(0);
    expect(RATE_DEFAULT_PERCENT).toBe(100);
  });
  test('bound constants carry the chosen values', () => {
    expect(TEMPO_MIN_PERCENT).toBe(50);
    expect(TEMPO_MAX_PERCENT).toBe(200);
    expect(PITCH_MIN_SEMITONES).toBe(-12);
    expect(PITCH_MAX_SEMITONES).toBe(12);
    expect(RATE_MIN_PERCENT).toBe(50);
    expect(RATE_MAX_PERCENT).toBe(300);
  });
});

describe('normalize', () => {
  test('fills defaults for missing input', () => {
    expect(normalize(undefined)).toStrictEqual(neutralDefaults);
    expect(normalize(null)).toStrictEqual(neutralDefaults);
    expect(normalize({})).toStrictEqual(neutralDefaults);
    expect(normalize(42)).toStrictEqual(neutralDefaults);
    expect(normalize('nope')).toStrictEqual(neutralDefaults);
    expect(normalize(true)).toStrictEqual(neutralDefaults);
  });

  test('drops unknown keys', () => {
    expect(
      Object.keys(
        normalize({ tempo: 100, pitch: 0, rate: 100, foo: 1 }),
      ).sort(),
    ).toStrictEqual(['pitch', 'rate', 'tempo']);
  });

  test('tempo clamps to its bounds', () => {
    expect(normalize({ tempo: 1 }).tempo).toBe(50);
    expect(normalize({ tempo: 0 }).tempo).toBe(50);
    expect(normalize({ tempo: -5 }).tempo).toBe(50);
    expect(normalize({ tempo: 500 }).tempo).toBe(200);
    expect(normalize({ tempo: 50 }).tempo).toBe(50);
    expect(normalize({ tempo: 200 }).tempo).toBe(200);
  });

  test('tempo rounds and accepts numeric strings', () => {
    expect(normalize({ tempo: 123.456 }).tempo).toBe(123.46);
    expect(normalize({ tempo: '150' }).tempo).toBe(150);
  });

  test('tempo repairs non-finite and null inputs', () => {
    expect(normalize({ tempo: NaN }).tempo).toBe(100);
    expect(normalize({ tempo: Infinity }).tempo).toBe(100);
    expect(normalize({ tempo: null }).tempo).toBe(50);
  });

  test('pitch clamps, rounds, and accepts numeric strings', () => {
    expect(normalize({ pitch: -99 }).pitch).toBe(-12);
    expect(normalize({ pitch: 99 }).pitch).toBe(12);
    expect(normalize({ pitch: -12 }).pitch).toBe(-12);
    expect(normalize({ pitch: 12 }).pitch).toBe(12);
    expect(normalize({ pitch: 2.555 }).pitch).toBe(2.56);
    expect(normalize({ pitch: '3' }).pitch).toBe(3);
  });

  test('pitch repairs non-finite inputs to 0', () => {
    expect(normalize({ pitch: NaN }).pitch).toBe(0);
    expect(normalize({ pitch: Infinity }).pitch).toBe(0);
  });

  test('rate clamps, rounds, and accepts numeric strings', () => {
    expect(normalize({ rate: 1 }).rate).toBe(50);
    expect(normalize({ rate: 900 }).rate).toBe(300);
    expect(normalize({ rate: 50 }).rate).toBe(50);
    expect(normalize({ rate: 300 }).rate).toBe(300);
    expect(normalize({ rate: 123.456 }).rate).toBe(123.46);
    expect(normalize({ rate: '250' }).rate).toBe(250);
  });

  test('rate repairs non-finite and null inputs', () => {
    expect(normalize({ rate: NaN }).rate).toBe(100);
    expect(normalize({ rate: -Infinity }).rate).toBe(100);
    expect(normalize({ rate: null }).rate).toBe(50);
  });
});

describe('getDefaultSettings', () => {
  test('returns exactly the neutral settings', () => {
    expect(getDefaultSettings()).toStrictEqual(DEFAULT_SETTINGS);
  });
});

describe('isNeutral', () => {
  test('is true for neutral or omitted settings', () => {
    expect(isNeutral({ tempo: 100, pitch: 0, rate: 100 })).toBe(true);
    expect(isNeutral({})).toBe(true);
    expect(isNeutral()).toBe(true);
    expect(isNeutral(null)).toBe(true);
    expect(isNeutral({ tempo: 100.004, pitch: 0.004, rate: 100.004 })).toBe(
      true,
    );
    expect(isNeutral({ tempo: '100', pitch: '0', rate: '100' })).toBe(true);
  });

  test('is false when any knob is non-neutral', () => {
    expect(isNeutral({ tempo: 100.01 })).toBe(false);
    expect(isNeutral({ tempo: 99.99 })).toBe(false);
    expect(isNeutral({ pitch: 0.01 })).toBe(false);
    expect(isNeutral({ pitch: -0.01 })).toBe(false);
    expect(isNeutral({ rate: 100.01 })).toBe(false);
    expect(isNeutral({ tempo: 100, pitch: 0, rate: 150 })).toBe(false);
    expect(isNeutral({ tempo: 200, pitch: 12, rate: 300 })).toBe(false);
  });
});

describe('formatTempo', () => {
  test('formats and clamps a tempo', () => {
    expect(formatTempo(100)).toBe('100%');
    expect(formatTempo(50)).toBe('50%');
    expect(formatTempo(200)).toBe('200%');
    expect(formatTempo(123.456)).toBe('123%');
    expect(formatTempo(1)).toBe('50%');
    expect(formatTempo(500)).toBe('200%');
    expect(formatTempo(NaN)).toBe('100%');
  });
});

describe('formatRate', () => {
  test('formats and clamps a rate', () => {
    expect(formatRate(100)).toBe('100%');
    expect(formatRate(50)).toBe('50%');
    expect(formatRate(300)).toBe('300%');
    expect(formatRate(250.4)).toBe('250%');
    expect(formatRate(1)).toBe('50%');
    expect(formatRate(900)).toBe('300%');
    expect(formatRate(NaN)).toBe('100%');
  });
});

describe('formatPitch', () => {
  test('formats a signed semitone readout', () => {
    expect(formatPitch(0)).toBe('+0 st');
    expect(formatPitch(3)).toBe('+3 st');
    expect(formatPitch(-4)).toBe('-4 st');
    expect(formatPitch(2.5)).toBe('+2.5 st');
    expect(formatPitch(-2.55)).toBe('-2.55 st');
    expect(formatPitch(99)).toBe('+12 st');
    expect(formatPitch(-99)).toBe('-12 st');
    expect(formatPitch(NaN)).toBe('+0 st');
  });
});

describe('formatSummary', () => {
  test('summarizes neutral settings on one line', () => {
    expect(formatSummary({ tempo: 100, pitch: 0, rate: 100 })).toBe(
      'Tempo 100%, Pitch +0 st, Rate 100%',
    );
  });
  test('summarizes engaged settings on one line', () => {
    expect(formatSummary({ tempo: 150, pitch: 3, rate: 250 })).toBe(
      'Tempo 150%, Pitch +3 st, Rate 250%',
    );
  });
  test('summarizes omitted settings as neutral', () => {
    expect(formatSummary()).toBe('Tempo 100%, Pitch +0 st, Rate 100%');
  });
});

describe('non-finite totality', () => {
  test('every numeric helper returns a finite number for NaN and Infinity', () => {
    const hostile = [NaN, Infinity, -Infinity];
    for (const bad of hostile) {
      expect(Number.isFinite(clamp(bad, 0, 1))).toBe(true);
      expect(Number.isFinite(clampTempo(bad))).toBe(true);
      expect(Number.isFinite(clampPitch(bad))).toBe(true);
      expect(Number.isFinite(clampRate(bad))).toBe(true);
      expect(Number.isFinite(percentToRatio(bad))).toBe(true);
      expect(Number.isFinite(ratioToPercent(bad))).toBe(true);
      expect(Number.isFinite(semitonesToRatio(bad))).toBe(true);
      expect(Number.isFinite(ratioToSemitones(bad))).toBe(true);
      const normalized = normalize({ tempo: bad, pitch: bad, rate: bad });
      expect(Number.isFinite(normalized.tempo)).toBe(true);
      expect(Number.isFinite(normalized.pitch)).toBe(true);
      expect(Number.isFinite(normalized.rate)).toBe(true);
    }
  });
});
