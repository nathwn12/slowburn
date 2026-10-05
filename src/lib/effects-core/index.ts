/**
 * slowed-reverb-player — framework-agnostic effects core.
 *
 * Four independent, host-free modules:
 *  - {@link ./slowed}  slowed-speed / reverb-intensity clamps and settings
 *  - {@link ./dattorro} Dattorro plate-reverb worklet source + parameter map
 *  - {@link ./loop}    A-B section loop engine
 *  - {@link ./saved}   storage-agnostic saved-loop persistence
 */

export * from './slowed';
export * from './dattorro';
export * from './loop';
export * from './saved';
