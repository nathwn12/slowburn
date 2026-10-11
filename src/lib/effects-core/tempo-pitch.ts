/**
 * Independent tempo/pitch/rate pure-logic core (no audio-graph wiring, no UI).
 *
 * Provenance (REA/Ghidra analysis of AIMP 5.40.2727):
 *  - TEMPO is an INTEGER PERCENT converted with `ratio = percent / 100.0`,
 *    then neutral is `1.0f`. Observed instruction sequence in AIMP.exe:
 *    `CVTSI2SD XMM0,EAX; DIVSD XMM0,[0x70a6e8]; CVTSD2SS; CALL
 *    SetPlaybackTempo`; the divisor at `0x70a6e8` is the double `100.0`.
 *  - TEMPO default/neutral is 100 percent. AIMP's loader treats a value
 *    below 1 as unset and resets it to the neutral.
 *  - PITCH: the EXISTENCE of a semitone/octave conversion family
 *    (`PitchConvert.ToSemitones/FromSemitones/ToOctaves/FromOctaves`) is
 *    EVIDENCED as observed symbol names; its formula, scale/units, and
 *    engine neutral are UNKNOWN. The 0-semitone neutral below is OUR
 *    CHOICE, consistent with the live config value `PlaybackPitch=0`
 *    (evidenced as a live config key, not as an engine default).
 *  - RATE (AIMP labels this control Speed; internals say Speed): the
 *    percent-basis is EVIDENCED for TEMPO only, not for speed, and the
 *    speed neutral is UNKNOWN as an engine default. The 100-percent
 *    neutral below is OUR CHOICE, consistent with the live config value
 *    `PlaybackSpeed=100` (evidenced as a live config key).
 *  - Historical reference DATA (not live bounds): the AIMP changelog records
 *    a 2x ceiling for tempo and speed (v4.60.2113, 2019) and a 3x ceiling for
 *    speed control (v4.70.2210, 2020).
 *  - UNKNOWN from every shipped resource and document: AIMP's live slider
 *    min/max, the pitch bounds, and the pitch unit scale. Every bound below
 *    not marked EVIDENCED is OUR CHOICE and must not be read as AIMP fact.
 *
 *  Semitone-range ownership (dedup note): the ±12 octave bound, the neutral,
 *  the clamp, and the semitone-to-ratio conversion are owned SOLELY by
 *  `pitch-shift.ts` (the bound is dictated by that module's granular DSP
 *  buffer budget and proven spectrally there). This module consumes them via
 *  the `PITCH_*` / `clampPitch` / `semitonesToRatio` aliases below so the two
 *  modules never define one concept twice.
 */

import {
  clampPitchSemitones,
  DEFAULT_PITCH_SEMITONES as DSP_DEFAULT_PITCH_SEMITONES,
  PITCH_SHIFT_MAX_SEMITONES,
  PITCH_SHIFT_MIN_SEMITONES,
  semitonesToRatio as dspSemitonesToRatio,
} from './pitch-shift';

/** Lowest tempo percent the core will represent. OUR CHOICE: half-speed floor keeps speech and music intelligible without extra time-stretch tuning; AIMP live min is UNKNOWN. */
export const TEMPO_MIN_PERCENT = 50;
/** Highest tempo percent the core will represent. OUR CHOICE: mirrors the historical 2x tempo ceiling (v4.60.2113) as a safe reference; AIMP live max is UNKNOWN. */
export const TEMPO_MAX_PERCENT = 200;
/** Neutral tempo percent. EVIDENCED: AIMP tempo default/neutral is 100 percent (percent/100.0 ratio family). */
export const TEMPO_DEFAULT_PERCENT = 100;
/** Lowest pitch shift the core will represent, in semitones. Alias of the DSP-owned bound (`PITCH_SHIFT_MIN_SEMITONES`): OUR CHOICE, one octave down covering practice use; AIMP pitch bounds are UNKNOWN. */
export const PITCH_MIN_SEMITONES = PITCH_SHIFT_MIN_SEMITONES;
/** Highest pitch shift the core will represent, in semitones. Alias of the DSP-owned bound (`PITCH_SHIFT_MAX_SEMITONES`): OUR CHOICE, one octave up; AIMP pitch bounds are UNKNOWN. */
export const PITCH_MAX_SEMITONES = PITCH_SHIFT_MAX_SEMITONES;
/** Neutral pitch shift in semitones. OUR CHOICE: 0 as the no-op neutral (same value as the DSP-owned neutral). The EXISTENCE of AIMP's semitone/octave conversion family is EVIDENCED as observed symbol names; its neutral, formula, and scale are UNKNOWN. Consistent with the live config value `PlaybackPitch=0` (evidenced as a live config key, not as an engine default). */
export const PITCH_DEFAULT_SEMITONES = DSP_DEFAULT_PITCH_SEMITONES;
/** Lowest rate percent the core will represent. OUR CHOICE: symmetric half-speed floor matching tempo; AIMP live min is UNKNOWN. */
export const RATE_MIN_PERCENT = 50;
/** Highest rate percent the core will represent. OUR CHOICE: mirrors the historical 3x speed ceiling (v4.70.2210) as a reference; AIMP live max is UNKNOWN. */
export const RATE_MAX_PERCENT = 300;
/** Neutral rate percent. OUR CHOICE: 100 as the no-op neutral, matching the tempo channel. The percent-basis is EVIDENCED for TEMPO only, not for speed; the speed neutral is UNKNOWN as an engine default. Consistent with the live config value `PlaybackSpeed=100` (evidenced as a live config key). */
export const RATE_DEFAULT_PERCENT = 100;

