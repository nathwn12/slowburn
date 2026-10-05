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
