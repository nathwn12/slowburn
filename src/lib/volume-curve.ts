/**
 * Perceptual volume curve (http://www.dr-lex.be/info-stuff/volumecontrols.html#about).
 *
 * Single home for the curve. Domain contract, end to end:
 *
 * - the UI, the player state, and the persisted `audio_volume` are all the
 *   LINEAR slider value (0..1, the percentage the owner sees);
 * - the curve is applied exactly once, inside the player, on the way to the
 *   audio stage (element volume pre-graph, master gain post-graph).
 *
 * Persisting the linear value (never the curved gain) is what makes save ->
 * reload round-trip exactly: no transform crosses the persistence boundary,
 * so a stored level can never be re-curved on load. A previous layout applied
 * the curve in the component before calling `player.setVolume`, leaving the
 * player with no defined domain: anything passed linearly was stored curved
 * on one path and re-interpreted on another (owner report 2026-10-09:
 * `audio_volume` drifting 0.20449828 -> 0.48713928 -> 1.0 -> 0.09498642
 * across launches - those stored values are `smoothifyVolume` of the exact
 * slider percents 53 %, 75 %, 100 %, 39 %).
 */

// Volume easing - http://www.dr-lex.be/info-stuff/volumecontrols.html#about
export const SMOOTHING_FACTOR = 2.5;

export const smoothifyVolume = (value: number): number =>
  value ** SMOOTHING_FACTOR;

export const unsmoothifyVolume = (value: number): number =>
  value ** (1.0 / SMOOTHING_FACTOR);