/** Normalized settings shape shared by every consumer. */
export interface TempoPitchSettings {
  /** Tempo in percent, `TEMPO_MIN_PERCENT..TEMPO_MAX_PERCENT`, rounded to 2 decimals. */
  tempo: number;
  /** Pitch shift in semitones, `PITCH_MIN_SEMITONES..PITCH_MAX_SEMITONES`, rounded to 2 decimals. */
  pitch: number;
  /** Rate in percent, `RATE_MIN_PERCENT..RATE_MAX_PERCENT`, rounded to 2 decimals. */
  rate: number;
}

/** The neutral settings: 100% tempo, 0 semitones, 100% rate. */
export const DEFAULT_SETTINGS: TempoPitchSettings = {
  tempo: TEMPO_DEFAULT_PERCENT,
  pitch: PITCH_DEFAULT_SEMITONES,
  rate: RATE_DEFAULT_PERCENT,
};

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
 * Clamps a tempo percent into `[TEMPO_MIN_PERCENT, TEMPO_MAX_PERCENT]` and
 * rounds it to two decimals. Chosen fallback: a non-finite/`NaN` input
 * normalizes to 100 (neutral/no-op), mirroring AIMP's loader resetting an
 * unset tempo to neutral.
 */
export function clampTempo(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return TEMPO_DEFAULT_PERCENT;
  return (
    Math.round(clamp(numeric, TEMPO_MIN_PERCENT, TEMPO_MAX_PERCENT) * 100) / 100
  );
}

/**
 * Clamps a pitch shift into `[PITCH_MIN_SEMITONES, PITCH_MAX_SEMITONES]` and
 * rounds it to two decimals. Chosen fallback: a non-finite/`NaN` input
 * normalizes to 0 (neutral/no-op). Alias of the DSP-owned
 * `clampPitchSemitones` (identical semantics); the single definition lives in
 * `pitch-shift.ts`.
 */
export const clampPitch: (value: number) => number = clampPitchSemitones;

/**
 * Clamps a rate percent into `[RATE_MIN_PERCENT, RATE_MAX_PERCENT]` and
 * rounds it to two decimals. Chosen fallback: a non-finite/`NaN` input
 * normalizes to 100 (neutral/no-op), matching the tempo channel.
 */
export function clampRate(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return RATE_DEFAULT_PERCENT;
  return (
    Math.round(clamp(numeric, RATE_MIN_PERCENT, RATE_MAX_PERCENT) * 100) / 100
  );
}

/**
 * Converts an integer-percent tempo into a playback ratio with
 * `ratio = percent / 100.0` (EVIDENCED AIMP tempo conversion; neutral
 * `1.0f`). Reuse for the rate channel is OUR CHOICE (the percent-basis is
 * evidenced for tempo only). Routes through the tempo clamp so a
 * non-finite input yields 1 (neutral) and every result is finite.
 */
export function percentToRatio(p: number): number {
  return clampTempo(p) / 100;
}

/**
 * Converts a playback ratio back into a percent readout, rounded to two
 * decimals. Chosen fallback: a non-finite input yields 100 (neutral); a
 * non-positive ratio clamps through the same neutral since it has no
 * meaningful percent. Deliberately unclamped to any channel bound so one
 * helper serves both the tempo and rate channels.
 */
export function ratioToPercent(r: number): number {
  const numeric = Number(r);
  if (!Number.isFinite(numeric) || numeric <= 0) return TEMPO_DEFAULT_PERCENT;
  return Math.round(numeric * 100 * 100) / 100;
}

