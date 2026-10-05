/**
 * Slowed-speed and reverb-intensity clamps/constants.
 *
 * A host-agnostic subset of two local sources:
 *  - pear-desktop `player-actions/slowed-reverb/engine.ts` (Source A)
 *  - slowed-reverb-audio `shared.js` (Source B)
 *
 * Source A's non-finite handling for {@link clampSlow} is chosen: a
 * non-finite/absent speed normalizes to 1x (a no-op) rather than to the 0.7x
 * floor. See README "Source disagreements".
 */

/** Slowest playback rate the core will represent. */
export const SLOW_MIN = 0.7;
/** Fastest playback rate the core will represent. */
export const SLOW_MAX = 1.3;
/** Lowest reverb intensity. */
export const INTENSITY_MIN = 0;
/** Highest reverb intensity. */
export const INTENSITY_MAX = 1;

/** Normalized settings shape shared by every consumer. */
export interface SlowSettings {
  /** Playback rate multiplier, `SLOW_MIN..SLOW_MAX`, rounded to 2 decimals. */
  slow: number;
  /** Reverb wet amount, `INTENSITY_MIN..INTENSITY_MAX`, rounded to 2 decimals. */
  reverbIntensity: number;
}

/** The neutral settings: 1x playback and no reverb. */
export const DEFAULT_SETTINGS: SlowSettings = { slow: 1, reverbIntensity: 0 };

/**
 * Clamps `value` into `[min, max]`. A non-finite/`NaN` input collapses to
 * `min`; every result is finite.
 */
export function clamp(value: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

/**
 * Clamps a playback-rate value into `[SLOW_MIN, SLOW_MAX]` and rounds it to
 * two decimals. A non-finite/`NaN` input normalizes to 1 (neutral/no-op).
 */
export function clampSlow(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.round(clamp(numeric, SLOW_MIN, SLOW_MAX) * 100) / 100;
}

/**
 * Clamps a reverb-intensity value into `[INTENSITY_MIN, INTENSITY_MAX]` and
 * rounds it to two decimals. A non-finite/`NaN` input collapses to 0.
 */
export function clampIntensity(value: number): number {
  return Math.round(clamp(value, INTENSITY_MIN, INTENSITY_MAX) * 100) / 100;
}

/**
 * Coerces arbitrary persisted data into valid {@link SlowSettings}. Missing
 * keys fall back to {@link DEFAULT_SETTINGS}; unknown keys are dropped.
 */
export function normalize(raw: unknown): SlowSettings {
  const next =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    slow: clampSlow(
      Object.prototype.hasOwnProperty.call(next, 'slow')
        ? (next['slow'] as number)
        : DEFAULT_SETTINGS.slow,
    ),
    reverbIntensity: clampIntensity(
      Object.prototype.hasOwnProperty.call(next, 'reverbIntensity')
        ? (next['reverbIntensity'] as number)
        : DEFAULT_SETTINGS.reverbIntensity,
    ),
  };
}

/** Returns a fresh copy of the neutral settings. */
export function getDefaultSettings(): SlowSettings {
  return { ...DEFAULT_SETTINGS };
}

/** Whether normalized settings are exactly 1x with no reverb. */
export function isNeutral(settings?: unknown): boolean {
  const normalized = normalize(settings);
  return normalized.slow === 1 && normalized.reverbIntensity === 0;
}

/**
 * Whether the slow feature has work to do: enabled and not at 1x. Gate for a
 * rate watchdog and for any rate-claim path.
 */
export function isSlowEngaged(config: {
  active: boolean;
  slow: number;
}): boolean {
  return config.active && clampSlow(config.slow) !== 1;
}

/**
 * Whether the reverb has audio to produce: enabled with a non-zero intensity.
 * Gate for building the wet audio path and for posting parameters.
 */
export function isReverbEngaged(config: {
  active: boolean;
  reverbIntensity: number;
}): boolean {
  return config.active && clampIntensity(config.reverbIntensity) > 0;
}

/** Formats a playback rate as `"1.00x"`-style text. */
export function formatRate(value: number): string {
  return `${clampSlow(value).toFixed(2)}x`;
}

/** Formats a reverb intensity as a `"0%".."100%"` percentage. */
export function formatPercent(value: number): string {
  return `${Math.round(clampIntensity(value) * 100)}%`;
}
