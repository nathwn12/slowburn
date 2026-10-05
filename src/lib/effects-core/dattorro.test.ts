import { describe, expect, test } from 'vitest';

import {
  computeDattorroParams,
  computePostParams,
  DATTORRO_WORKLET_SOURCE,
} from './dattorro';

/*
 * Neither source ships unit tests for the reverb parameter map or the worklet
 * (Source B only tests storage-free helpers in qa/shared-unit.js). These tests
 * pin the ported values and prove the embedded worklet source actually runs
 * under Node with `AudioWorkletProcessor`/`registerProcessor`/`sampleRate`
 * stubbed. No audio device is touched.
 */

describe('computeDattorroParams', () => {
  test('zero intensity is the silent parameter set', () => {
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

describe('computePostParams', () => {
  test('forces the wet gain to zero while keeping tank params alive', () => {
    const params = computePostParams(0, 0.5);
    expect(params.wetGain).toBe(0);
    expect(params.decay).toBe(computeDattorroParams(0.5).decay);
    expect(params.damping).toBe(computeDattorroParams(0.5).damping);
  });

  test('passes a positive intensity straight through', () => {
    expect(computePostParams(0.8)).toStrictEqual(computeDattorroParams(0.8));
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

  test('runs: silent at wet gain 0, bounded and finite at full gain', () => {
    let captured: { name: string; ctor: new () => ProcessorLike } | null = null;

    class AudioWorkletProcessorStub {
      port = {
        onmessage: null as ((event: { data: unknown }) => void) | null,
        postMessage(): void {},
      };
    }

    const registerProcessor = (
      name: string,
      ctor: new () => ProcessorLike,
    ): void => {
      captured = { name, ctor };
    };

    // The worklet source is plain ES2020 and only needs these three globals.
    const factory = new Function(
      'AudioWorkletProcessor',
      'registerProcessor',
      'sampleRate',
      DATTORRO_WORKLET_SOURCE,
    );
    factory(AudioWorkletProcessorStub, registerProcessor, 48000);

    expect(captured).not.toBeNull();
    const registered = captured as unknown as {
      name: string;
      ctor: new () => ProcessorLike;
    };
    expect(registered.name).toBe('dattorro-reverb');

    const processor = new registered.ctor();
    expect(processor.port.onmessage).toBeTypeOf('function');

    const block = 128;
    const inputL = new Float32Array(block).fill(0.5);
    const inputR = new Float32Array(block).fill(-0.5);
    const outL = new Float32Array(block);
    const outR = new Float32Array(block);

    // Wet gain 0: the output is silent while the tank still runs.
    processor.process([[inputL], [inputR]], [[outL], [outR]]);
    expect(Array.from(outL).every((value) => value === 0)).toBe(true);
    expect(Array.from(outR).every((value) => value === 0)).toBe(true);

    processor.port.onmessage?.({
      data: { type: 'setParams', params: { wetGain: 0.42 } },
    });
    for (let i = 0; i < 200; i += 1) {
      processor.process([[inputL], [inputR]], [[outL], [outR]]);
    }
    const produced = [...outL, ...outR];
    expect(produced.some((value) => value !== 0)).toBe(true);
    expect(produced.every((value) => Number.isFinite(value))).toBe(true);
    expect(produced.every((value) => Math.abs(value) <= 1)).toBe(true);
  });
});

interface ProcessorLike {
  port: {
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage: (message: unknown) => void;
  };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
}
