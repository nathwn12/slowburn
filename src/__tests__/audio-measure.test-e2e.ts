/**
 * Positive control for the reusable audio measurement apparatus
 * (`./audio-measure`): proves the recorder is live before it is ever used to
 * judge a DSP feature.
 *
 * Method: render KNOWN sine tones through the helper's own inline
 * pass-through worklet and require the measured spectral peak to land on the
 * injected tone. Self-contained by design: uses only its own inline worklet
 * via the helper, and never imports the product reverb worklet or the player.
 *
 * Committed gates (tolerances documented in `audio-measure.ts`):
 * - Peak within 2 Hz of the injected tone (1 Hz scan grid).
 * - Selectivity: on-tone magnitude at least 10x far off-tone magnitude.
 * - Determinism: two renders identical length, per-sample max absolute
 *   difference below 1e-6, RMS above 0.1 (pure sine is ~0.707).
 */
import { describe, expect, test } from 'vite-plus/test';

import {
  dftMagnitude,
  measurePeakFrequency,
  renderToneThroughWorklet,
} from './audio-measure';

const TONE_FREQ = 440;
const SHIFTED_FREQ = 550;

function rms(data: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    const s = data[i] ?? 0;
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / data.length);
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (diff > max) max = diff;
  }
  return max;
}

describe('audio-measure apparatus positive control', () => {
  test(
    'positive control: 440 Hz tone measures within 2 Hz',
    { timeout: 30_000 },
    async () => {
      const buf = await renderToneThroughWorklet(TONE_FREQ);
      const data = buf.getChannelData(0);
      const { peak, peakMagnitude } = measurePeakFrequency(
        data,
        buf.sampleRate,
        430,
        450,
        1,
      );
      console.log(
        `[audio-measure] 440 Hz control: peak=${peak} magnitude=${peakMagnitude}`,
      );
      expect(Math.abs(peak - TONE_FREQ)).toBeLessThanOrEqual(2);
    },
  );

  test(
    'discrimination: 550 Hz tone measures within 2 Hz and differs from 440 Hz',
    { timeout: 30_000 },
    async () => {
      const buf440 = await renderToneThroughWorklet(TONE_FREQ);
      const data440 = buf440.getChannelData(0);
      const { peak: peak440 } = measurePeakFrequency(
        data440,
        buf440.sampleRate,
        430,
        450,
        1,
      );
      const buf550 = await renderToneThroughWorklet(SHIFTED_FREQ);
      const data550 = buf550.getChannelData(0);
      const { peak: peak550 } = measurePeakFrequency(
        data550,
        buf550.sampleRate,
        540,
        560,
        1,
      );
      console.log(
        `[audio-measure] discrimination: peak440=${peak440} peak550=${peak550}`,
      );
      expect(Math.abs(peak550 - SHIFTED_FREQ)).toBeLessThanOrEqual(2);
      expect(peak550).not.toBe(peak440);
    },
  );

  test(
    'determinism: two renders of 440 Hz are identical and non-empty',
    { timeout: 30_000 },
    async () => {
      const a = await renderToneThroughWorklet(TONE_FREQ);
      const b = await renderToneThroughWorklet(TONE_FREQ);
      expect(a.length).toBe(b.length);
      const da = a.getChannelData(0);
      const db = b.getChannelData(0);
      const level = rms(da);
      const diff = maxAbsDiff(da, db);
      console.log(
        `[audio-measure] determinism: length=${da.length} rms=${level} maxAbsDiff=${diff}`,
      );
      expect(level).toBeGreaterThan(0.1);
      expect(diff).toBeLessThan(1e-6);
    },
  );

  test(
    'selectivity: on-tone magnitude dwarfs far off-tone magnitude',
    { timeout: 30_000 },
    async () => {
      const buf = await renderToneThroughWorklet(TONE_FREQ);
      const data = buf.getChannelData(0);
      const onTone = dftMagnitude(data, buf.sampleRate, TONE_FREQ);
      const offTone = dftMagnitude(data, buf.sampleRate, 300);
      console.log(
        `[audio-measure] selectivity: onTone=${onTone} offTone=${offTone} ratio=${onTone / offTone}`,
      );
      expect(onTone / offTone).toBeGreaterThan(10);
    },
  );
});
