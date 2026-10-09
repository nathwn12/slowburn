/**
 * Effects layer for Museeks.
 *
 * One Web Audio graph is built around the player's single
 * `HTMLAudioElement`, carrying:
 *
 *  - the Dattorro plate reverb (ported worklet, loaded from a Blob URL), and
 *  - a slowed playback rate with pitch drop.
 *
 * Design mirrors pear-desktop's slowed-reverb controller
 * (`src/plugins/player-actions/slowed-reverb/`):
 *
 *  - additive mixing: the dry path stays at unity and only the wet tail is
 *    added on top;
 *  - the master gain tracks the element volume and every gain change is a
 *    `setTargetAtTime` ramp (tau ~15 ms) to avoid clicks;
 *  - the reverb tank is parked at intensity 0 (intensity-0 params, silent
 *    output with an early return that skips the tank) and resets on the
 *    0 -> nonzero transition;
 *  - the worklet is loaded from a Blob URL, so nothing has to be shipped.
 *
 * The element is routed through `createMediaElementSource` exactly once. The
 * caller MUST set `audio.crossOrigin = 'anonymous'` before assigning `src`
 * (asset-protocol sources are otherwise muted to the graph).
 */

import {
  clampIntensity,
  clampSlow,
  computeDattorroParams,
  DATTORRO_WORKLET_SOURCE,
  normalize,
} from './effects-core';

/** Time constant for all gain ramps (seconds). */
const RAMP_TIME_CONSTANT = 0.015;
/** How often the rate watchdog checks for host-reset playback rate (ms). */
const WATCHDOG_INTERVAL_MS = 2000;
/** Rate drift above which the watchdog rewrites `playbackRate`. */
const RATE_DRIFT_TOLERANCE = 0.001;
/** Writes that would not change the rate are skipped if within this. */
const RATE_EPSILON = 0.001;
/** Registered `AudioWorkletProcessor` name. */
const WORKLET_NAME = 'dattorro-reverb';

const PITCH_KEYS = [
  'preservesPitch',
  'mozPreservesPitch',
  'webkitPreservesPitch',
] as const;

type PitchKey = (typeof PITCH_KEYS)[number];
type PitchRecord = Partial<Record<PitchKey, boolean>>;

/** Persisted effects settings, mirrored from the Rust config keys. */
export interface EffectsConfig {
  /** Master switch for the whole effects layer. */
  enabled: boolean;
  /** Whether the slowed rate is allowed to engage. */
  slowEnabled: boolean;
  /** Playback rate multiplier (`0.70..1.30`). */
  slow: number;
  /** Whether the reverb is allowed to engage. */
  reverbEnabled: boolean;
  /** Reverb wet amount (`0..1`). */
  reverbIntensity: number;
}

export const DEFAULT_EFFECTS_CONFIG: EffectsConfig = {
  enabled: true,
  slowEnabled: true,
  slow: 1,
  reverbEnabled: true,
  reverbIntensity: 0,
};

/** Coerces arbitrary settings into a valid {@link EffectsConfig}. */
export function normalizeEffectsConfig(
  raw: Partial<EffectsConfig> | undefined,
): EffectsConfig {
  const settings = normalize(raw);
  return {
    enabled: raw?.enabled ?? DEFAULT_EFFECTS_CONFIG.enabled,
    slowEnabled: raw?.slowEnabled ?? DEFAULT_EFFECTS_CONFIG.slowEnabled,
    slow: settings.slow,
    reverbEnabled: raw?.reverbEnabled ?? DEFAULT_EFFECTS_CONFIG.reverbEnabled,
    reverbIntensity: settings.reverbIntensity,
  };
}

function readPitch(audio: HTMLAudioElement): PitchRecord {
  const record = audio as unknown as Record<PitchKey, unknown>;
  const saved: PitchRecord = {};
  for (const key of PITCH_KEYS) {
    if (typeof record[key] === 'boolean') saved[key] = record[key];
  }
  return saved;
}

function writePitch(
  audio: HTMLAudioElement,
  key: PitchKey,
  value: boolean | undefined,
): void {
  if (value === undefined) return;
  const record = audio as unknown as Record<PitchKey, unknown>;
  if (key in audio) record[key] = value;
}

