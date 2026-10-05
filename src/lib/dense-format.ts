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

/**
 * Sample rate as a kHz label: `44100` -> `44.1 kHz`, `48000` -> `48 kHz`.
 * Em-dash when genuinely unknown.
 */
export function formatSampleRate(hz: number | null | undefined): string {
  if (hz == null || !Number.isFinite(hz) || hz <= 0) return NO_VALUE;
  const khz = hz / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}

/** Bit depth label, e.g. `16 bit`. Em-dash for lossy formats (null). */
export function formatBitDepth(bits: number | null | undefined): string {
  if (bits == null || !Number.isFinite(bits) || bits <= 0) return NO_VALUE;
  return `${bits} bit`;
}

/** Channel-count label: `Mono`, `Stereo`, or `N ch` for anything else. */
export function formatChannels(channels: number | null | undefined): string {
  if (channels == null || !Number.isFinite(channels) || channels <= 0) {
    return NO_VALUE;
  }
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  return `${channels} ch`;
}

/** Bitrate (bits per second) as kbps, e.g. `1009000` -> `1,009 kbps`. */
export function formatBitrate(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return NO_VALUE;
  return `${Math.round(bps / 1000).toLocaleString('en-US')} kbps`;
}

/** File size in bytes as a human label, e.g. `28698329` -> `27.4 MB`. */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return NO_VALUE;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/** ISO-8601 timestamp as `YYYY-MM-DD · HH:MM` (UTC), em-dash when absent. */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return NO_VALUE;
  // Stored as ISO-8601 UTC; the first 16 chars are the honest wall value.
  return `${iso.slice(0, 10)} · ${iso.slice(11, 16)}`;
}

/** Play history without inventing precision: `17 times · last 3 days ago`. */
export function formatPlayed(
  count: number | null | undefined,
  lastPlayed: string | null | undefined,
): string {
  if (count == null || !Number.isFinite(count) || count <= 0) {
    return 'never played';
  }
  const times = count === 1 ? '1 time' : `${count} times`;
  if (!lastPlayed) return times;
  const then = Date.parse(lastPlayed);
  if (Number.isNaN(then)) return times;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return `${times} · today`;
  if (days === 1) return `${times} · yesterday`;
  return `${times} · ${days} days ago`;
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
