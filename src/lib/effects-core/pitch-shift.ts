/**
 * Granular overlap-add pitch-shifter DSP.
 *
 * Portable `AudioWorkletProcessor` source plus host-side parameter helpers.
 * The processor shifts pitch WITHOUT changing duration: a delay-line read
 * pointer advances at the shift ratio (`2 ** (semitones / 12)` samples per
 * output sample, linearly interpolated), so the pitch is exact. Because the
 * read pointer drifts away from the write head, it must periodically jump;
 * each jump target is picked by a short waveform-correlation search so the
 * pre- and post-jump waveforms line up, and the two streams are cross-faded
 * over the overlap window. One output sample is produced per input sample,
 * so duration never changes. A ratio of 1 is a clean pass-through (input
 * copied straight to output).
 *
 * Design note: the first prototype used free-running overlapping taps (each
 * tap's delay ramping continuously with staggered Hann windows, no
 * alignment). Measured in `node:vm` on a 440 Hz sine at +12 semitones, that
 * design produced a clean tone at ~908 Hz instead of 880 Hz (+3.2%, about a
 * quarter-tone sharp; -12 gave ~206 Hz instead of 220 Hz). Cross-fading
 * between out-of-phase taps rotates the resultant phase, so the pitch error
 * is structural, not a tuning constant. This design keeps the exact-ratio
 * read but re-syncs with phase-aligned jumps instead, which measures exactly
 * on-pitch (see `pitch-shift.test.ts`).
 *
 * Supported range is one octave each way (`PITCH_SHIFT_MIN_SEMITONES..`
 * `PITCH_SHIFT_MAX_SEMITONES`, i.e. playback ratios `0.5..2.0`). Wider shifts
 * need much longer grains to stay clean and degrade quickly under this fixed
 * buffer budget, while an octave covers the practice use (octave up/down).
 *
 * NOTE on quality tiers: the `low` / `medium` / `high` tier set below — grain
 * (nominal jump interval) 1024 / 2048 / 4096 samples, overlap crossfade
 * 128 / 256 / 512 samples, alignment search radius 64 / 128 / 256 samples —
 * is this project's own choice of implementation dimension. It is NOT
 * attributed to AIMP; AIMP evidence does not establish tier names, counts,
 * or values.
 *
 * Module scope touches no browser-only globals (same rule as `dattorro.ts`):
 * `AudioWorkletProcessor`, `sampleRate`, and `registerProcessor` appear only
 * inside the `PITCH_SHIFT_WORKLET_SOURCE` string, which a host loads via a
 * Blob URL.
 */

/** Lowest supported shift, in semitones (one octave down, ratio 0.5). */
export const PITCH_SHIFT_MIN_SEMITONES = -12;
/** Highest supported shift, in semitones (one octave up, ratio 2.0). */
export const PITCH_SHIFT_MAX_SEMITONES = 12;
/** Neutral shift: 0 semitones (pass-through). */
export const DEFAULT_PITCH_SEMITONES = 0;

/**
 * Quality tier names. Plain names on purpose — see the module note above.
 * Larger grains with longer crossfades and wider search sound smoother and
 * cost more memory/CPU.
 */
export type PitchQuality = 'low' | 'medium' | 'high';

/** All supported quality tiers, lowest fidelity first. */
export const PITCH_QUALITIES: ReadonlyArray<PitchQuality> = [
  'low',
  'medium',
  'high',
];

/** Default quality tier. */
export const DEFAULT_PITCH_QUALITY: PitchQuality = 'medium';

/** Grain configuration behind one quality tier. */
export interface PitchQualityConfig {
  /** Nominal jump interval in samples (also the grain length). */
  grainSamples: number;
  /** Overlap crossfade length in samples applied at each jump. */
  xfadeSamples: number;
  /** Alignment search radius in samples either side of the jump target. */
  searchSamples: number;
}

/**
 * Per-tier grain configuration. This table is this project's choice (see the
 * module note): low is cheap, high is smoothest and tracks lower notes.
 */
export const PITCH_QUALITY_CONFIGS: Record<PitchQuality, PitchQualityConfig> = {
  low: { grainSamples: 1024, xfadeSamples: 128, searchSamples: 64 },
  medium: { grainSamples: 2048, xfadeSamples: 256, searchSamples: 128 },
  high: { grainSamples: 4096, xfadeSamples: 512, searchSamples: 256 },
};

/** Normalized pitch-shift settings shared by every consumer. */
export interface PitchShiftParams {
  /**
   * Shift in semitones, `PITCH_SHIFT_MIN_SEMITONES..`
   * `PITCH_SHIFT_MAX_SEMITONES`, rounded to 2 decimals.
   */
  semitones: number;
  /** Quality tier selecting grain size / overlap / search configuration. */
  quality: PitchQuality;
}

/** The neutral settings: no shift at the default quality. */
export const DEFAULT_PITCH_SHIFT: PitchShiftParams = {
  semitones: DEFAULT_PITCH_SEMITONES,
  quality: DEFAULT_PITCH_QUALITY,
};

