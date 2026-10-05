import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { info } from '@tauri-apps/plugin-log';

import type { Track } from '../generated/typings';

/**
 * Peak envelope for the seek waveform.
 *
 * Decoding is offline rendering: an `OfflineAudioContext` never touches the
 * audio device, so this makes no sound. One decode per track id, cached in
 * memory; in-flight work is cancelled when the track changes so fast scrubbing
 * cannot queue a backlog.
 */

/** Buckets per track. Independent of pixel width; the canvas downsamples. */
export const WAVEFORM_BUCKETS = 1000;
/**
 * Memory guard: a full decode holds the whole track as float PCM. ~10 minutes
 * of 44.1 kHz stereo is ≈ 200 MB, so longer tracks fall back to the ruler.
 */
export const WAVEFORM_MAX_SECONDS = 600;
const WAVEFORM_TIMEOUT_MS = 15_000;

export type Peaks = {
  min: Float32Array;
  max: Float32Array;
};

const cache = new Map<string, Peaks>();

function getDecoder(): OfflineAudioContext | null {
  const Ctor =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (Ctor == null) return null;
  return new Ctor(1, 1, 44_100);
}

async function computePeaks(
  url: string,
  signal: AbortSignal,
): Promise<Peaks | null> {
  const decoder = getDecoder();
  if (decoder == null) return null;

  const started = performance.now();
  const response = await fetch(url, { signal });
  const arrayBuffer = await response.arrayBuffer();
  if (signal.aborted) return null;

  const audio = await decoder.decodeAudioData(arrayBuffer);
  if (signal.aborted) return null;

  const channel = audio.getChannelData(0);
  const buckets = WAVEFORM_BUCKETS;
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  const perBucket = channel.length / buckets;

  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor(bucket * perBucket);
    const end = Math.min(channel.length, Math.floor((bucket + 1) * perBucket));
    let lo = 0;
    let hi = 0;
    for (let i = start; i < end; i += 1) {
      const value = channel[i];
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    }
    min[bucket] = lo;
    max[bucket] = hi;
  }

  info(
    `[waveform] decoded ${buckets} buckets in ${Math.round(performance.now() - started)}ms (${audio.duration.toFixed(1)}s)`,
  );
  return { min, max };
}

export function useWaveform(track: Track): Peaks | null {
  const [peaks, setPeaks] = useState<Peaks | null>(
    () => cache.get(track.id) ?? null,
  );

  useEffect(() => {
    const cached = cache.get(track.id);
    if (cached != null) {
      setPeaks(cached);
      return;
    }

    setPeaks(null);

    // Fall back to the ruler for very long tracks before spending the memory.
    if (!Number.isFinite(track.duration) || track.duration > WAVEFORM_MAX_SECONDS) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WAVEFORM_TIMEOUT_MS);

    computePeaks(convertFileSrc(track.path), controller.signal)
      .then((result) => {
        if (result != null && !controller.signal.aborted) {
          cache.set(track.id, result);
          setPeaks(result);
        }
      })
      .catch(() => {
        // Mandatory fallback: any failure leaves the linear ruler in place.
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [track.id, track.path, track.duration]);

  return peaks;
}
