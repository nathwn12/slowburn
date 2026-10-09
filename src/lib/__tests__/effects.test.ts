import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vite-plus/test';

import {
  DEFAULT_EFFECTS_CONFIG,
  EffectsController,
  normalizeEffectsConfig,
} from '../effects';
import { computeDattorroParams } from '../effects-core';

describe('normalizeEffectsConfig', () => {
  test('returns the neutral defaults for empty input', () => {
    expect(normalizeEffectsConfig(undefined)).toEqual(DEFAULT_EFFECTS_CONFIG);
  });

  test('clamps slow into the 0.70..1.30 range', () => {
    expect(normalizeEffectsConfig({ slow: 0.1 }).slow).toBe(0.7);
    expect(normalizeEffectsConfig({ slow: 9 }).slow).toBe(1.3);
    expect(normalizeEffectsConfig({ slow: 0.824 }).slow).toBe(0.82);
  });

  test('clamps reverb intensity into 0..1', () => {
    expect(
      normalizeEffectsConfig({ reverbIntensity: -1 }).reverbIntensity,
    ).toBe(0);
    expect(normalizeEffectsConfig({ reverbIntensity: 5 }).reverbIntensity).toBe(
      1,
    );
    expect(
      normalizeEffectsConfig({ reverbIntensity: 0.456 }).reverbIntensity,
    ).toBe(0.46);
  });

  test('non-finite values fall back to neutral', () => {
    expect(normalizeEffectsConfig({ slow: Number.NaN }).slow).toBe(1);
    // Infinity is non-finite, so clampIntensity collapses to its minimum.
    expect(
      normalizeEffectsConfig({ reverbIntensity: Number.POSITIVE_INFINITY })
        .reverbIntensity,
    ).toBe(0);
  });

  test('enable flags pass through and default to enabled', () => {
    expect(normalizeEffectsConfig({ enabled: false }).enabled).toBe(false);
    expect(normalizeEffectsConfig({ slowEnabled: false }).slowEnabled).toBe(
      false,
    );
    expect(normalizeEffectsConfig({ reverbEnabled: false }).reverbEnabled).toBe(
      false,
    );
    expect(normalizeEffectsConfig({}).enabled).toBe(true);
  });
});

/*
 * Pear-parity controller tests. Web Audio is fully stubbed (no device): fake
 * gains record `.value`, the fake worklet node records posted messages, and
 * the fake element captures `ratechange` listeners so the watchdog tolerance
 * is exercised behaviorally.
 */

interface PostedMessage {
  type: string;
  params?: { wetGain: number; decay: number; damping: number } & Record<
    string,
    unknown
  >;
}

interface FakePort {
  messages: PostedMessage[];
  postMessage: (message: PostedMessage) => void;
  close: () => void;
}

interface FakeWorkletNode {
  port: FakePort;
  connect: () => void;
  disconnect: () => void;
}

function createFakeGain(initial: number) {
  return {
    gain: {
      value: initial,
      setTargetAtTime(value: number): void {
        (this as { value: number }).value = value;
      },
    },
    connect(): void {},
    disconnect(): void {},
  };
}

function createFakeAudio() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    volume: 1,
    playbackRate: 1,
    defaultPlaybackRate: 1,
    preservesPitch: true,
    listeners,
    addEventListener(type: string, handler: () => void): void {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(handler);
    },
    removeEventListener(type: string, handler: () => void): void {
      listeners.get(type)?.delete(handler);
    },
    fire(type: string): void {
      for (const handler of listeners.get(type) ?? []) handler();
    },
  };
}

type FakeAudio = ReturnType<typeof createFakeAudio>;

let createdNodes: FakeWorkletNode[] = [];
let previousAudioContext: unknown;
let previousWorkletNode: unknown;

function installAudioMocks() {
  createdNodes = [];
  previousAudioContext = (globalThis as Record<string, unknown>).AudioContext;
  previousWorkletNode = (globalThis as Record<string, unknown>)
    .AudioWorkletNode;

  class FakeAudioContext {
    currentTime = 0;
    state = 'running';
    destination = {};
    audioWorklet = {
      addModule: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };

    createMediaElementSource(_audio: unknown) {
      return { connect(): void {}, disconnect(): void {} };
    }

    createGain() {
      return createFakeGain(0);
    }

    createAnalyser() {
      return {
        fftSize: 0,
        connect(): void {},
        getFloatTimeDomainData(): void {},
      };
    }

    async resume(): Promise<void> {}

    async close(): Promise<void> {}
  }

  class FakeAudioWorkletNode {
    port: FakePort = {
      messages: [],
      postMessage: (message: PostedMessage): void => {
        this.port.messages.push(message);
      },
      close: vi.fn<() => void>(),
    };

    constructor(_context: unknown, _name: string, _options: unknown) {
      createdNodes.push(this);
    }

    connect(): void {}

    disconnect(): void {}
  }

  (globalThis as Record<string, unknown>).AudioContext =
    FakeAudioContext as unknown as typeof AudioContext;
  (globalThis as Record<string, unknown>).AudioWorkletNode =
    FakeAudioWorkletNode as unknown as typeof AudioWorkletNode;
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
}

function restoreAudioMocks() {
  const globals = globalThis as Record<string, unknown>;
  if (previousAudioContext === undefined) delete globals.AudioContext;
  else globals.AudioContext = previousAudioContext;
  if (previousWorkletNode === undefined) delete globals.AudioWorkletNode;
  else globals.AudioWorkletNode = previousWorkletNode;
}