/** A numeric RMS sample taken from the graph's analyser tap. */
export interface RmsSample {
  rms: number;
  peak: number;
  frames: number;
  durationMs: number;
}

export class EffectsController {
  private readonly audio: HTMLAudioElement;
  private config: EffectsConfig;

  private context: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private outputGain: GainNode | null = null;
  private reverbNode: AudioWorkletNode | null = null;

  private graphReady = false;
  private generation = 0;
  private workletReady = false;
  private workletFailed = false;
  private workletLoad: Promise<void> | null = null;

  private silentTest = false;
  private lastWetGain = 0;

  /**
   * User-facing volume. The graph's master gain owns loudness; the element is
   * pinned to unity once the graph exists, because a MediaElementAudioSource
   * already applies the element's own volume (verified: a 0.5 element volume
   * halves the source RMS), so mirroring it on the master gain would square the
   * curve.
   */
  private volume: number;

  private baseRate: number;
  private savedPitch: PitchRecord;
  private pitchOverridden = false;
  private rateEngaged = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  private readonly rateHandler = () => {
    // A host reset the rate (or something else wrote it): re-assert ours.
    if (this.rateEngaged && this.audio !== null) {
      const target = clampSlow(this.config.slow);
      if (Math.abs(this.audio.playbackRate - target) > RATE_DRIFT_TOLERANCE) {
        this.applySlow();
      }
    }
  };

  constructor(audio: HTMLAudioElement, initial: Partial<EffectsConfig> = {}) {
    this.audio = audio;
    this.config = normalizeEffectsConfig(initial);
    this.volume = Number.isFinite(audio.volume) ? audio.volume : 1;
    this.baseRate = audio.playbackRate || 1;
    this.savedPitch = readPitch(audio);
    this.audio.addEventListener('ratechange', this.rateHandler);
  }

  /** Current normalized settings. */
  getConfig(): EffectsConfig {
    return { ...this.config };
  }

  /** Whether the graph has been built. */
  isGraphReady(): boolean {
    return this.graphReady;
  }

  /**
   * Builds the audio graph exactly once. Safe to call repeatedly (e.g. before
   * every play). Returns `false` when Web Audio is unavailable, in which case
   * the element keeps playing unprocessed.
   */
  ensureGraph(): boolean {
    if (this.graphReady) return true;
    if (typeof AudioContext === 'undefined') return false;

    try {
      const context = new AudioContext();
      const source = context.createMediaElementSource(this.audio);
      const dryGain = context.createGain();
      const wetGain = context.createGain();
      const masterGain = context.createGain();
      const analyser = context.createAnalyser();
      const outputGain = context.createGain();

      analyser.fftSize = 2048;
      dryGain.gain.value = 1;
      wetGain.gain.value = 1;
      masterGain.gain.value = this.volume;
      outputGain.gain.value = this.silentTest ? 0 : 1;

      // dry path: source -> dry -> analyser
      source.connect(dryGain);
      dryGain.connect(analyser);
      // wet path (reverb node attaches later): reverb -> wet -> analyser
      wetGain.connect(analyser);
      // The analyser taps the dry/wet mix BEFORE the volume stage, so numeric
      // verification can zero the master/output gains and still read the graph.
      // Then volume -> output -> speakers.
      analyser.connect(masterGain);
      masterGain.connect(outputGain);
      outputGain.connect(context.destination);

      this.context = context;
      this.source = source;
      this.dryGain = dryGain;
      this.wetGain = wetGain;
      this.masterGain = masterGain;
      this.analyser = analyser;
      this.outputGain = outputGain;
      this.graphReady = true;
      // Pin the element to unity: the master gain is now the volume stage.
      this.audio.volume = 1;
    } catch (error) {
      console.error('[effects] failed to build audio graph', error);
      this.graphReady = false;
      return false;
    }

    // The reverb tank is parked at rest (intensity-0 params), so the worklet
    // is built with the graph whenever the reverb feature is enabled at all.
    if (this.config.enabled && this.config.reverbEnabled) {
      void this.loadWorklet();
    }
    this.applyVolume();
    this.applyReverb();
    this.applySlow();
    return true;
  }

