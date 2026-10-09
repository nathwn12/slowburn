import { isDeadRegion, resolveSetA, resolveSetB } from '../lib/dense-ab';
import { formatClockMs } from '../lib/dense-format';

/**
 * Time-field parsing, ported from pear-desktop's `section-repeat` engine
 * (`parseTimeInput`) and extended with an optional fractional part, because
 * this app displays milliseconds.
 *
 * Accepts `ss`, `m:ss` and `h:mm:ss`, each optionally with a fraction on the
 * final part (`1:23.5`, `1:23.500`). Whitespace is trimmed. Parts after the
 * first must be below 60. Everything else — signs, junk, empty parts, more
 * than three parts, an empty string — is invalid.
 */
export type ParsedTimeInput =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'time'; seconds: number };

const INTEGER_PART = /^\d+$/;
const FRACTIONAL_PART = /^\d+(\.\d+)?$/;

export function parseTimeInput(raw: string): ParsedTimeInput {
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'empty' };

  const parts = trimmed.split(':');
  if (parts.length > 3) return { kind: 'invalid' };

  const values: number[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isLast = index === parts.length - 1;
    // Only the final part may carry a fraction.
    const pattern = isLast ? FRACTIONAL_PART : INTEGER_PART;
    if (!pattern.test(part)) return { kind: 'invalid' };
    const value = Number(part);
    if (!Number.isFinite(value)) return { kind: 'invalid' };
    values.push(value);
  }

  let seconds: number;
  if (values.length === 1) {
    seconds = values[0];
  } else if (values.length === 2) {
    const [minutes, secs] = values;
    if (secs >= 60) return { kind: 'invalid' };
    seconds = minutes * 60 + secs;
  } else {
    const [hours, minutes, secs] = values;
    if (minutes >= 60 || secs >= 60) return { kind: 'invalid' };
    seconds = hours * 3600 + minutes * 60 + secs;
  }

  if (!Number.isFinite(seconds) || seconds < 0) return { kind: 'invalid' };
  return { kind: 'time', seconds };
}

/**
 * The single display dialect for an A-B point: `m:ss.mmm`, the same formatter
 * the detail panel uses. `null` renders an empty field (with a `--:--`
 * placeholder) rather than a dash value.
 */
export function formatTimeInput(seconds: number | null | undefined): string {
  if (seconds == null) return '';
  return formatClockMs(seconds);
}

export type AbPoint = 'A' | 'B';

/** The resolved write of one typed point (both points: the other may move). */
export type PointCommitResult = {
  a: number | null;
  b: number | null;
  /**
   * Where the playhead goes on commit, or `null` when it stays put: the typed
   * point did not land exactly (clamped past the track end, or the geometry
   * moved it), or the target sits at/past the end of the track, where no
   * seek can land - the platform would end the track instead.
   */
  seek: number | null;
};

export type PointCommit =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'dead' }
  | ({ kind: 'commit' } & PointCommitResult);

/**
 * The shared parse/commit path for a typed A-B point: parse `raw`, clamp to
 * the track, and resolve through the dense geometry (`resolveSetA/B`), so the
 * live-on-change path and the Enter/blur path commit exactly the same region.
 * `invalid` never commits; `empty` and `dead` leave the loop untouched.
 */
export function resolvePointCommit(
  point: AbPoint,
  raw: string,
  current: { a: number | null; b: number | null },
  duration: number,
): PointCommit {
  const parsed = parseTimeInput(raw);
  if (parsed.kind === 'empty') return { kind: 'empty' };
  if (parsed.kind === 'invalid') return { kind: 'invalid' };

  const seconds = Math.min(duration, Math.max(0, parsed.seconds));
  // The playhead follows the typed time only when it lands exactly and
  // strictly inside the track. A clamped or geometry-moved point commits the
  // region but does not seek: jumping to an adjusted value would surprise,
  // and seeking at/past the media end would end the track outright.
  const seek = seconds < duration ? seconds : null;
  if (point === 'A') {
    const next = resolveSetA(seconds, current.b, duration);
    // Last-ditch guard (the geometry already prevents this): never persist a
    // dead region (inverted or below the 2% gap) that claims to be a saved
    // loop but can never loop.
    if (isDeadRegion(next.a, next.b, duration)) return { kind: 'dead' };
    return {
      kind: 'commit',
      a: next.a,
      b: next.b,
      seek: next.a === seconds ? seek : null,
    };
  }
  const next = resolveSetB(current.a, seconds, duration);
  if (isDeadRegion(next.a, next.b, duration)) return { kind: 'dead' };
  return {
    kind: 'commit',
    a: next.a,
    b: next.b,
    seek: next.b === seconds ? seek : null,
  };
}