/** Processor name used in `registerProcessor` inside the worklet source. */
export const PITCH_SHIFTER_PROCESSOR_NAME = 'slowburn-pitch-shift';

/**
 * Converts semitones to a playback ratio (`2 ** (n / 12)`). A non-finite
 * input yields 1 (neutral/no-op). Callers should clamp first with
 * {@link clampPitchSemitones} when enforcing the supported range.
 */
export function semitonesToRatio(semitones: number): number {
  const numeric = Number(semitones);
  if (!Number.isFinite(numeric)) return 1;
  return 2 ** (numeric / 12);
}

/**
 * Clamps a semitone value into `[PITCH_SHIFT_MIN_SEMITONES,
 * PITCH_SHIFT_MAX_SEMITONES]` and rounds it to two decimals (same rounding
 * as `slowed.ts`). A non-finite/`NaN` input normalizes to 0 (neutral/no-op).
 */
export function clampPitchSemitones(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_PITCH_SEMITONES;
  const clamped = Math.min(
    PITCH_SHIFT_MAX_SEMITONES,
    Math.max(PITCH_SHIFT_MIN_SEMITONES, numeric),
  );
  return Math.round(clamped * 100) / 100;
}

/**
 * Coerces an arbitrary quality value into a valid {@link PitchQuality}.
 * Unknown values fall back to {@link DEFAULT_PITCH_QUALITY}.
 */
export function normalizePitchQuality(raw: unknown): PitchQuality {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return DEFAULT_PITCH_QUALITY;
}

/**
 * Coerces arbitrary persisted data into valid {@link PitchShiftParams}.
 * Missing keys fall back to {@link DEFAULT_PITCH_SHIFT}; unknown keys are
 * dropped (same shape as `slowed.ts` `normalize`).
 */
export function normalizePitchShift(raw: unknown): PitchShiftParams {
  const next =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    semitones: clampPitchSemitones(
      Object.prototype.hasOwnProperty.call(next, 'semitones')
        ? (next['semitones'] as number)
        : DEFAULT_PITCH_SEMITONES,
    ),
    quality: normalizePitchQuality(
      Object.prototype.hasOwnProperty.call(next, 'quality')
        ? next['quality']
        : DEFAULT_PITCH_QUALITY,
    ),
  };
}

/** Returns a fresh copy of the neutral pitch-shift settings. */
export function getDefaultPitchShift(): PitchShiftParams {
  return { ...DEFAULT_PITCH_SHIFT };
}

/**
 * Whether the pitch shifter has work to do: enabled and not at 0 semitones.
 * Gate for building the shift audio path and for posting parameters.
 */
export function isPitchShiftEngaged(config: {
  active: boolean;
  semitones: number;
}): boolean {
  return config.active && clampPitchSemitones(config.semitones) !== 0;
}

/**
 * Portable `AudioWorkletProcessor` source for the granular pitch shifter,
 * registered as `"slowburn-pitch-shift"`. Feed it with `setParams` messages
 * carrying `{ semitones, quality }` (both optional for partial updates),
 * `{ type: 'reset' }` to clear the delay line, and `{ type: 'dispose' }` to
 * retire the processor.
 *
 * Method: per channel, a read pointer advances through a 32768-sample delay
 * line at the shift ratio with linear interpolation. When the read pointer's
 * delay drifts out of range it jumps by the tier's grain length; the jump
 * target is refined by a correlation search (± the tier's search radius,
 * 128-sample window) so the waveforms line up, and the pre/post-jump streams
 * are cross-faded over the tier's overlap length. Latency is the read delay
 * (a few thousand samples); the first buffers after construction or `reset`
 * contain the line filling up.
 *
 * Load it host-side, e.g.:
 * ```ts
 * const blob = new Blob([PITCH_SHIFT_WORKLET_SOURCE], { type: 'application/javascript' });
 * await audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
 * ```
 */