/**
 * Converts semitones into a playback ratio with `2 ** (n / 12)` (OUR
 * CHOICE: the standard equal-temperament semitone ratio, chosen because it
 * is the correct musical definition and because this project's own granular
 * shifter is proven against it; neutral 0 maps to exactly 1). Alias of the
 * DSP-owned `semitonesToRatio` (non-finite input yields 1); the single
 * definition lives in `pitch-shift.ts`.
 */
export const semitonesToRatio: (n: number) => number = dspSemitonesToRatio;

/**
 * Converts a playback ratio back into semitones with `12 * log2(r)`
 * (OUR CHOICE: the standard-definition inverse of `2 ** (n / 12)`),
 * rounded to two decimals. Chosen fallback: a non-finite or non-positive
 * ratio yields 0 (neutral) since it has no meaningful semitone value.
 */
export function ratioToSemitones(r: number): number {
  const numeric = Number(r);
  if (!Number.isFinite(numeric) || numeric <= 0) return PITCH_DEFAULT_SEMITONES;
  return Math.round(12 * Math.log2(numeric) * 100) / 100;
}

/**
 * Coerces arbitrary persisted data into valid {@link TempoPitchSettings}.
 * Missing keys fall back to {@link DEFAULT_SETTINGS}; unknown keys are
 * dropped.
 */
export function normalize(raw: unknown): TempoPitchSettings {
  const next =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    tempo: clampTempo(
      Object.prototype.hasOwnProperty.call(next, 'tempo')
        ? (next['tempo'] as number)
        : DEFAULT_SETTINGS.tempo,
    ),
    pitch: clampPitch(
      Object.prototype.hasOwnProperty.call(next, 'pitch')
        ? (next['pitch'] as number)
        : DEFAULT_SETTINGS.pitch,
    ),
    rate: clampRate(
      Object.prototype.hasOwnProperty.call(next, 'rate')
        ? (next['rate'] as number)
        : DEFAULT_SETTINGS.rate,
    ),
  };
}

/** Returns a fresh copy of the neutral settings. */
export function getDefaultSettings(): TempoPitchSettings {
  return { ...DEFAULT_SETTINGS };
}

/** Whether normalized settings are exactly neutral: 100%, +0 st, 100%. */
export function isNeutral(settings?: unknown): boolean {
  const normalized = normalize(settings);
  return (
    normalized.tempo === TEMPO_DEFAULT_PERCENT &&
    normalized.pitch === PITCH_DEFAULT_SEMITONES &&
    normalized.rate === RATE_DEFAULT_PERCENT
  );
}

/**
 * Whether the tempo has work to do: enabled and not at 100%. Gate for
 * building the tempo audio path and for posting tempo parameters.
 */
export function isTempoEngaged(config: {
  active: boolean;
  tempo: number;
}): boolean {
  return config.active && clampTempo(config.tempo) !== TEMPO_DEFAULT_PERCENT;
}

/**
 * Whether the pitch shift has work to do: enabled and not at 0 semitones.
 * Gate for building the pitch-shift audio path and for posting parameters.
 */
export function isPitchEngaged(config: {
  active: boolean;
  pitch: number;
}): boolean {
  return config.active && clampPitch(config.pitch) !== PITCH_DEFAULT_SEMITONES;
}

/**
 * Whether the rate has work to do: enabled and not at 100%. Gate for
 * building the rate audio path and for posting rate parameters.
 */
export function isRateEngaged(config: {
  active: boolean;
  rate: number;
}): boolean {
  return config.active && clampRate(config.rate) !== RATE_DEFAULT_PERCENT;
}

/** Formats a tempo percent as a `"50%".."200%"` percentage readout. */
export function formatTempo(value: number): string {
  return `${Math.round(clampTempo(value))}%`;
}

/** Formats a rate percent as a `"50%".."300%"` percentage readout. */
export function formatRate(value: number): string {
  return `${Math.round(clampRate(value))}%`;
}

/**
 * Formats a pitch shift as a signed semitone readout like `"+0 st"`,
 * `"+3 st"`, or `"-2.5 st"` (integer shifts render without decimals).
 */
export function formatPitch(value: number): string {
  const clamped = clampPitch(value);
  const sign = clamped < 0 ? '-' : '+';
  const magnitude = Math.abs(clamped);
  const text = Number.isInteger(magnitude)
    ? String(magnitude)
    : String(Math.round(magnitude * 100) / 100);
  return `${sign}${text} st`;
}

/**
 * Formats normalized settings as a one-line summary like
 * `"Tempo 100%, Pitch +0 st, Rate 100%"`.
 */
export function formatSummary(settings?: unknown): string {
  const normalized = normalize(settings);
  return `Tempo ${formatTempo(normalized.tempo)}, Pitch ${formatPitch(normalized.pitch)}, Rate ${formatRate(normalized.rate)}`;
}
