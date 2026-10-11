/**
 * Pitch-shift spectral proof through the REAL shipped worklet in a REAL browser.
 *
 * Gap closed: the shifter DSP was already proven in plain Node via `node:vm`
 * (`src/lib/effects-core/pitch-shift.test.ts`) and the measurement apparatus
 * was proven live in Chromium (`audio-measure.test-e2e.ts`), but neither
 * proves the SHIPPED `PITCH_SHIFT_WORKLET_SOURCE` running under a real
 * `AudioWorkletProcessor` in a real browser. This spec renders a known 440 Hz
 * sine through the real worklet (loaded via Blob URL, driven with `setParams`
 * through the node port) inside `OfflineAudioContext` and measures the output
 * spectrum with the shared apparatus (`./audio-measure`).
 *
 * Reuse, not reinvention: the worklet source string, processor name, and
 * quality tiers come from `../lib/effects-core/pitch-shift`; the DFT peak
 * scanner comes from `./audio-measure`. The only local helper is
 * `renderToneThroughPitchShift`, the pitch-worklet analogue of the shared
 * `renderToneThroughWorklet` pass-through renderer. Nothing shared is
 * modified.
 *
 * Transient policy: the first TRANSIENT_DISCARD samples of every render are
 * discarded before measuring. This mirrors the prior `node:vm` proof (which
 * discarded the first 12000 samples as the delay-line fill transient) and
 * additionally covers `setParams` port-message latency: params are posted
 * before rendering starts plus a short yield, so any pre-param blocks fall
 * inside the discarded region. Stated here so a tight peak is read as shifter
 * accuracy, not luck.
 *
 * Tolerances: the pass-through control keeps the committed 2 Hz gate from
 * `audio-measure.ts`. Shifted cases mirror the committed `node:vm` gates
 * (+12 within 10 Hz, -12 within 5 Hz); +7 and the tier checks use 10 Hz,
 * which still discriminates the naive-ratio failure mode (the first prototype
 * measured ~3.2% sharp, i.e. ~21 Hz off at +7).
 */
import { describe, expect, test } from 'vite-plus/test';

import {
  PITCH_QUALITIES,
  PITCH_SHIFTER_PROCESSOR_NAME,
  PITCH_SHIFT_WORKLET_SOURCE,
  type PitchQuality,
} from '../lib/effects-core/pitch-shift';
import { measurePeakFrequency } from './audio-measure';

/** Render sample rate in Hz (matches the shared apparatus operating point). */
const SAMPLE_RATE = 44_100;
/** Rendered frames: 1 s mono, so the shift must preserve exactly this. */
const FRAMES = SAMPLE_RATE;
/** Injected sine frequency in Hz. */
const INPUT_FREQ = 440;
/**
 * Samples discarded before measuring: delay-line fill plus any pre-param
 * blocks (see header). Mirrors the 12000-sample `node:vm` warm-up.
 */
const TRANSIENT_DISCARD = 12_000;

/** Committed control gate: pass-through peak within 2 Hz of the tone. */
const CONTROL_TOLERANCE_HZ = 2;
/** Octave-up gate (mirrors the `node:vm` +12 tolerance). */
const OCTAVE_UP_TOLERANCE_HZ = 10;
/** Octave-down gate (mirrors the `node:vm` -12 tolerance). */
const OCTAVE_DOWN_TOLERANCE_HZ = 5;
/** Perfect-fifth (+7) gate: 10 Hz still catches the ~21 Hz naive error. */
const FIFTH_TOLERANCE_HZ = 10;
/** Per-tier +12 gate, same bar as the single +12 case. */
const TIER_TOLERANCE_HZ = 10;
/** Determinism gate from the shared apparatus: max per-sample diff. */
const DETERMINISM_GATE = 1e-6;

const PLUS_12_EXPECTED = INPUT_FREQ * 2;
const MINUS_12_EXPECTED = INPUT_FREQ / 2;
const PLUS_7_EXPECTED = INPUT_FREQ * 2 ** (7 / 12);

