import { describe, expect, test } from 'vite-plus/test';

import { DEFAULT_EFFECTS_CONFIG, normalizeEffectsConfig } from '../effects';

describe('normalizeEffectsConfig', () => {
  test('returns the neutral defaults for empty input', () => {
    expect(normalizeEffectsConfig(undefined)).toEqual(DEFAULT_EFFECTS_CONFIG);
  });

  test('clamps slow into the 0.70..1.30 range', () => {
    expect(normalizeEffectsConfig({ slow: 0.1 }).slow).toBe(0.7);
    expect(normalizeEffectsConfig({ slow: 9 }).slow).toBe(1.3);
    expect(normalizeEffectsConfig({ slow: 0.824 }).slow).toBe(0.82);
  });

  test('clamps reverb intensity into 0..1', () => {
    expect(
      normalizeEffectsConfig({ reverbIntensity: -1 }).reverbIntensity,
    ).toBe(0);
    expect(normalizeEffectsConfig({ reverbIntensity: 5 }).reverbIntensity).toBe(
      1,
    );
    expect(
      normalizeEffectsConfig({ reverbIntensity: 0.456 }).reverbIntensity,
    ).toBe(0.46);
  });

  test('non-finite values fall back to neutral', () => {
    expect(normalizeEffectsConfig({ slow: Number.NaN }).slow).toBe(1);
    // Infinity is non-finite, so clampIntensity collapses to its minimum.
    expect(
      normalizeEffectsConfig({ reverbIntensity: Number.POSITIVE_INFINITY })
        .reverbIntensity,
    ).toBe(0);
  });

  test('enable flags pass through and default to enabled', () => {
    expect(normalizeEffectsConfig({ enabled: false }).enabled).toBe(false);
    expect(normalizeEffectsConfig({ slowEnabled: false }).slowEnabled).toBe(
      false,
    );
    expect(normalizeEffectsConfig({ reverbEnabled: false }).reverbEnabled).toBe(
      false,
    );
    expect(normalizeEffectsConfig({}).enabled).toBe(true);
  });
});
