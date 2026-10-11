import { runInNewContext } from 'node:vm';

import { describe, expect, test } from 'vitest';

import {
  clampPitchSemitones,
  DEFAULT_PITCH_QUALITY,
  DEFAULT_PITCH_SEMITONES,
  isPitchShiftEngaged,
  normalizePitchQuality,
  normalizePitchShift,
  PITCH_QUALITIES,
  PITCH_QUALITY_CONFIGS,
  PITCH_SHIFT_MAX_SEMITONES,
  PITCH_SHIFT_MIN_SEMITONES,
  PITCH_SHIFT_WORKLET_SOURCE,
  semitonesToRatio,
  type PitchQuality,
} from './pitch-shift';

/*
 * Granular overlap-add pitch shifter: pitch moves without changing duration.
 * The worklet source runs inside `node:vm` (same harness as dattorro.test.ts)
 * so the DSP is exercised in the plain `unit` project with no browser. Shift
 * is measured spectrally: a synthetic sine is processed block-by-block and the
 * output's dominant frequency is found with a Hann-windowed DFT magnitude scan.
 */

const SAMPLE_RATE = 48000;
const INPUT_FREQ = 440;
const PLUS_12_EXPECTED = INPUT_FREQ * 2;
const MINUS_12_EXPECTED = INPUT_FREQ / 2;
const WARMUP_SAMPLES = 12000;
const PLUS_12_TOLERANCE_HZ = 10;
const MINUS_12_TOLERANCE_HZ = 5;
const PASS_THROUGH_TOLERANCE = 1e-6;

describe('pitch semitone helpers', () => {
  test('range constants bound exactly one octave', () => {
    expect(PITCH_SHIFT_MIN_SEMITONES).toBe(-12);
    expect(PITCH_SHIFT_MAX_SEMITONES).toBe(12);
    expect(DEFAULT_PITCH_SEMITONES).toBe(0);
    expect(DEFAULT_PITCH_QUALITY).toBe('medium');
  });

  test('semitonesToRatio follows 2 ** (n / 12)', () => {
    expect(semitonesToRatio(0)).toBe(1);
    expect(semitonesToRatio(12)).toBeCloseTo(2, 10);
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5, 10);
    expect(semitonesToRatio(NaN)).toBe(1);
  });

  test('clampPitchSemitones clamps and rounds to two decimals', () => {
    expect(clampPitchSemitones(0)).toBe(0);
    expect(clampPitchSemitones(100)).toBe(PITCH_SHIFT_MAX_SEMITONES);
    expect(clampPitchSemitones(-100)).toBe(PITCH_SHIFT_MIN_SEMITONES);
    expect(clampPitchSemitones(5.555)).toBe(5.56);
    expect(clampPitchSemitones(5.554)).toBe(5.55);
    expect(clampPitchSemitones(NaN)).toBe(0);
  });

  test('normalizePitchQuality falls back to the default tier', () => {
    expect(normalizePitchQuality('low')).toBe('low');
    expect(normalizePitchQuality('high')).toBe('high');
    expect(normalizePitchQuality('ultra')).toBe(DEFAULT_PITCH_QUALITY);
    expect(normalizePitchQuality(undefined)).toBe(DEFAULT_PITCH_QUALITY);
  });

  test('normalizePitchShift fills defaults and drops unknown keys', () => {
    expect(normalizePitchShift(undefined)).toStrictEqual({
      semitones: 0,
      quality: 'medium',
    });
    expect(normalizePitchShift({})).toStrictEqual({
      semitones: 0,
      quality: 'medium',
    });
    expect(
      Object.keys(
        normalizePitchShift({ semitones: 0, quality: 'low', extra: 1 }),
      ).sort(),
    ).toStrictEqual(['quality', 'semitones']);
    expect(normalizePitchShift({ semitones: 48 }).semitones).toBe(12);
    expect(normalizePitchShift({ quality: 'nope' }).quality).toBe('medium');
  });

  test('isPitchShiftEngaged gates on active and non-zero shift', () => {
    expect(isPitchShiftEngaged({ active: false, semitones: 12 })).toBe(false);
    expect(isPitchShiftEngaged({ active: true, semitones: 0 })).toBe(false);
    expect(isPitchShiftEngaged({ active: true, semitones: 12 })).toBe(true);
    expect(isPitchShiftEngaged({ active: true, semitones: -0.01 })).toBe(true);
  });
});

