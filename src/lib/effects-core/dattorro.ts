/**
 * Dattorro plate-reverb DSP.
 *
 * Parameter map + portable `AudioWorkletProcessor` source imitating
 * pear-desktop `src/plugins/player-actions/slowed-reverb/` as closely as
 * possible (owner's bar: "as close as possible to its quality, mixing,
 * etc."). The tank DSP matches pear sample-for-sample; the worklet writes
 * `wetGain` directly, early-returns silence while it is 0 (skipping the
 * tank), and supports a `dispose` message. The tank is parked at intensity 0
 * and resets on the 0 -> nonzero transition (see `src/lib/effects.ts`).
 */

/**
 * Parameters posted to the worklet via `{ type: 'setParams', params }`.
 * All fields are optional in the message so partial updates are possible.
 */
export interface DattorroParams {
  /** Wet output gain (`0..0.42`); 0 means the wet tail is silent. */
  wetGain: number;
  /** Decay coefficient fed to the tank. */
  decay: number;
  /** Damping coefficient (`0..1`). */
  damping: number;
  /** Pre-delay in "tenths of the buffer" units used by the worklet. */
  preDelay: number;
  /** Pre-filter coefficient. */
  preFilter?: number;
  /** First input all-pass coefficient. */
  inputDiff1?: number;
  /** Second input all-pass coefficient. */
  inputDiff2?: number;
  /** Decay-diffusion all-pass coefficient. */
  decayDiff1?: number;
}

/**
 * Maps a `0..1` reverb intensity to worklet parameters. Intensity is clamped
 * first; a zero (or below) intensity yields the silent (parked) parameter set.
 *
 * Matches pear-desktop `computeDattorroParams`.
 */
export function computeDattorroParams(intensity: number): DattorroParams {
  const i = Math.min(Math.max(Number(intensity) || 0, 0), 1);
  if (i <= 0) {
    return { wetGain: 0, decay: 0, damping: 1, preDelay: 0 };
  }
  return {
    preDelay: 0.44 + i * 0.1,
    preFilter: 0.7 + i * 0.1,
    inputDiff1: 0.75,
    inputDiff2: 0.625,
    decayDiff1: 0.65 + i * 0.05,
    decay: Math.pow(i, 0.75) * 0.58,
    damping: Math.min(0.5 + Math.pow(i, 0.6) * 0.4, 0.78),
    wetGain: Math.pow(i, 0.75) * 0.42,
  };
}

/**
 * Portable `AudioWorkletProcessor` source for the Dattorro plate reverb,
 * registered as `"dattorro-reverb"`. Feed it with `setParams` messages
 * carrying {@link DattorroParams}, `{ type: 'reset' }` to clear the tank,
 * and `{ type: 'dispose' }` to retire the processor.
 *
 * Load it host-side, e.g.:
 * ```ts
 * const blob = new Blob([DATTORRO_WORKLET_SOURCE], { type: 'application/javascript' });
 * await audioContext.audioWorklet.addModule(URL.createObjectURL(blob));
 * ```
 */
