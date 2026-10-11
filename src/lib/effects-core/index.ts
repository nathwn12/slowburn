/**
 * slowed-reverb-player — framework-agnostic effects core.
 *
 * Six independent, host-free modules:
 *  - {@link ./slowed}  slowed-speed / reverb-intensity clamps and settings
 *  - {@link ./dattorro} Dattorro plate-reverb worklet source + parameter map
 *  - {@link ./pitch-shift} granular pitch-shifter worklet source + helpers
 *  - {@link ./tempo-pitch} tempo/pitch/rate pure logic (named re-exports only)
 *  - {@link ./loop}    A-B section loop engine
 *  - {@link ./saved}   storage-agnostic saved-loop persistence
 */

export * from './slowed';
export * from './dattorro';
export * from './pitch-shift';
export * from './loop';
export * from './saved';

// `tempo-pitch` is re-exported by NAME (not `export *`) because its generic
// helpers (`clamp`, `normalize`, `DEFAULT_SETTINGS`, `getDefaultSettings`,
// `isNeutral`, `formatRate`) intentionally share names with `slowed.ts`, and
// its `semitonesToRatio` is the same function object as `pitch-shift.ts`'s
// (single definition there; the alias here keeps `tempo-pitch`'s public API
// stable). A wildcard re-export would leave every one of those names
// ambiguous; the explicit list below keeps the barrel collision-free while
// the full module stays importable directly from `./tempo-pitch`.
export {
  clampPitch,
  clampRate,
  clampTempo,
  formatPitch,
  formatSummary,
  formatTempo,
  isPitchEngaged,
  isRateEngaged,
  isTempoEngaged,
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
  type TempoPitchSettings,
} from './tempo-pitch';
