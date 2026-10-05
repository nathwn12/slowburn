/**
 * Small, honest helpers for the Dense now-playing surface.
 *
 * The `Track` record only carries tags + duration (see `src/generated/typings.ts`):
 * there is no codec, sample-rate, bitrate, bit-depth or channel-count metadata
 * anywhere in the app today. Everything that needs those fields renders an
 * em-dash rather than guessing, and the format is derived from the file
 * extension (the one format fact the app actually owns).
 */

/** Extensions the app imports, mapped to a display label. */
const FORMAT_LABELS: Record<string, string> = {
  aac: 'AAC',
  mp3: 'MP3',
  m4a: 'M4A',
  '3gp': '3GP',
  wav: 'WAV',
  ogg: 'OGG',
  opus: 'OPUS',
  flac: 'FLAC',
  weba: 'WEBA',
};

/** Formats that are lossless for certain (m4a may be ALAC, so it is not). */
const LOSSLESS_FORMATS = new Set(['FLAC', 'WAV']);

/** The rendered value for a fact the app has no data source for. */
export const NO_VALUE = '—';

/** Upper-case format label derived from a file path, or em-dash. */
export function audioFormatLabel(path: string | null | undefined): string {
  if (!path) return NO_VALUE;
  const dot = path.lastIndexOf('.');
  if (dot < 0) return NO_VALUE;
  const ext = path.slice(dot + 1).toLowerCase();
  return FORMAT_LABELS[ext] ?? ext.toUpperCase();
}

/** Whether a format label is lossless (only FLAC/WAV are certain). */
export function isLosslessFormat(label: string): boolean {
  return LOSSLESS_FORMATS.has(label);
}

/** `m:ss` (no padding on minutes), e.g. `0:42`, `3:17`. */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** `m:ss.mmm` for the detail panel, e.g. `0:37.240`. */
export function formatClockMs(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return NO_VALUE;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}

/** Two-character stand-in glyph for the art tile, from an album/title string. */
export function artInitials(...sources: Array<string | null | undefined>): string {
  for (const source of sources) {
    if (!source) continue;
    const words = source.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    if (words.length === 1) {
      return words[0]!.slice(0, 2).toUpperCase();
    }
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return '';
}