export const PITCH_SHIFT_WORKLET_SOURCE: string = `var PITCH_MIN = -12;
var PITCH_MAX = 12;
var PITCH_QUALITY_TABLE = {
  low: { grain: 1024, xfade: 128, search: 64 },
  medium: { grain: 2048, xfade: 256, search: 128 },
  high: { grain: 4096, xfade: 512, search: 256 }
};
var CORR_LEN = 128;
var DELAY_MIN = 2048;

function clampSemi(v) {
  var n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < PITCH_MIN) n = PITCH_MIN;
  if (n > PITCH_MAX) n = PITCH_MAX;
  return Math.round(n * 100) / 100;
}

class PitchShiftProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.disposed = false;
    this.port.onmessage = (e) => this.handleMessage(e.data);
    this.bufSize = 32768;
    this.writePos = 0;
    this.chanBufs = [];
    this.readPos = [];
    this.fade = [];
    this.semitones = 0;
    this.ratio = 1;
    this.quality = 'medium';
    this.setQuality('medium');
  }

  handleMessage(data) {
    if (!data || typeof data.type !== 'string') return;
    if (data.type === 'dispose') { this.disposed = true; return; }
    if (this.disposed) return;
    if (data.type === 'reset') {
      this.doReset();
      return;
    }
    if (data.type === 'setParams') {
      var p = data.params || {};
      if (p.quality !== undefined) {
        if (PITCH_QUALITY_TABLE[p.quality] !== undefined && p.quality !== this.quality) {
          this.setQuality(p.quality);
        }
      }
      if (p.semitones !== undefined) {
        var s = clampSemi(p.semitones);
        this.semitones = s;
        this.ratio = Math.pow(2, s / 12);
      }
    }
  }

  setQuality(q) {
    var cfg = PITCH_QUALITY_TABLE[q] || PITCH_QUALITY_TABLE.medium;
    this.quality = q;
    this.grainLen = cfg.grain;
    this.xfadeLen = cfg.xfade;
    this.searchLen = cfg.search;
    this.dMin = DELAY_MIN;
    this.dMax = DELAY_MIN + cfg.grain + cfg.search + cfg.xfade + 32;
    this.dMid = (this.dMin + this.dMax) / 2;
    this.lowTrig = this.dMin + cfg.xfade + 32;
    this.highTrig = this.dMax - cfg.xfade - 32;
  }

  ensureChannels(n) {
    while (this.chanBufs.length < n) {
      this.chanBufs.push(new Float32Array(this.bufSize));
      this.readPos.push(this.writePos - this.dMid);
      this.fade.push(null);
    }
  }

  doReset() {
    this.writePos = 0;
    for (var c = 0; c < this.chanBufs.length; c++) {
      this.chanBufs[c].fill(0);
      this.readPos[c] = -this.dMid;
      this.fade[c] = null;
    }
  }

  readAt(ch, pos) {
    var buf = this.chanBufs[ch];
    var S = this.bufSize;
    var i0 = Math.floor(pos);
    var frac = pos - i0;
    var idx0 = ((i0 % S) + S) % S;
    var idx1 = (idx0 + 1) % S;
    var s0 = buf[idx0];
    return s0 + (buf[idx1] - s0) * frac;
  }

  findJump(ch, rCur, dir) {
    var base = rCur + dir * this.grainLen;
    var S = this.searchLen;
    var bestD = 0;
    var bestScore = -Infinity;
    for (var d = -S; d <= S; d++) {
      var score = 0;
      for (var k = 0; k < CORR_LEN; k++) {
        score += this.readAt(ch, rCur + this.ratio * k) * this.readAt(ch, base + d + this.ratio * k);
      }
      if (score > bestScore) { bestScore = score; bestD = d; }
    }
    return base + bestD;
  }

  process(inputs, outputs) {
    if (this.disposed) return false;
    var inp = inputs[0];
    var out = outputs[0];
    if (!inp || !inp.length || !out || !out.length) return true;
    var n = inp[0].length;
    var numCh = Math.max(inp.length, out.length);
    this.ensureChannels(numCh);
    var bypass = (this.ratio === 1);
    var S = this.bufSize;
    for (var i = 0; i < n; i++) {
      for (var ch = 0; ch < numCh; ch++) {
        this.chanBufs[ch][this.writePos % S] = inp[Math.min(ch, inp.length - 1)][i];
      }
      if (bypass) {
        for (var b = 0; b < numCh; b++) {
          out[Math.min(b, out.length - 1)][i] = inp[Math.min(b, inp.length - 1)][i];
          this.readPos[b] = this.writePos - this.dMid;
          this.fade[b] = null;
        }
      } else {
        var dir = this.ratio > 1 ? -1 : 1;
        for (var c = 0; c < numCh; c++) {
          var outC = out[Math.min(c, out.length - 1)];
          var r = this.readPos[c];
          var delay = this.writePos - r;
          var f = this.fade[c];
          if (f === null || f === undefined) {
            if ((dir < 0 && delay < this.lowTrig) || (dir > 0 && delay > this.highTrig)) {
              this.fade[c] = { n: 0, rB: this.findJump(c, r, dir) };
              f = this.fade[c];
            }
          }
          if (f !== null && f !== undefined) {
            var alpha = (f.n + 1) / this.xfadeLen;
            var xa = this.readAt(c, r);
            var xb = this.readAt(c, f.rB);
            outC[i] = (1 - alpha) * xa + alpha * xb;
            r += this.ratio;
            f.rB += this.ratio;
            f.n++;
            if (f.n >= this.xfadeLen) {
              r = f.rB;
              this.fade[c] = null;
            }
            this.readPos[c] = r;
          } else {
            outC[i] = this.readAt(c, r);
            this.readPos[c] = r + this.ratio;
          }
        }
      }
      this.writePos++;
    }
    return true;
  }
}

registerProcessor('slowburn-pitch-shift', PitchShiftProcessor);
`;