async function flushWorkletLoad(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function reverbNodeOf(controller: EffectsController): FakeWorkletNode | null {
  return (
    (controller as unknown as { reverbNode: FakeWorkletNode | null })
      .reverbNode ?? null
  );
}

let controllers: EffectsController[] = [];

beforeEach(() => {
  controllers = [];
  installAudioMocks();
});

afterEach(() => {
  for (const controller of controllers) {
    try {
      controller.destroy();
    } catch {
      // Best-effort teardown.
    }
  }
  controllers = [];
  restoreAudioMocks();
  vi.restoreAllMocks();
});

function createController(
  audio: FakeAudio,
  initial?: Parameters<typeof normalizeEffectsConfig>[0],
): EffectsController {
  const controller = new EffectsController(
    audio as unknown as HTMLAudioElement,
    initial,
  );
  controllers.push(controller);
  return controller;
}

describe('additive mixing (pear: dry stays at unity)', () => {
  test('dry gain stays 1 while the posted wet gain scales', async () => {
    const audio = createFakeAudio();
    const controller = createController(audio, { reverbIntensity: 0 });
    expect(controller.ensureGraph()).toBe(true);
    await flushWorkletLoad();

    const node = reverbNodeOf(controller);
    expect(node).not.toBeNull();
    node!.port.messages.length = 0;

    controller.setConfig({ reverbIntensity: 0.8 });
    expect(controller.debugGains().dry).toBe(1);
    expect(controller.debugGains().wet).toBe(1);
    const engaged = node!.port.messages.filter(
      (message) => message.type === 'setParams',
    );
    expect(engaged.length).toBeGreaterThan(0);
    const last = engaged[engaged.length - 1]!;
    expect(last.params!.wetGain).toBeCloseTo(
      computeDattorroParams(0.8).wetGain,
      10,
    );
    expect(last.params!.wetGain).toBeGreaterThan(0);

    controller.setConfig({ reverbIntensity: 0 });
    expect(controller.debugGains().dry).toBe(1);
    const parked = node!.port.messages.filter(
      (message) => message.type === 'setParams',
    );
    const parkedLast = parked[parked.length - 1]!;
    expect(parkedLast.params!.wetGain).toBe(0);
  });
});

describe('parked tank with reset on re-engage (pear controller)', () => {
  test('posts intensity-0 params at rest and resets on 0 -> nonzero', async () => {
    const audio = createFakeAudio();
    const controller = createController(audio, { reverbIntensity: 0 });
    expect(controller.ensureGraph()).toBe(true);
    await flushWorkletLoad();

    const node = reverbNodeOf(controller);
    expect(node).not.toBeNull();
    const rest = node!.port.messages.filter(
      (message) => message.type === 'setParams',
    );
    expect(rest.length).toBeGreaterThan(0);
    // Parked, not primed: the silent parameter set, not last-nonzero params.
    expect(rest[rest.length - 1]!.params).toStrictEqual(
      computeDattorroParams(0),
    );

    node!.port.messages.length = 0;
    controller.setConfig({ reverbIntensity: 0.6 });
    const types = node!.port.messages.map((message) => message.type);
    // Reset precedes the first audible params, clearing the parked tank.
    expect(types).toEqual(['reset', 'setParams']);
    const setParams = node!.port.messages.find(
      (message) => message.type === 'setParams',
    )!;
    expect(setParams.params).toStrictEqual(computeDattorroParams(0.6));

    node!.port.messages.length = 0;
    controller.setConfig({ reverbIntensity: 0.8 });
    // Nonzero -> nonzero retunes without clearing the running tail.
    expect(node!.port.messages.map((message) => message.type)).toEqual([
      'setParams',
    ]);
  });
});

describe('watchdog drift tolerance (pear: 0.001)', () => {
  test('a 0.005 drift rewrites, a 0.0005 drift does not', () => {
    const audio = createFakeAudio();
    const controller = createController(audio, { slow: 0.8 });
    expect(controller.ensureGraph()).toBe(true);
    // Engaged: the controller claims the rate.
    expect(audio.playbackRate).toBe(0.8);

    // 0.005 exceeds pear's 0.001 tolerance but is far below the old 0.02:
    // the ratechange handler must re-assert the engaged rate.
    audio.playbackRate = 0.795;
    audio.fire('ratechange');
    expect(audio.playbackRate).toBe(0.8);

    // Within tolerance: no rewrite.
    audio.playbackRate = 0.7995;
    audio.fire('ratechange');
    expect(audio.playbackRate).toBe(0.7995);
  });
});

describe('dispose hygiene (pear retireWorklet)', () => {
  test('destroy posts dispose and closes the worklet port', async () => {
    const audio = createFakeAudio();
    const controller = createController(audio, { reverbIntensity: 0.5 });
    expect(controller.ensureGraph()).toBe(true);
    await flushWorkletLoad();

    const node = reverbNodeOf(controller);
    expect(node).not.toBeNull();
    const index = controllers.indexOf(controller);
    if (index >= 0) controllers.splice(index, 1);
    controller.destroy();

    const types = node!.port.messages.map((message) => message.type);
    expect(types).toContain('dispose');
    expect(node!.port.close).toHaveBeenCalled();
  });
});