/**
 * Pitch-worklet analogue of the shared `renderToneThroughWorklet`: renders a
 * pure sine of `inputFreq` Hz through the REAL shipped pitch-shift worklet
 * with the given shift/quality into a 1 s mono buffer. Chain:
 * OscillatorNode (sine) -> AudioWorkletNode (shipped pitch worklet, params
 * posted via `setParams` before rendering) -> destination.
 */
async function renderToneThroughPitchShift(
  inputFreq: number,
  semitones: number,
  quality: PitchQuality,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, FRAMES, SAMPLE_RATE);
  const url = URL.createObjectURL(
    new Blob([PITCH_SHIFT_WORKLET_SOURCE], { type: 'text/javascript' }),
  );
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(ctx, PITCH_SHIFTER_PROCESSOR_NAME);
  node.port.postMessage({ type: 'setParams', params: { semitones, quality } });
  // Let the worklet thread apply params before block 0; any residual
  // pre-param output falls inside the discarded transient (see header).
  await new Promise((resolve) => setTimeout(resolve, 50));
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = inputFreq;
  osc.connect(node);
  node.connect(ctx.destination);
  osc.start(0);
  return ctx.startRendering();
}

/** Spectral peak of a rendered buffer after discarding the fill transient. */
function peakAfterTransient(
  buf: AudioBuffer,
  fromHz: number,
  toHz: number,
): { peak: number; peakMagnitude: number } {
  const data = buf.getChannelData(0).subarray(TRANSIENT_DISCARD);
  return measurePeakFrequency(data, buf.sampleRate, fromHz, toHz, 1);
}

function countNonFinite(data: Float32Array): number {
  let bad = 0;
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(data[i] ?? 0)) bad += 1;
  }
  return bad;
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = Math.abs((a[i] ?? 0) - (b[i] ?? 0));
    if (diff > max) max = diff;
  }
  return max;
}

