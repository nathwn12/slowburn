/**
 * Reusable audio measurement apparatus (observation boundary).
 *
 * Positive-control idea: before this harness is ever used to judge a DSP
 * feature, it must prove it can see a KNOWN signal. The control renders a
 * pure sine of a known frequency through a pass-through AudioWorkletNode and
 * checks the measured spectral peak lands on the injected tone. A silent
 * apparatus (broken renderer) or a deaf one (broken analyser) both fail the
 * control, so a later negative result (no peak where one is expected) can be
 * read as evidence about the feature under test rather than about this rig.
 *
 * Fixed operating point (committed tolerances live here):
 * - Sample rate: 44_100 Hz (OfflineAudioContext render rate).
 * - Buffer size: 44_100 frames = 1 second of mono audio.
 * - Peak tolerance: measured peak must land within 2 Hz of the injected tone
 *   on a 1 Hz scan grid.
 * - Selectivity gate: on-tone DFT magnitude must be at least 10x the
 *   magnitude far off-tone (440 Hz vs 300 Hz), proving the peak is a tone
 *   and not broadband leakage.
 * - Determinism gate: two renders of the same tone must have identical
 *   length, per-sample max absolute difference below 1e-6, and RMS above 0.1
 *   (a pure sine has RMS ~0.707, so 0.1 proves the buffer is non-empty).
 *
 * The worklet below is intentionally self-contained (inline pass-through
 * processor source registered via a Blob URL): it must stay independent of
 * the product reverb worklet (`src/lib/effects.ts`) and the player, so the
 * apparatus can validate the harness even when product DSP is broken.
 * Dependency-free: no imports, no packages.
 */

/** Fixed render sample rate in Hz. */
const SAMPLE_RATE = 44_100;

/** Rendered buffer length in seconds (1 s mono => 44_100 frames). */
const DURATION_SECONDS = 1;

/** Name under which the inline pass-through processor is registered. */
const WORKLET_NAME = 'audio-measure-passthrough';

/**
 * Inline pass-through AudioWorkletProcessor source. Copies each input
 * channel to the matching output channel (silence when unconnected), using
 * the same Blob-URL `addModule` registration mechanism as the product
 * reverb worklet. Kept as a string so no product worklet file is imported.
 */
const WORKLET_SOURCE = `class AudioMeasurePassthrough extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    for (let ch = 0; ch < output.length; ch++) {
      const src = input[ch] ?? input[0];
      if (src) {
        output[ch].set(src);
      } else {
        output[ch].fill(0);
      }
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', AudioMeasurePassthrough);
`;

/** Result of a peak-frequency scan: peak bin in Hz and its magnitude. */
export interface PeakMeasurement {
  peak: number;
  peakMagnitude: number;
}

function makeWorkletUrl(): string {
  return URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: 'text/javascript' }),
  );
}

/**
 * Render a pure sine tone of `freq` Hz through a pass-through
 * AudioWorkletNode into a 1 s mono OfflineAudioContext at 44_100 Hz and
 * return the rendered buffer. Chain: OscillatorNode (sine) -> AudioWorkletNode
 * (pass-through, loaded from a Blob-URL module) -> destination.
 */
export async function renderToneThroughWorklet(
  freq: number,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(
    1,
    SAMPLE_RATE * DURATION_SECONDS,
    SAMPLE_RATE,
  );
  const url = makeWorkletUrl();
  try {
    await ctx.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const node = new AudioWorkletNode(ctx, WORKLET_NAME);
  osc.connect(node);
  node.connect(ctx.destination);
  osc.start(0);
  return ctx.startRendering();
}

/**
 * Naive dot-product DFT magnitude of `data` at `freq` Hz: correlates the
 * samples against cos/sin at that frequency and returns the magnitude.
 * `stride` thins the samples (default 2) to keep wide scans cheap; cost is
 * roughly (samples / stride) trig pairs per call.
 */
export function dftMagnitude(
  data: Float32Array,
  sampleRate: number,
  freq: number,
  stride = 2,
): number {
  let real = 0;
  let imag = 0;
  const omega = (2 * Math.PI * freq) / sampleRate;
  for (let i = 0; i < data.length; i += stride) {
    const angle = omega * i;
    const s = data[i] ?? 0;
    real += s * Math.cos(angle);
    imag += s * Math.sin(angle);
  }
  return Math.sqrt(real * real + imag * imag);
}

/**
 * Scan a 1 Hz-stepped grid from `fromHz` to `toHz` (inclusive) and return the
 * frequency bin with the largest DFT magnitude plus that magnitude. Callers
 * compare the returned peak against the injected tone with the committed
 * 2 Hz tolerance documented above.
 */
export function measurePeakFrequency(
  data: Float32Array,
  sampleRate: number,
  fromHz: number,
  toHz: number,
  stepHz: number,
): PeakMeasurement {
  let peak = fromHz;
  let peakMagnitude = Number.NEGATIVE_INFINITY;
  for (let f = fromHz; f <= toHz + 1e-9; f += stepHz) {
    const mag = dftMagnitude(data, sampleRate, f);
    if (mag > peakMagnitude) {
      peakMagnitude = mag;
      peak = f;
    }
  }
  return { peak, peakMagnitude };
}