describe('PITCH_SHIFT_WORKLET_SOURCE', () => {
  test('is a non-empty string that registers the processor', () => {
    expect(typeof PITCH_SHIFT_WORKLET_SOURCE).toBe('string');
    expect(PITCH_SHIFT_WORKLET_SOURCE).toContain(
      "registerProcessor('slowburn-pitch-shift'",
    );
    expect(PITCH_SHIFT_WORKLET_SOURCE).toContain(
      'extends AudioWorkletProcessor',
    );
  });

  test('implements the setParams / reset / dispose protocol', () => {
    expect(PITCH_SHIFT_WORKLET_SOURCE).toContain("type === 'setParams'");
    expect(PITCH_SHIFT_WORKLET_SOURCE).toContain("type === 'reset'");
    expect(PITCH_SHIFT_WORKLET_SOURCE).toContain("type === 'dispose'");
    expect(PITCH_SHIFT_WORKLET_SOURCE).toContain('this.disposed');
  });

  test('pass-through at ratio 1 reproduces the input with no NaN/Infinity', () => {
    const processor = createProcessor();
    const input = makeSine(INPUT_FREQ, SAMPLE_RATE, 4096);
    const output = runProcessor(processor, input);

    expect(output.length).toBe(input.length);
    expect(output.every((value) => Number.isFinite(value))).toBe(true);
    let peak = 0;
    for (let i = 0; i < output.length; i += 1) {
      peak = Math.max(peak, Math.abs(output[i]! - input[i]!));
    }
    expect(peak).toBeLessThan(PASS_THROUGH_TOLERANCE);
  });

  test('+12 semitones shifts 440 Hz to near 880 Hz (spectral)', () => {
    const processor = createProcessor();
    setParams(processor, { semitones: 12 });
    const input = makeSine(INPUT_FREQ, SAMPLE_RATE, SAMPLE_RATE);
    const output = runProcessor(processor, input);
    const { freq, mag } = measurePeak(output, 600, 1150, 2);

    expect(mag).toBeGreaterThan(0);
    expect(freq).toBeGreaterThanOrEqual(600);
    expect(Math.abs(freq - PLUS_12_EXPECTED)).toBeLessThanOrEqual(
      PLUS_12_TOLERANCE_HZ,
    );
  });

  test('-12 semitones shifts 440 Hz to near 220 Hz (spectral)', () => {
    const processor = createProcessor();
    setParams(processor, { semitones: -12 });
    const input = makeSine(INPUT_FREQ, SAMPLE_RATE, SAMPLE_RATE);
    const output = runProcessor(processor, input);
    const { freq, mag } = measurePeak(output, 100, 600, 2);

    expect(mag).toBeGreaterThan(0);
    expect(Math.abs(freq - MINUS_12_EXPECTED)).toBeLessThanOrEqual(
      MINUS_12_TOLERANCE_HZ,
    );
  });

  test('duration is preserved: output length equals input length', () => {
    const processor = createProcessor();
    setParams(processor, { semitones: 7 });
    const input = makeSine(INPUT_FREQ, SAMPLE_RATE, 8192);
    const output = runProcessor(processor, input);
    expect(output.length).toBe(input.length);
  });

  test('quality tiers change the grain config and all still shift at +12', () => {
    const seen = new Map<PitchQuality, string>();
    for (const quality of PITCH_QUALITIES) {
      const processor = createProcessor();
      setParams(processor, { semitones: 12, quality });
      const config = PITCH_QUALITY_CONFIGS[quality]!;
      expect(processor.grainLen).toBe(config.grainSamples);
      expect(processor.xfadeLen).toBe(config.xfadeSamples);
      expect(processor.searchLen).toBe(config.searchSamples);
      seen.set(
        quality,
        `${processor.grainLen}x${processor.xfadeLen}x${processor.searchLen}`,
      );

      const input = makeSine(INPUT_FREQ, SAMPLE_RATE, SAMPLE_RATE);
      const output = runProcessor(processor, input);
      expect(output.every((value) => Number.isFinite(value))).toBe(true);
      const { freq } = measurePeak(output, 600, 1150, 2);
      expect(Math.abs(freq - PLUS_12_EXPECTED)).toBeLessThanOrEqual(
        PLUS_12_TOLERANCE_HZ,
      );
    }
    // The tier actually changes the configuration: every tier is distinct.
    expect(new Set(seen.values()).size).toBe(PITCH_QUALITIES.length);
  });

  test('out-of-range semitones clamp instead of producing NaN', () => {
    const processor = createProcessor();
    setParams(processor, { semitones: 48 });
    expect(processor.semitones).toBe(PITCH_SHIFT_MAX_SEMITONES);
    expect(Number.isFinite(processor.ratio)).toBe(true);

    const input = makeSine(INPUT_FREQ, SAMPLE_RATE, 4096);
    const output = runProcessor(processor, input);
    expect(output.every((value) => Number.isFinite(value))).toBe(true);
    expect(output.some((value) => Number.isNaN(value))).toBe(false);

    setParams(processor, { semitones: -48 });
    expect(processor.semitones).toBe(PITCH_SHIFT_MIN_SEMITONES);
    const outputLow = runProcessor(processor, input);
    expect(outputLow.every((value) => Number.isFinite(value))).toBe(true);
  });

  test('reset clears the delay line and dispose retires the processor', () => {
    const processor = createProcessor();
    setParams(processor, { semitones: 12 });
    const input = makeSine(INPUT_FREQ, SAMPLE_RATE, 1024);
    runProcessor(processor, input);
    expect(processor.writePos).toBeGreaterThan(0);

    processor.port.onmessage?.({ data: { type: 'reset' } });
    expect(processor.writePos).toBe(0);

    const out = new Float32Array(128);
    const liveInputs: Float32Array[][] = [[new Float32Array(128).fill(0.25)]];
    expect(processor.process(liveInputs, [[out]])).toBe(true);

    processor.port.onmessage?.({ data: { type: 'dispose' } });
    expect(processor.process(liveInputs, [[out]])).toBe(false);
    processor.port.onmessage?.({
      data: { type: 'setParams', params: { semitones: 0 } },
    });
    expect(processor.semitones).toBe(12);
  });
});

