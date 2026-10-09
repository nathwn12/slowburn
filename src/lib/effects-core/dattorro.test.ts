import { runInNewContext } from 'node:vm';

import { describe, expect, test } from 'vitest';

import { computeDattorroParams, DATTORRO_WORKLET_SOURCE } from './dattorro';

/*
 * The reverb imitates pear-desktop's slowed-reverb worklet as closely as
 * possible: the tank DSP matches sample-for-sample, `wetGain` is written
 * directly (no ramp), output is silent with an early return while it is 0
 * (skipping the tank), and a `dispose` message retires the processor.
 */

describe('computeDattorroParams', () => {
  test('zero intensity is the parked silent parameter set', () => {
    expect(computeDattorroParams(0)).toStrictEqual({
      wetGain: 0,
      decay: 0,
      damping: 1,
      preDelay: 0,
    });
  });

  test('clamps below zero to the silent set', () => {
    expect(computeDattorroParams(-1)).toStrictEqual(computeDattorroParams(0));
  });

  test('clamps above one to full intensity', () => {
    expect(computeDattorroParams(2)).toStrictEqual(computeDattorroParams(1));
  });

  test('full intensity matches the source constants', () => {
    const params = computeDattorroParams(1);
    expect(params.preDelay).toBeCloseTo(0.54, 10);
    expect(params.preFilter).toBeCloseTo(0.8, 10);
    expect(params.inputDiff1).toBe(0.75);
    expect(params.inputDiff2).toBe(0.625);
    expect(params.decayDiff1).toBeCloseTo(0.7, 10);
    expect(params.decay).toBeCloseTo(0.58, 10);
    expect(params.damping).toBeCloseTo(0.78, 10);
    expect(params.wetGain).toBeCloseTo(0.42, 10);
  });

  test('wet gain rises monotonically with intensity', () => {
    const values = [0.1, 0.25, 0.5, 0.75, 1].map(
      (i) => computeDattorroParams(i).wetGain,
    );
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]!).toBeGreaterThan(values[index - 1]!);
    }
  });
});

describe('DATTORRO_WORKLET_SOURCE', () => {
  test('is a non-empty string that registers the processor', () => {
    expect(typeof DATTORRO_WORKLET_SOURCE).toBe('string');
    expect(DATTORRO_WORKLET_SOURCE).toContain(
      "registerProcessor('dattorro-reverb'",
    );
    expect(DATTORRO_WORKLET_SOURCE).toContain('extends AudioWorkletProcessor');
  });

  test('writes wetGain directly with no ramp state', () => {
    expect(DATTORRO_WORKLET_SOURCE).toContain('this.wetGain = p.wetGain');
    expect(DATTORRO_WORKLET_SOURCE).not.toContain('wetTarget');
    expect(DATTORRO_WORKLET_SOURCE).not.toContain('wetAlpha');
  });

  test('early-returns silence and supports dispose', () => {
    expect(DATTORRO_WORKLET_SOURCE).toContain('if (this.wetGain === 0)');
    expect(DATTORRO_WORKLET_SOURCE).toContain('outL.fill(0)');
    expect(DATTORRO_WORKLET_SOURCE).toContain("type === 'dispose'");
    expect(DATTORRO_WORKLET_SOURCE).toContain('this.disposed');
  });

  test('runs: silent at wet gain 0, bounded and finite at full gain', () => {
    const processor = createProcessor();

    const block = 128;
    const inputL = new Float32Array(block).fill(0.5);
    const inputR = new Float32Array(block).fill(-0.5);
    const outL = new Float32Array(block);
    const outR = new Float32Array(block);

    // Wet gain 0: the output is silent and the tank is skipped (t parked).
    processor.process([[inputL], [inputR]], [[outL], [outR]]);
    expect(Array.from(outL).every((value) => value === 0)).toBe(true);
    expect(Array.from(outR).every((value) => value === 0)).toBe(true);
    expect(processor.t).toBe(0);

    processor.port.onmessage?.({
      data: { type: 'setParams', params: { wetGain: 0.42 } },
    });
    // Direct write: no ramp state, the gain takes effect immediately.
    expect(processor.wetGain).toBe(0.42);
    for (let i = 0; i < 200; i += 1) {
      processor.process([[inputL], [inputR]], [[outL], [outR]]);
    }
    const produced = [...outL, ...outR];
    expect(produced.some((value) => value !== 0)).toBe(true);
    expect(produced.every((value) => Number.isFinite(value))).toBe(true);
    expect(produced.every((value) => Math.abs(value) <= 1)).toBe(true);
    expect(processor.t).toBeGreaterThan(0);
  });

  test('dispose retires the processor and ignores later messages', () => {
    const processor = createProcessor();
    const outL = new Float32Array(128);
    const outR = new Float32Array(128);
    const inputs = [[new Float32Array(128).fill(0.25)]];
    const outputs = [[outL, outR]];

    // Positive control: live before dispose.
    expect(processor.process(inputs, outputs)).toBe(true);

    processor.port.onmessage?.({ data: { type: 'dispose' } });
    expect(processor.process(inputs, outputs)).toBe(false);

    processor.port.onmessage?.({
      data: { type: 'setParams', params: { wetGain: 0.42 } },
    });
    expect(processor.wetGain).toBe(0);
    expect(processor.process(inputs, outputs)).toBe(false);
  });
});

function createProcessor(): ProcessorLike & { t: number; wetGain: number } {
  const registered: Array<
    new () => ProcessorLike & { t: number; wetGain: number }
  > = [];
  runInNewContext(DATTORRO_WORKLET_SOURCE, {
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      port = {
        onmessage: null as ((event: { data: unknown }) => void) | null,
        postMessage(): void {},
      };
    },
    registerProcessor: (
      _name: string,
      ctor: new () => ProcessorLike & { t: number; wetGain: number },
    ) => {
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