  /** Resumes the audio context (call from a user gesture, e.g. play). */
  async resume(): Promise<void> {
    const context = this.context;
    if (!context || context.state === 'running') return;
    try {
      await context.resume();
    } catch {
      // Best-effort only.
    }
  }

  /** Applies a partial settings patch and re-applies the engaged stages. */
  setConfig(patch: Partial<EffectsConfig>): void {
    this.config = normalizeEffectsConfig({ ...this.config, ...patch });
    if (this.config.enabled && this.config.reverbEnabled && !this.reverbNode) {
      void this.loadWorklet();
    }
    this.applyReverb();
    this.applySlow();
  }

  /** Base (un-slowed) playback rate, i.e. the player's configured rate. */
  setBaseRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.baseRate = rate;
    if (!this.rateEngaged) {
      this.audio.playbackRate = rate;
    }
  }

  /**
   * Sets the user-facing volume. Before the graph exists this drives the
   * element directly; afterwards the master gain owns loudness and the element
   * stays at unity.
   */
  setVolume(value: number): void {
    this.volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
    if (this.graphReady) {
      this.audio.volume = 1;
      this.rampGain(this.masterGain, this.volume);
    } else {
      this.audio.volume = this.volume;
    }
  }

  /** The current user-facing volume. */
  getVolume(): number {
    return this.volume;
  }

  /** Silences the graph output while keeping the analyser tap live. */
  setSilentTest(on: boolean): void {
    this.silentTest = on;
    this.rampGain(this.outputGain, on ? 0 : 1);
  }

  /** Read-only gain snapshot for silent numeric verification. */
  debugGains(): {
    dry: number | null;
    wet: number | null;
    master: number | null;
    output: number | null;
  } {
    return {
      dry: this.dryGain ? this.dryGain.gain.value : null,
      wet: this.wetGain ? this.wetGain.gain.value : null,
      master: this.masterGain ? this.masterGain.gain.value : null,
      output: this.outputGain ? this.outputGain.gain.value : null,
    };
  }

  /** Samples the graph output RMS for `durationMs` (silent-test friendly). */
  measureRms(durationMs = 1000, intervalMs = 25): Promise<RmsSample> {
    const analyser = this.analyser;
    if (!analyser) {
      return Promise.reject(new Error('effects graph is not ready'));
    }
    const buffer = new Float32Array(analyser.fftSize);
    let sumSquares = 0;
    let count = 0;
    let peak = 0;
    const started = performance.now();

    return new Promise<RmsSample>((resolve) => {
      const interval = setInterval(() => {
        analyser.getFloatTimeDomainData(buffer);
        for (const value of buffer) {
          sumSquares += value * value;
          if (Math.abs(value) > peak) peak = Math.abs(value);
          count += 1;
        }
        const elapsed = performance.now() - started;
        if (elapsed >= durationMs) {
          clearInterval(interval);
          resolve({
            rms: count > 0 ? Math.sqrt(sumSquares / count) : 0,
            peak,
            frames: count,
            durationMs: Math.round(elapsed),
          });
        }
      }, intervalMs);
    });
  }

  /**
   * Fully tears the layer down: stops the watchdog, restores the original
   * playback rate and pitch flags, disconnects every node and closes the
   * context.
   */
  destroy(): void {
    this.releaseSlow();
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    this.audio.removeEventListener('ratechange', this.rateHandler);
    this.generation += 1;
    this.graphReady = false;
    // Give the element its volume back before the graph is gone.
    this.audio.volume = this.volume;
    try {
      this.reverbNode?.port.postMessage({ type: 'dispose' });
    } catch {
      // Already gone.
    }
    try {
      this.reverbNode?.disconnect();
    } catch {
      // Already disconnected.
    }
    try {
      this.reverbNode?.port.close();
    } catch {
      // Already closed.
    }
    try {
      this.source?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.reverbNode = null;
    this.source = null;
    this.dryGain = null;
    this.wetGain = null;
    this.masterGain = null;
    this.analyser = null;
    this.outputGain = null;
    const context = this.context;
    this.context = null;
    if (context) {
      void context.close().catch(() => undefined);
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private isReverbActive(): boolean {
    return this.config.enabled && this.config.reverbEnabled;
  }

  private isSlowActive(): boolean {
    return this.config.enabled && this.config.slowEnabled;
  }

  private rampGain(node: GainNode | null, value: number): void {
    if (!node || !this.context) return;
    node.gain.setTargetAtTime(
      value,
      this.context.currentTime,
      RAMP_TIME_CONSTANT,
    );
  }

  private applyVolume(): void {
    this.rampGain(this.masterGain, this.volume);
  }

  private applyReverb(): void {
    const intensity = this.isReverbActive()
      ? clampIntensity(this.config.reverbIntensity)
      : 0;
    const params = computeDattorroParams(intensity);
    // Additive only: the dry path stays at unity and the wet tail is added
    // on top. The wet output is silent at intensity 0 (params.wetGain 0
    // inside the worklet), so enabling at defaults changes no loudness.
    if (this.dryGain) {
      this.dryGain.gain.value = 1;
    }
    if (this.wetGain) {
      this.wetGain.gain.value = 1;
    }
    const prevWet = this.lastWetGain;
    this.lastWetGain = params.wetGain;
    try {
      if (prevWet === 0 && params.wetGain > 0) {
        this.reverbNode?.port.postMessage({ type: 'reset' });
      }
      this.reverbNode?.port.postMessage({ type: 'setParams', params });
    } catch {
      // Node torn down between checks.
    }
  }

  private async loadWorklet(): Promise<void> {
    if (this.reverbNode || this.workletFailed) return;
    const context = this.context;
    if (!context) return;
    if (this.workletLoad) {
      await this.workletLoad;
      return;
    }
    const generation = this.generation;

    const load = (async () => {
      if (!this.workletReady) {
        const blob = new Blob([DATTORRO_WORKLET_SOURCE], {
          type: 'text/javascript',
        });
        const url = URL.createObjectURL(blob);
        try {
          await context.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }
        this.workletReady = true;
      }
    })();
    this.workletLoad = load;
    try {
      await load;
    } catch (error) {
      this.workletFailed = true;
      console.error(
        '[effects] reverb worklet failed to load, dry-only fallback',
        error,
      );
      return;
    } finally {
      if (this.workletLoad === load) this.workletLoad = null;
    }

    if (
      generation !== this.generation ||
      !this.graphReady ||
      !this.source ||
      !this.wetGain ||
      this.reverbNode
    ) {
      return;
    }
    try {
      const node = new AudioWorkletNode(context, WORKLET_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.port.postMessage({ type: 'reset' });
      this.source.connect(node);
      node.connect(this.wetGain);
      this.reverbNode = node;
      this.applyReverb();
    } catch (error) {
      this.workletFailed = true;
      console.error('[effects] reverb node creation failed', error);
    }
  }

  private applySlow(): void {
    if (!this.isSlowActive()) {
      this.releaseSlow();
      return;
    }
    const target = clampSlow(this.config.slow);
    const engaged = target !== 1;
    this.rateEngaged = engaged;
    if (engaged) {
      if (!this.pitchOverridden) {
        for (const key of PITCH_KEYS) writePitch(this.audio, key, false);
        this.pitchOverridden = true;
      }
      if (Math.abs(this.audio.playbackRate - target) > RATE_EPSILON) {
        this.audio.playbackRate = target;
        this.audio.defaultPlaybackRate = target;
      }
    } else {
      this.releaseSlow();
      return;
    }
    this.syncWatchdog();
  }

  private releaseSlow(): void {
    this.rateEngaged = false;
    if (this.pitchOverridden) {
      for (const key of PITCH_KEYS) {
        writePitch(this.audio, key, this.savedPitch[key]);
      }
      this.pitchOverridden = false;
    }
    const restore = this.baseRate || 1;
    if (Math.abs(this.audio.playbackRate - restore) > RATE_EPSILON) {
      this.audio.playbackRate = restore;
      this.audio.defaultPlaybackRate = restore;
    }
    if (this.watchdog !== null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  private syncWatchdog(): void {
    if (this.watchdog !== null) return;
    this.watchdog = setInterval(() => {
      if (!this.rateEngaged) return;
      const target = clampSlow(this.config.slow);
      if (Math.abs(this.audio.playbackRate - target) > RATE_DRIFT_TOLERANCE) {
        this.applySlow();
      }
    }, WATCHDOG_INTERVAL_MS);
  }
}