function setParams(
  processor: TestProcessor,
  params: { semitones?: number; quality?: PitchQuality },
): void {
  processor.port.onmessage?.({ data: { type: 'setParams', params } });
}

function makeSine(freq: number, sr: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let n = 0; n < length; n += 1) {
    out[n] = 0.5 * Math.sin((2 * Math.PI * freq * n) / sr);
  }
  return out;
}

function runProcessor(
  processor: TestProcessor,
  input: Float32Array,
  blockSize = 128,
): Float32Array {
  const output = new Float32Array(input.length);
  for (let offset = 0; offset < input.length; offset += blockSize) {
    const size = Math.min(blockSize, input.length - offset);
    const inBlock = new Float32Array(size);
    inBlock.set(input.subarray(offset, offset + size));
    const outBlock = new Float32Array(size);
    processor.process([[inBlock]], [[outBlock]]);
    output.set(outBlock, offset);
  }
  return output;
}

/**
 * Hann-windowed DFT magnitude scan over `[minFreq, maxFreq]` after discarding
 * the warm-up transient. Returns the peak bin and its magnitude.
 */
function measurePeak(
  output: Float32Array,
  minFreq: number,
  maxFreq: number,
  step: number,
): { freq: number; mag: number } {
  const segment = output.subarray(WARMUP_SAMPLES);
  const count = segment.length;
  let bestFreq = minFreq;
  let bestMag = -1;
  for (let freq = minFreq; freq <= maxFreq; freq += step) {
    const omega = (2 * Math.PI * freq) / SAMPLE_RATE;
    let real = 0;
    let imag = 0;
    for (let n = 0; n < count; n += 1) {
      const window = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (count - 1)));
      const sample = segment[n]! * window;
      real += sample * Math.cos(omega * n);
      imag += sample * Math.sin(omega * n);
    }
    const mag = Math.sqrt(real * real + imag * imag);
    if (mag > bestMag) {
      bestMag = mag;
      bestFreq = freq;
    }
  }
  return { freq: bestFreq, mag: bestMag };
}

function createProcessor(): TestProcessor {
  const registered: Array<new () => TestProcessor> = [];
  runInNewContext(PITCH_SHIFT_WORKLET_SOURCE, {
    sampleRate: SAMPLE_RATE,
    AudioWorkletProcessor: class {
      port = {
        onmessage: null as ((event: { data: unknown }) => void) | null,
        postMessage(): void {},
      };
    },
    registerProcessor: (_name: string, ctor: new () => TestProcessor) => {
      registered.push(ctor);
    },
  });

  const Processor = registered[0];
  expect(Processor).not.toBeUndefined();
  const processor = new Processor!();
  expect(processor.port.onmessage).toBeTypeOf('function');
  return processor;
}

interface ProcessorLike {
  port: {
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage: (message: unknown) => void;
  };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}

type TestProcessor = ProcessorLike & {
  semitones: number;
  ratio: number;
  quality: PitchQuality;
  grainLen: number;
  xfadeLen: number;
  searchLen: number;
  writePos: number;
};
