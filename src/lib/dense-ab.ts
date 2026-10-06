/**
 * Pure geometry for the Dense A-B surface.
 *
 * The engine (`src/lib/player.ts`) is deliberately dumb: `setAbPoint` stores
 * whatever seconds it is given. All the "never inverted, never zero-width"
 * rules from the concept live here so the seek handle drag, the A/B buttons and
 * the keyboard all enforce the same constraints.
 *
 * Rules (design §2.3):
 *  - minimum gap between A and B is 2% of the track;
 *  - setting B on/behind A pushes A back 10% of the track;
 *  - setting A on/after B pushes B forward 10% of the track.
 */

export const MIN_GAP_RATIO = 0.02;
export const PUSH_RATIO = 0.1;

export function clampSeconds(value: number, duration: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, value);
  return Math.min(duration, Math.max(0, value));
}

function minGap(duration: number): number {
  return Number.isFinite(duration) && duration > 0
    ? duration * MIN_GAP_RATIO
    : 0;
}

function pushAmount(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration * PUSH_RATIO : 0;
}

export type Points = { a: number | null; b: number | null };
export type SetAResult = { a: number; b: number | null };
export type SetBResult = { a: number | null; b: number };

/** A pinned at `seconds`; B kept unless it would invert, then pushed forward. */
export function resolveSetA(
  seconds: number,
  b: number | null,
  duration: number,
): SetAResult {
  const a = clampSeconds(seconds, duration);
  if (b == null) return { a, b: null };
  if (a >= b - minGap(duration)) {
    const gap = Math.max(pushAmount(duration), minGap(duration));
    // Push B forward to clear A...
    const pushed = clampSeconds(a + gap, duration);
    if (pushed - a >= minGap(duration)) return { a, b: pushed };
    // ...but there is no room left after A (A is at/near the end). Rather than
    // collapse to a zero-width `{duration, duration}` loop, pin B to the end
    // and pull A back far enough to leave a usable region.
    return {
      a: Math.min(a, clampSeconds(duration - gap, duration)),
      b: duration,
    };
  }
  return { a, b };
}

/** B pinned at `seconds`; A kept unless it would invert, then pushed back. */
export function resolveSetB(
  a: number | null,
  seconds: number,
  duration: number,
): SetBResult {
  const b = clampSeconds(seconds, duration);
  if (a == null) return { a: null, b };
  if (b <= a + minGap(duration)) {
    const gap = Math.max(pushAmount(duration), minGap(duration));
    // Pull A back to clear B...
    const pulled = clampSeconds(b - gap, duration);
    if (b - pulled >= minGap(duration)) return { a: pulled, b };
    // ...but there is no room left before B (B is at the start). Rather than
    // collapse to a zero-width `{0, 0}` loop, pin A to the start and push B
    // forward far enough to leave a usable region.
    return { a: 0, b: Math.max(b, clampSeconds(gap, duration)) };
  }
  return { a, b };
}

/**
 * True when a fully-specified region cannot actually loop: inverted, or
 * narrower than the minimum 2% gap. A point still `null` (a half-set region)
 * is not dead - there is simply nothing to loop yet.
 */
export function isDeadRegion(
  a: number | null,
  b: number | null,
  duration: number,
): boolean {
  if (a == null || b == null) return false;
  if (!(b > a)) return true;
  return b - a < minGap(duration);
}

/** Drag A: cannot cross B; keeps the minimum gap. Returns the new A. */
export function resolveDragA(
  seconds: number,
  b: number | null,
  duration: number,
): number {
  const a = clampSeconds(seconds, duration);
  if (b == null) return a;
  return Math.min(a, Math.max(0, b - minGap(duration)));
}

/** Drag B: cannot cross A; keeps the minimum gap. Returns the new B. */
export function resolveDragB(
  seconds: number,
  a: number | null,
  duration: number,
): number {
  const b = clampSeconds(seconds, duration);
  if (a == null) return b;
  return Math.max(b, Math.min(duration, a + minGap(duration)));
}

/** Nudge a point by a delta, honouring the cross/gap rules. */
export function nudgeA(
  delta: number,
  a: number | null,
  b: number | null,
  duration: number,
): number {
  const base = a ?? 0;
  return resolveDragA(base + delta, b, duration);
}

export function nudgeB(
  delta: number,
  a: number | null,
  b: number | null,
  duration: number,
): number {
  const base = b ?? duration;
  return resolveDragB(base + delta, a, duration);
}