export const DATTORRO_WORKLET_SOURCE: string = `class DelayLine {
  constructor(maxDelay) {
    let size = 1;
    while (size < maxDelay) size <<= 1;
    this.buf = new Float32Array(size);
    this.mask = size - 1;
    this.offset = size - maxDelay;
    this.taps = {};
  }

  setTap(name, delay) {
    this.taps[name] = this.mask + 1 - delay;
  }

  write(t, v) {
    this.buf[t & this.mask] = v;
  }

  read(t) {
    return this.buf[(t + this.offset) & this.mask];
  }

  readTap(t, name) {
    const off = this.taps[name];
    return off !== undefined ? this.buf[(t + off) & this.mask] : 0;
  }
}

class DattorroReverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.disposed = false;
    this.port.onmessage = (e) => this.handleMessage(e.data);
    this.init();
  }

  handleMessage(data) {
    if (data.type === 'dispose') { this.disposed = true; return; }
    if (this.disposed) return;
    if (data.type === 'reset') {
      this.init();
      return;
    }
    if (data.type === 'setParams') {
      const p = data.params;
      if (p.preDelay !== undefined) this.predelay = p.preDelay;
      if (p.preFilter !== undefined) this.preFilterAmt = p.preFilter;
      if (p.inputDiff1 !== undefined) this.inputDiff1Amt = p.inputDiff1;
      if (p.inputDiff2 !== undefined) this.inputDiff2Amt = p.inputDiff2;
      if (p.decayDiff1 !== undefined) this.decayDiff1Amt = p.decayDiff1;
      if (p.decay !== undefined) {
        this.decayAmt = p.decay;
        this.decayDiff2Amt = Math.min(Math.max(p.decay + 0.15, 0.25), 0.50);
      }
      if (p.damping !== undefined) this.dampingAmt = p.damping;
      if (p.wetGain !== undefined) this.wetGain = p.wetGain;
    }
  }

  np2(x) {
    let s = 1;
    while (s < x) s <<= 1;
    return s;
  }

  init() {
    this.t = 0;
    this.sr = sampleRate;
    this.predelay = 0.1;
    this.preFilterAmt = 0.85;
    this.inputDiff1Amt = 0.75;
    this.inputDiff2Amt = 0.625;
    this.decayDiff1Amt = 0.70;
    this.decayAmt = 0.75;
    this.decayDiff2Amt = 0.50;
    this.dampingAmt = 0.95;
    this.wetGain = 0;
    this.preFilter = 0;
    this.damping = [0, 0];
    this.hpf = 0;
    this.wetLpf = [0, 0];
    // Pre-delay ring: 0.1*sr slots, which covers the longest delay the params
    // can ask for (preDelay 0.54 -> 0.054*sr), so a read cannot lap the write.
    this.preBuf = new Float32Array(Math.ceil(sampleRate * 0.1));
    this.preIdx = 0;

    // Dattorro's published delay lengths are sample counts at his 29761 Hz
    // rate, so they are only that long at 29761 Hz. Go through the paper's
    // milliseconds and re-scale to the live rate to keep the physical plate.
    const ms = (v) => Math.round((v * sampleRate) / 1000);
    const apLine = (delayMs) => {
      const d = ms(delayMs);
      const size = this.np2(d);
      return { buf: new Float32Array(size), mask: size - 1, off: size - d };
    };

    this.inDiff = [
      apLine(4.771345),
      apLine(3.595309),
      apLine(12.734787),
      apLine(9.307483),
    ];

    const modDepth = 8;
    this.modDelay1 = new DelayLine(ms(22.579886) + modDepth);
    this.modDelay2 = new DelayLine(ms(30.509727) + modDepth);
    // Nominal delay stays the paper's length; the spare slots are the triangle
    // LFO's sweep, so the modulated read (base +/- modDepth) stays in-buffer.
    this.modDepth = modDepth;
    this.modDelay1.offset += modDepth;
    this.modDelay2.offset += modDepth;
    this.modDelay1.base = this.modDelay1.offset;
    this.modDelay2.base = this.modDelay2.offset;
    this.modPhase = 0;
    this.modDir = 1;

    this.preDampDL = [new DelayLine(ms(149.625349)), new DelayLine(ms(141.695508))];
    this.preDampDL[0].setTap('out1', ms(11.861161));
    this.preDampDL[0].setTap('out2', ms(121.870905));
    this.preDampDL[0].setTap('out3', ms(66.866033));
    this.preDampDL[1].setTap('out1', ms(8.937872));
    this.preDampDL[1].setTap('out2', ms(99.929438));
    this.preDampDL[1].setTap('out3', ms(70.931756));

    this.decayDiff2 = [new DelayLine(ms(60.481839)), new DelayLine(ms(89.244313))];
    this.decayDiff2[0].setTap('out1', ms(6.283391));
    this.decayDiff2[0].setTap('out2', ms(41.262054));
    this.decayDiff2[1].setTap('out1', ms(11.256342));
    this.decayDiff2[1].setTap('out2', ms(64.278754));

    this.postDampDL = [new DelayLine(ms(124.9958)), new DelayLine(ms(106.280031))];
    this.postDampDL[0].setTap('out1', ms(35.818689));
    this.postDampDL[0].setTap('out2', ms(89.81553));
    this.postDampDL[1].setTap('out1', ms(4.065724));
    this.postDampDL[1].setTap('out2', ms(67.067639));
  }

  allpassAp(buf, mask, off, gain, x) {
    const idx = this.t & mask;
    const delayed = buf[(this.t + off) & mask];
    const temp = x - gain * delayed;
    buf[idx] = temp;
    return delayed + gain * temp;
  }

  allpassDL(dl, gain, x) {
    const delayed = dl.read(this.t);
    const temp = x - gain * delayed;
    dl.write(this.t, temp);
    return delayed + gain * temp;
  }

  process(inputs, outputs) {
    if (this.disposed) return false;
    const inp = inputs[0];
    const out = outputs[0];
    if (!inp || !inp.length || !out || !out.length) return true;

    const L = inp[0];
    const R = inp.length > 1 ? inp[1] : inp[0];
    const n = L.length;
    const outL = out[0];
    const outR = out.length > 1 ? out[1] : out[0];
    if (this.wetGain === 0) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }
    const sr = this.sr;

    for (let i = 0; i < n; i++) {
      let x = (L[i] + R[i]) * 0.5;

      this.preBuf[this.preIdx] = x;
      this.preIdx = (this.preIdx + 1) % this.preBuf.length;
      const pdSamps = Math.floor(this.predelay * sr * 0.1);
      const rdIdx = (this.preIdx - pdSamps + this.preBuf.length) % this.preBuf.length;
      x = this.preBuf[rdIdx];

      this.preFilter += (x - this.preFilter) * this.preFilterAmt;
      x = this.preFilter;

      const hpfCoeff = 0.025;
      this.hpf += hpfCoeff * (x - this.hpf);
      x = x - this.hpf;

      for (let j = 0; j < 4; j++) {
        const d = this.inDiff[j];
        const g = j < 2 ? this.inputDiff1Amt : this.inputDiff2Amt;
        x = this.allpassAp(d.buf, d.mask, d.off, g, x);
      }

      if ((this.t & 0x7ff) === 0) {
        // Slow triangle LFO: sweep the modulated-delay read offsets a few
        // samples each way so the reverb tail stays shimmering, not metallic.
        if (this.modPhase >= this.modDepth) this.modDir = -1;
        if (this.modPhase <= -this.modDepth) this.modDir = 1;
        this.modPhase += this.modDir;
        this.modDelay1.offset = this.modDelay1.base + this.modPhase;
        this.modDelay2.offset = this.modDelay2.base + this.modPhase;
      }

      let x1 = x + this.postDampDL[1].read(this.t) * this.decayAmt;
      x1 = this.allpassDL(this.modDelay1, -this.decayDiff1Amt, x1);
      this.preDampDL[0].write(this.t, x1);
      x1 = this.preDampDL[0].read(this.t);
      this.damping[0] += (x1 - this.damping[0]) * this.dampingAmt;
      x1 = this.damping[0];
      x1 *= this.decayAmt;
      x1 = this.allpassDL(this.decayDiff2[0], this.decayDiff2Amt, x1);
      this.postDampDL[0].write(this.t, x1);

      let x2 = x + this.postDampDL[0].read(this.t) * this.decayAmt;
      x2 = this.allpassDL(this.modDelay2, -this.decayDiff1Amt, x2);
      this.preDampDL[1].write(this.t, x2);
      x2 = this.preDampDL[1].read(this.t);
      this.damping[1] += (x2 - this.damping[1]) * this.dampingAmt;
      x2 = this.damping[1];
      x2 *= this.decayAmt;
      x2 = this.allpassDL(this.decayDiff2[1], this.decayDiff2Amt, x2);
      this.postDampDL[1].write(this.t, x2);

      const lpfCoeff = 0.5;
      const wL = (this.preDampDL[1].readTap(this.t, 'out1')
            + this.preDampDL[1].readTap(this.t, 'out2')
            - this.decayDiff2[1].readTap(this.t, 'out2')
            + this.postDampDL[1].readTap(this.t, 'out2')
            - this.preDampDL[0].readTap(this.t, 'out3')
            - this.decayDiff2[0].readTap(this.t, 'out1')
            + this.postDampDL[0].readTap(this.t, 'out1'));
      const wR = (this.preDampDL[0].readTap(this.t, 'out1')
            + this.preDampDL[0].readTap(this.t, 'out2')
            - this.decayDiff2[0].readTap(this.t, 'out2')
            + this.postDampDL[0].readTap(this.t, 'out2')
            - this.preDampDL[1].readTap(this.t, 'out3')
            - this.decayDiff2[1].readTap(this.t, 'out1')
            + this.postDampDL[1].readTap(this.t, 'out1'));

      this.wetLpf[0] += lpfCoeff * (wL - this.wetLpf[0]);
      this.wetLpf[1] += lpfCoeff * (wR - this.wetLpf[1]);

      outL[i] = this.wetGain * (this.wetLpf[0] / (1 + Math.abs(this.wetLpf[0])));
      outR[i] = this.wetGain * (this.wetLpf[1] / (1 + Math.abs(this.wetLpf[1])));

      this.t++;
    }

    return true;
  }
}

registerProcessor('dattorro-reverb', DattorroReverbProcessor);
`;
