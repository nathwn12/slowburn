/**
 * Tempo + pitch LIVE acceptance: end-to-end numeric proof through the real app.
 *
 * Everything before this spec was proven in isolation (pitch DSP spectrally,
 * the composition rule with fake Web Audio, the control panel against a mocked
 * player). This spec mounts the REAL app (`./e2e-helpers` renders the real
 * `main.tsx` route tree), drives the REAL player singleton
 * (`window.__MUSEEKS_PLAYER`) with REAL fixture audio
 * (`src/__tests__/assets/*.mp3`, served via `publicDir`), and asserts NUMBERS
 * only: element `playbackRate`, `preservesPitch`, the configured pitch
 * semitones, and measured `currentTime` advance.
 *
 * Silent by construction: the browser launches with `--mute-audio`
 * (`vitest.config.ts`), and every test forces the graph output to 0
 * (`setSilentTest(true)`) AND the master gain to 0 (`setVolume(0)`) before
 * playback. Nothing here is asserted by listening.
 *
 * Timing policy (stated, not weakened): wall-clock sleeps drive the advance
 * measures, so the gates are deliberately wide. The tempo-200 advance must be
 * more than 1.5x the tempo-100 advance (ideal 2.0x; 1.5x tolerates scheduling
 * jitter and `currentTime` quantisation). The pitch-only advance must land
 * within 0.6x..1.4x of the neutral advance (proving no acceleration) and below
 * the tempo-200 advance. Each advance must exceed 0.5 s (proving playback is
 * genuinely moving, not stalled).
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

type Player = (typeof window)['__MUSEEKS_PLAYER'];

function player(): Player {
  return window.__MUSEEKS_PLAYER;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await sleep(20);
  }
}

function preservesPitchOf(audio: HTMLAudioElement): boolean {
  return (audio as unknown as { preservesPitch: boolean }).preservesPitch;
}

/** The pitch value the engine holds (the value posted to the worklet). */
function enginePitchSemitones(): number | null {
  const handle = window.__MUSEEKS_EFFECTS;
  if (handle == null) return null;
  return handle.controller.getConfig().pitch;
}

/** Whether the pitch worklet node exists in the live graph (if exposed). */
function pitchNodePresent(): boolean | null {
  const handle = window.__MUSEEKS_EFFECTS;
  if (handle == null) return null;
  const inner = handle.controller as unknown as {
    pitchNode?: unknown;
  };
  if (!('pitchNode' in inner)) return null;
  return inner.pitchNode != null;
}

/** Scan the mock library, silence the graph, and play the first fixture. */
async function playFirstTrack(): Promise<Player> {
  await setupScannedLibrary();
  const p = player();
  p.getEffects().setSilentTest(true);
  p.setVolume(0);
  await getTrackByName(/Whiskey Blues/).dblClick();
  await waitFor(() => !p.getState().isPaused, 8000);
  await waitFor(() => p.getCurrentTime() > 0.2, 10_000);
  return p;
}

/** Reset the tempo/pitch/slow patch to exactly neutral and let it land. */
async function resetToNeutral(p: Player): Promise<void> {
  p.setEffectsConfig({
    enabled: true,
    slowEnabled: true,
    slow: 1,
    tempo: 100,
    pitch: 0,
  });
  await sleep(150);
}

afterEach(() => {
  window.__MUSEEKS_PLAYER?.pause();
});

test(
  '1 neutral is a no-op: tempo 100 pitch 0 leaves rate 1 and pitch preserved',
  { timeout: 30_000 },
  async () => {
    const p = await playFirstTrack();
    await resetToNeutral(p);

    const audio = p.getAudioElement();
    const rate = audio.playbackRate;
    const kept = preservesPitchOf(audio);
    const cfg = p.getEffectsConfig();
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case1-neutral',
      JSON.stringify({
        playbackRate: rate,
        preservesPitch: kept,
        tempo: cfg.tempo,
        pitch: cfg.pitch,
        slow: cfg.slow,
      }),
    );
    expect(cfg.tempo).toBe(100);
    expect(cfg.pitch).toBe(0);
    expect(rate).toBe(1);
    expect(kept).toBe(true);

    // Neutral tempo with the pre-existing slow engaged keeps slow behavior:
    // the applied rate is exactly the slow value with pitch coupled (false).
    p.setEffectsConfig({ slow: 0.8 });
    await sleep(150);
    const slowRate = audio.playbackRate;
    const slowKept = preservesPitchOf(audio);
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case1-slow-neutral-tempo',
      JSON.stringify({ playbackRate: slowRate, preservesPitch: slowKept }),
    );
    expect(slowRate).toBeCloseTo(0.8, 3);
    expect(slowKept).toBe(false);

    await resetToNeutral(p);
  },
);

