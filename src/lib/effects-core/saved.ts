/**
 * Saved-loop persistence (pure, storage-agnostic).
 *
 * Derived from pear-desktop `player-actions/section-repeat/saved.ts`
 * (Source A), MIT licensed:
 *
 *   The MIT License (MIT)
 *   Copyright (c) th-ch <th-ch@users.noreply.github.com>
 *   https://github.com/pear-devs/pear-desktop
 *
 * Source B has no equivalent. The one deliberate change: the
 * source's YouTube-specific `videoId` field is renamed to the opaque
 * `trackId`; the module never assumes what a track id means, it only compares
 * them and keeps them unique per entry.
 *
 * These functions never touch storage. The caller reads/writes its own store
 * and passes the raw value to {@link sanitizeSaved}.
 */

/** One persisted loop, keyed by an opaque track id. */
export interface SavedLoop {
  /** Opaque host-supplied track id; compared for equality only. */
  trackId: string;
  /** Saved loop start in seconds, or `null` when unset. */
  startSeconds: number | null;
  /** Saved loop end in seconds, or `null` when unset. */
  endSeconds: number | null;
}

/** A persisted collection of saved loops. */
export type SavedLoops = SavedLoop[];

/** `null` is a valid "unset" point; `undefined` marks the value invalid. */
function sanitizeTime(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function sanitizeEntry(raw: unknown): SavedLoop | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const trackId = record['trackId'];
  if (typeof trackId !== 'string' || trackId === '') return null;

  const startSeconds = sanitizeTime(record['startSeconds']);
  const endSeconds = sanitizeTime(record['endSeconds']);
  if (startSeconds === undefined || endSeconds === undefined) return null;
  if (startSeconds === null && endSeconds === null) return null;

  return { trackId, startSeconds, endSeconds };
}

/**
 * Coerces persisted data into a valid list. Malformed entries are dropped,
 * entries with both points unset are forgets and do not survive, and a
 * duplicated `trackId` keeps its last occurrence.
 */
export function sanitizeSaved(raw: unknown): SavedLoops {
  if (!Array.isArray(raw)) return [];
  const list: unknown[] = raw;
  const sanitized: SavedLoops = [];
  for (const item of list) {
    const entry = sanitizeEntry(item);
    if (entry === null) continue;
    const previous = sanitized.findIndex(
      (existing) => existing.trackId === entry.trackId,
    );
    if (previous !== -1) sanitized.splice(previous, 1);
    sanitized.push(entry);
  }
  return sanitized;
}

/** Returns the saved loop for a track, or `null` when it has none. */
export function lookupSaved(
  saved: SavedLoops,
  trackId: string,
): SavedLoop | null {
  for (let index = saved.length - 1; index >= 0; index -= 1) {
    if (saved[index]!.trackId === trackId) return saved[index]!;
  }
  return null;
}

/**
 * Replaces the track's entry or appends a new one. An entry with both points
 * unset is an explicit forget and removes the track's entry instead.
 */
export function upsertSaved(saved: SavedLoops, entry: SavedLoop): SavedLoops {
  const remaining = saved.filter((item) => item.trackId !== entry.trackId);
  if (entry.startSeconds === null && entry.endSeconds === null) {
    return remaining;
  }
  return [...remaining, entry];
}