describe('pitch-shift spectral proof (real worklet, real browser)', () => {
  test(
    'control: semitones = 0 passes 440 Hz through within 2 Hz',
    { timeout: 30_000 },
    async () => {
      const buf = await renderToneThroughPitchShift(INPUT_FREQ, 0, 'medium');
      expect(buf.length).toBe(FRAMES);
      const { peak, peakMagnitude } = peakAfterTransient(buf, 430, 450);
      const error = Math.abs(peak - INPUT_FREQ);
      console.log(
        `[pitch-shift-spectral] control 0 st: peak=${peak} expected=${INPUT_FREQ} error=${error} tolerance=${CONTROL_TOLERANCE_HZ} magnitude=${peakMagnitude}`,
      );
      expect(peakMagnitude).toBeGreaterThan(0);
      expect(error).toBeLessThanOrEqual(CONTROL_TOLERANCE_HZ);
    },
  );

  test(
    'plus 12 semitones shifts 440 Hz to 880 Hz',
    { timeout: 30_000 },
    async () => {
      const buf = await renderToneThroughPitchShift(INPUT_FREQ, 12, 'medium');
      expect(buf.length).toBe(FRAMES);
      const { peak, peakMagnitude } = peakAfterTransient(buf, 850, 910);
      const error = Math.abs(peak - PLUS_12_EXPECTED);
      console.log(
        `[pitch-shift-spectral] +12 st: peak=${peak} expected=${PLUS_12_EXPECTED} error=${error} tolerance=${OCTAVE_UP_TOLERANCE_HZ} magnitude=${peakMagnitude}`,
      );
      expect(peakMagnitude).toBeGreaterThan(0);
      expect(error).toBeLessThanOrEqual(OCTAVE_UP_TOLERANCE_HZ);
    },
  );

  test(
    'minus 12 semitones shifts 440 Hz to 220 Hz',
    { timeout: 30_000 },
    async () => {
      const buf = await renderToneThroughPitchShift(INPUT_FREQ, -12, 'medium');
      expect(buf.length).toBe(FRAMES);
      const { peak, peakMagnitude } = peakAfterTransient(buf, 190, 250);
      const error = Math.abs(peak - MINUS_12_EXPECTED);
      console.log(
        `[pitch-shift-spectral] -12 st: peak=${peak} expected=${MINUS_12_EXPECTED} error=${error} tolerance=${OCTAVE_DOWN_TOLERANCE_HZ} magnitude=${peakMagnitude}`,
      );
      expect(peakMagnitude).toBeGreaterThan(0);
      expect(error).toBeLessThanOrEqual(OCTAVE_DOWN_TOLERANCE_HZ);
    },
  );

  test(
    'plus 7 semitones shifts 440 Hz to ~659.26 Hz (non-octave)',
    { timeout: 30_000 },
    async () => {
      const buf = await renderToneThroughPitchShift(INPUT_FREQ, 7, 'medium');
      expect(buf.length).toBe(FRAMES);
      const { peak, peakMagnitude } = peakAfterTransient(buf, 630, 690);
      const error = Math.abs(peak - PLUS_7_EXPECTED);
      console.log(
        `[pitch-shift-spectral] +7 st: peak=${peak} expected=${PLUS_7_EXPECTED} error=${error} tolerance=${FIFTH_TOLERANCE_HZ} magnitude=${peakMagnitude}`,
      );
      expect(peakMagnitude).toBeGreaterThan(0);
      expect(error).toBeLessThanOrEqual(FIFTH_TOLERANCE_HZ);
    },
  );

  test(
    'duration is preserved for every shift (0, +12, -12, +7)',
    { timeout: 60_000 },
    async () => {
      for (const semitones of [0, 12, -12, 7]) {
        const buf = await renderToneThroughPitchShift(
          INPUT_FREQ,
          semitones,
          'medium',
        );
        console.log(
          `[pitch-shift-spectral] duration: semitones=${semitones} length=${buf.length} expected=${FRAMES}`,
        );
        expect(buf.length).toBe(FRAMES);
      }
    },
  );

  test(
    'all quality tiers shift +12 to 880 Hz with finite output',
    { timeout: 60_000 },
    async () => {
      for (const quality of PITCH_QUALITIES) {
        const buf = await renderToneThroughPitchShift(INPUT_FREQ, 12, quality);
        expect(buf.length).toBe(FRAMES);
        const data = buf.getChannelData(0);
        const bad = countNonFinite(data);
        const { peak, peakMagnitude } = peakAfterTransient(buf, 850, 910);
        const error = Math.abs(peak - PLUS_12_EXPECTED);
        console.log(
          `[pitch-shift-spectral] tier ${quality}: peak=${peak} expected=${PLUS_12_EXPECTED} error=${error} tolerance=${TIER_TOLERANCE_HZ} magnitude=${peakMagnitude} nonFinite=${bad}`,
        );
        expect(bad).toBe(0);
        expect(peakMagnitude).toBeGreaterThan(0);
        expect(error).toBeLessThanOrEqual(TIER_TOLERANCE_HZ);
      }
    },
  );

  test(
    'determinism: same +12 request rendered twice is sample-identical',
    { timeout: 60_000 },
    async () => {
      const a = await renderToneThroughPitchShift(INPUT_FREQ, 12, 'medium');
      const b = await renderToneThroughPitchShift(INPUT_FREQ, 12, 'medium');
      expect(a.length).toBe(b.length);
      expect(a.length).toBe(FRAMES);
      const diff = maxAbsDiff(a.getChannelData(0), b.getChannelData(0));
      console.log(
        `[pitch-shift-spectral] determinism: length=${a.length} maxAbsDiff=${diff} gate=${DETERMINISM_GATE}`,
      );
      expect(diff).toBeLessThan(DETERMINISM_GATE);
    },
  );
});