test(
  '2 tempo 200 doubles the element rate while preserving pitch',
  { timeout: 30_000 },
  async () => {
    const p = await playFirstTrack();
    await resetToNeutral(p);

    p.setEffectsConfig({ slow: 1, tempo: 200, pitch: 0 });
    await sleep(150);
    const audio = p.getAudioElement();
    const rate = audio.playbackRate;
    const kept = preservesPitchOf(audio);
    const cfg = p.getEffectsConfig();
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case2-tempo200',
      JSON.stringify({
        playbackRate: rate,
        preservesPitch: kept,
        tempo: cfg.tempo,
      }),
    );
    expect(cfg.tempo).toBe(200);
    expect(rate).toBe(2);
    expect(kept).toBe(true);

    await resetToNeutral(p);
  },
);

test(
  '3 pitch +12 at tempo 100 does not alter the element rate',
  { timeout: 30_000 },
  async () => {
    const p = await playFirstTrack();
    await resetToNeutral(p);

    p.setEffectsConfig({ slow: 1, tempo: 100, pitch: 12 });
    await sleep(150);
    const audio = p.getAudioElement();
    const rate = audio.playbackRate;
    const kept = preservesPitchOf(audio);
    const cfg = p.getEffectsConfig();
    const devPitch = enginePitchSemitones();
    const nodePresent = pitchNodePresent();
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case3-pitch12',
      JSON.stringify({
        playbackRate: rate,
        preservesPitch: kept,
        configPitch: cfg.pitch,
        devPitch,
        pitchNodePresent: nodePresent,
      }),
    );
    expect(cfg.pitch).toBe(12);
    expect(rate).toBe(1);
    // The pitch shift must not engage the rate path, so pitch stays preserved.
    expect(kept).toBe(true);
    // The DEV handle exposes the posted value through the controller config.
    expect(devPitch).toBe(12);

    await resetToNeutral(p);
  },
);

test(
  '4 composition: slow 0.8 with tempo 200 applies the product with pitch coupled',
  { timeout: 30_000 },
  async () => {
    const p = await playFirstTrack();
    await resetToNeutral(p);

    p.setEffectsConfig({ slow: 0.8, tempo: 200, pitch: 0 });
    await sleep(150);
    const audio = p.getAudioElement();
    const rate = audio.playbackRate;
    const kept = preservesPitchOf(audio);
    const cfg = p.getEffectsConfig();
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case4-composed',
      JSON.stringify({
        playbackRate: rate,
        preservesPitch: kept,
        slow: cfg.slow,
        tempo: cfg.tempo,
        expectedProduct: 1.6,
      }),
    );
    expect(cfg.slow).toBeCloseTo(0.8, 5);
    expect(cfg.tempo).toBe(200);
    expect(rate).toBeCloseTo(1.6, 3);
    expect(kept).toBe(false);

    await resetToNeutral(p);
  },
);

test(
  '5 real time advance: tempo 200 advances ~2x, pitch +12 does not accelerate',
  { timeout: 90_000 },
  async () => {
    const p = await playFirstTrack();
    const WALL_MS = 2000;
    // Ratio gate (stated tolerance): ideal 2.0x; anything above 1.5x proves a
    // meaningfully faster clock despite scheduling and quantisation jitter.
    const TEMPO_RATIO_GATE = 1.5;
    // Pitch must not accelerate: its advance lands within 0.6x..1.4x of
    // neutral (wide by design) and below the tempo-200 advance.
    const PITCH_LO = 0.6;
    const PITCH_HI = 1.4;

    async function measureAdvance(
      label: string,
      seekTo: number,
    ): Promise<{ advance: number; wallMs: number }> {
      if (p.getState().isPaused) {
        await p.play();
        await waitFor(() => !p.getState().isPaused, 5000);
      }
      p.setCurrentTime(seekTo);
      await sleep(250);
      const t0 = p.getCurrentTime();
      const wall0 = performance.now();
      await sleep(WALL_MS);
      const t1 = p.getCurrentTime();
      const wallMs = Math.round(performance.now() - wall0);
      const advance = t1 - t0;
      // eslint-disable-next-line no-console
      console.log(
        'TEMPO_PITCH_LIVE case5-advance',
        JSON.stringify({ label, seekTo, t0, t1, advance, wallMs }),
      );
      return { advance, wallMs };
    }

    await resetToNeutral(p);
    const neutral = await measureAdvance('tempo100-pitch0', 10);
    expect(neutral.advance).toBeGreaterThan(0.5);

    p.setEffectsConfig({ slow: 1, tempo: 200, pitch: 0 });
    await sleep(150);
    const fast = await measureAdvance('tempo200-pitch0', 30);
    expect(fast.advance).toBeGreaterThan(0.5);
    const ratio = fast.advance / neutral.advance;
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case5-ratio',
      JSON.stringify({
        neutralAdvance: neutral.advance,
        fastAdvance: fast.advance,
        ratio,
        gate: TEMPO_RATIO_GATE,
        wallMs: { neutral: neutral.wallMs, fast: fast.wallMs },
      }),
    );
    expect(ratio).toBeGreaterThan(TEMPO_RATIO_GATE);

    p.setEffectsConfig({ slow: 1, tempo: 100, pitch: 12 });
    await sleep(150);
    const pitched = await measureAdvance('tempo100-pitch12', 60);
    expect(pitched.advance).toBeGreaterThan(0.5);
    const pitchRatio = pitched.advance / neutral.advance;
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case5-pitch-ratio',
      JSON.stringify({
        neutralAdvance: neutral.advance,
        pitchedAdvance: pitched.advance,
        pitchRatio,
        lo: PITCH_LO,
        hi: PITCH_HI,
      }),
    );
    expect(pitchRatio).toBeGreaterThan(PITCH_LO);
    expect(pitchRatio).toBeLessThan(PITCH_HI);
    expect(pitched.advance).toBeLessThan(fast.advance);

    await resetToNeutral(p);
  },
);

test(
  '6 the rendered TEMPO and PITCH rows drive the real player',
  { timeout: 30_000 },
  async () => {
    const p = await playFirstTrack();
    await resetToNeutral(p);

    // Selectors used (robust accessible names from EffectControls):
    // - disclosure: button "Details and effects" (only when the rows are
    //   hidden behind it; a no-op when already open)
    // - tempo steppers: buttons "Increase tempo" / "Decrease tempo"
    // - pitch steppers: buttons "Raise pitch" / "Lower pitch"
    // - sliders (visibility proof): "Tempo, pitch preserved" and
    //   "Pitch shift in semitones".
    const disclosure = page.getByRole('button', {
      name: 'Details and effects',
    });
    const disclosureEls = disclosure.elements();
    if (disclosureEls.length > 0) {
      const expanded = (disclosureEls[0] as HTMLButtonElement).getAttribute(
        'aria-expanded',
      );
      if (expanded !== 'true') {
        await disclosure.click();
      }
    }

    const tempoUp = page.getByRole('button', {
      name: 'Increase tempo',
      exact: true,
    });
    await expect.element(tempoUp).toBeVisible();
    await tempoUp.click();
    await waitFor(() => p.getEffectsConfig().tempo === 101, 3000);
    await sleep(100);
    const afterTempo = p.getEffectsConfig().tempo;
    const tempoRate = p.getAudioElement().playbackRate;
    const tempoKept = preservesPitchOf(p.getAudioElement());
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case6-ui-tempo',
      JSON.stringify({
        selector: 'button[Increase tempo exact]',
        tempo: afterTempo,
        playbackRate: tempoRate,
        preservesPitch: tempoKept,
      }),
    );
    expect(afterTempo).toBe(101);
    expect(tempoRate).toBeCloseTo(1.01, 3);
    expect(tempoKept).toBe(true);

    const pitchUp = page.getByRole('button', {
      name: 'Raise pitch',
      exact: true,
    });
    await expect.element(pitchUp).toBeVisible();
    await pitchUp.click();
    await waitFor(() => p.getEffectsConfig().pitch === 1, 3000);
    await sleep(100);
    const afterPitch = p.getEffectsConfig().pitch;
    const pitchRate = p.getAudioElement().playbackRate;
    // eslint-disable-next-line no-console
    console.log(
      'TEMPO_PITCH_LIVE case6-ui-pitch',
      JSON.stringify({
        selector: 'button[Raise pitch exact]',
        pitch: afterPitch,
        playbackRate: pitchRate,
      }),
    );
    expect(afterPitch).toBe(1);
    // Pitch is independent of speed: the tempo-driven rate is untouched.
    expect(pitchRate).toBeCloseTo(1.01, 3);

    await expect
      .element(page.getByRole('slider', { name: 'Tempo, pitch preserved' }))
      .toBeVisible();
    await expect
      .element(page.getByRole('slider', { name: 'Pitch shift in semitones' }))
      .toBeVisible();

    await resetToNeutral(p);
  },
);
