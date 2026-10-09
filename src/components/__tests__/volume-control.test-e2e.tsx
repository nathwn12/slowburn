/**
 * Minimal volume: a constantly visible STANDING hair-thin fill bar beside the
 * mute icon button (it grows bottom-to-top at a constant width), and a
 * transient percentage flash that appears only while the value changes (never
 * pinned). No thumb, no accent ring, no popover.
 *
 * Single-domain: player state, the persisted `audio_volume`, and this slider
 * are all the LINEAR level; the perceptual curve lives in the player alone.
 * The component must therefore hand linear values to `player.setVolume` -
 * never the curved gain (the 2026-10-09 drift: stored values were gains of
 * exact percents, re-curved on every path).
 *
 * Silent by construction: `player` and `usePlayerState` are mocked, so rendering
 * this component never builds an audio graph. The browser is launched with
 * `--mute-audio` (vitest.config.ts) as a second layer.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';
import { cleanup, render } from 'vitest-browser-react';

import { smoothifyVolume, unsmoothifyVolume } from '../../lib/volume-curve';
import { messages } from '../../translations/en.po';
import VolumeControl from '../VolumeControl';

const harness = vi.hoisted(() => ({
  state: { volume: 1, muted: false },
  player: {
    setVolume: vi.fn<(volume: number) => void>(),
    unmute: vi.fn<() => Promise<void>>(),
    toggleMute: vi.fn<() => Promise<void>>(),
  },
}));

vi.mock('../../lib/player', () => ({ default: harness.player }));
vi.mock('../../hooks/usePlayer', () => ({
  usePlayerState: (
    selector: (state: { volume: number; muted: boolean }) => unknown,
  ) => selector(harness.state),
}));

const bar = () => page.getByRole('button', { name: /Mute|Unmute/ });

/** Polling helper for asserting disappearance (the repo's e2e convention). */
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

/**
 * Monotonic synthetic wheel clock. The gesture boundary is read from the
 * event's own `timeStamp`, so stamping each event makes the boundary
 * deterministic instead of wall-clock dependent (which flakes under CI load).
 * Reset per test in `beforeEach`.
 */
let wheelStamp = 0;

/**
 * Fires one wheel event of `deltaY` px on the strip. `gapMs` is how far the
 * synthetic clock advances since the previous event: keep it below the gesture
 * gap for events inside one gesture, raise it above to start a new gesture.
 * Returns the event so callers can assert `defaultPrevented`.
 */
const wheel = (
  element: HTMLElement | SVGElement,
  deltaY: number,
  gapMs = 20,
): WheelEvent => {
  wheelStamp += gapMs;
  const event = new WheelEvent('wheel', {
    deltaY,
    deltaMode: 0,
    bubbles: true,
    cancelable: true,
  });
  // `WheelEvent.timeStamp` is a prototype getter; define an own value so the
  // hook's gesture boundary follows our clock, not real elapsed time.
  Object.defineProperty(event, 'timeStamp', {
    value: wheelStamp,
    configurable: true,
  });
  element.dispatchEvent(event);
  return event;
};

const mount = () =>
  render(
    <I18nProvider i18n={i18n}>
      <VolumeControl />
    </I18nProvider>,
  );

/**
 * The mocked `usePlayerState` is a static snapshot per render; `rerender`
 * re-renders the same instance without remounting it - the only way to drive
 * the transient flash, which fires on value *change*.
 */
const liveTree = () => (
  <I18nProvider i18n={i18n}>
    <VolumeControl />
  </I18nProvider>
);

const mountLive = () => render(liveTree());

/** Point the mock store at new values, then re-render without remounting. */
const restate = async (
  screen: Awaited<ReturnType<typeof mountLive>>,
  volume: number,
  muted: boolean,
) => {
  harness.state.volume = volume;
  harness.state.muted = muted;
  await screen.rerender(liveTree());
};

beforeEach(() => {
  i18n.load('en', messages);
  i18n.activate('en');
  vi.clearAllMocks();
  wheelStamp = 0;
  harness.state.volume = 1;
  harness.state.muted = false;
});

afterEach(async () => {
  await cleanup();
});

test('pins no percentage on mount', async () => {
  harness.state.volume = 0.42;
  await mountLive();
  // A static mount is the "unchanged" state: fill bar visible at rest, but no
  // flash and no pinned percentage.
  expect(document.body.textContent).not.toContain('42%');
  expect(document.querySelector('[role="status"]')).toBeNull();
  const slider = page.getByRole('slider', { name: 'Volume' });
  await expect.element(slider).toBeVisible();
});

test('flashes the percentage while the value changes, then clears it', async () => {
  harness.state.volume = 0.5;
  const screen = await mountLive();
  await restate(screen, 0.42, false);
  const flash = page.getByRole('status');
  await expect.element(flash).toBeVisible();
  expect(flash.element().textContent).toBe('42%');
  // Transient, never pinned: it clears itself shortly after (polled, since
  // the framework's element assertions require the node to resolve).
  await waitFor(() => document.querySelector('[role="status"]') == null, 5000);
});

test('flashes 100% at maximum volume', async () => {
  harness.state.volume = 0.5;
  const screen = await mountLive();
  await restate(screen, 1, false);
  await expect.element(page.getByText('100%')).toBeVisible();
  expect(document.body.textContent).not.toContain('101%');
});

test('flashes 0% when the volume hits zero while unmuted', async () => {
  harness.state.volume = 0.5;
  const screen = await mountLive();
  await restate(screen, 0, false);
  await expect.element(page.getByText('0%')).toBeVisible();
  expect(bar().element().getAttribute('data-muted')).toBe('false');
  expect(bar().element().getAttribute('data-icon')).toBe('volumeOff');
});

test('distinguishes muted from zero volume', async () => {
  harness.state.volume = 0.5;
  const screen = await mountLive();
  await restate(screen, 0, false);
  await expect.element(page.getByText('0%')).toBeVisible();
  const silentOpacity = getComputedStyle(bar().element()).opacity;

  await restate(screen, 0, true);
  const mutedBar = bar().element();

  // Same level (0%), different visual state: the muted marker, dimming, and
  // a flash that reads Muted instead of 0%.
  await expect.element(page.getByText('Muted')).toBeVisible();
  expect(mutedBar.getAttribute('data-muted')).toBe('true');
  expect(mutedBar.getAttribute('data-icon')).toBe('volumeMute');
  expect(getComputedStyle(mutedBar).opacity).toBe('0.6');
  expect(silentOpacity).toBe('1');
});

test('calls toggleMute when the bar is clicked', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();
  await bar().click();
  expect(harness.player.toggleMute).toHaveBeenCalledTimes(1);
});

test('the fill bar is constantly visible with no interaction', async () => {
  harness.state.volume = 0.42;
  await mountLive();
  // No hover, no focus, no click: the bar renders at rest and fills to the
  // current level.
  const slider = page.getByRole('slider', { name: 'Volume' });
  await expect.element(slider).toBeVisible();
  expect(slider.element().getAttribute('aria-valuemax')).toBe('100');
  expect(slider.element().getAttribute('aria-valuenow')).toBe('42');
  expect(slider.element().getAttribute('aria-valuetext')).toBe('42%');
  expect(document.querySelector('[role="status"]')).toBeNull();
  expect(document.querySelector('[data-museeks-action]')).toBeNull();
});

test('the standing bar grows bottom-to-top at a constant width', async () => {
  harness.state.volume = 0.25;
  const screen = await mountLive();
  const slider = page.getByRole('slider', { name: 'Volume' });
  await expect.element(slider).toBeVisible();
  // No test ids by repo convention: the slider's first child is the track,
  // and the track's first child is the fill.
  const track = () => slider.element().firstElementChild as HTMLElement;
  const range = () => track().firstElementChild as HTMLElement;

  const lowTrack = track().getBoundingClientRect();
  const lowRange = range().getBoundingClientRect();
  // The fill fraction tracks the level, anchored at the bottom edge, spanning
  // the full thin width.
  expect(lowRange.height / lowTrack.height).toBeCloseTo(0.25, 1);
  expect(lowRange.bottom).toBeCloseTo(lowTrack.bottom, 0);
  expect(lowRange.width).toBeCloseTo(lowTrack.width, 1);

  await restate(screen, 0.75, false);
  const highTrack = track().getBoundingClientRect();
  const highRange = range().getBoundingClientRect();
  expect(highRange.height / highTrack.height).toBeCloseTo(0.75, 1);
  expect(highRange.bottom).toBeCloseTo(highTrack.bottom, 0);
  // Standing, not stretching: the width never changes with the level.
  expect(highTrack.width).toBeCloseTo(lowTrack.width, 1);
  expect(highRange.width).toBeCloseTo(lowRange.width, 1);
  // And it grew from the bottom: taller, with a higher top edge.
  expect(highRange.height).toBeGreaterThan(lowRange.height);
  expect(highRange.top).toBeLessThan(lowRange.top);
});

test('the fill bar renders no thumb and no accent ring', async () => {
  harness.state.volume = 0.42;
  await mountLive();
  const slider = page.getByRole('slider', { name: 'Volume' });
  await expect.element(slider).toBeVisible();
  // No thumb element anywhere inside or beside the slider.
  expect(
    document.querySelector(
      '[data-thumb],[data-testid="thumb"],[class*="thumb"]',
    ),
  ).toBeNull();
  expect(slider.element().querySelectorAll('*').length).toBe(2);
  // No accent ring: the slider carries no focus-ring / outline / glow hook.
  const outline = getComputedStyle(slider.element()).outlineStyle;
  expect(outline === 'none' || outline === '').toBe(true);
  expect(
    getComputedStyle(slider.element().firstElementChild as Element).boxShadow,
  ).toBe('none');
});

test('hands the linear level to persistence: no curve in the component', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  const screen = await mountLive();

  wheel(bar().element(), -100);
  // One notch up from 50% persists 51% verbatim - never the curved gain.
  expect(harness.player.setVolume).toHaveBeenCalledTimes(1);
  const saved = Number(harness.player.setVolume.mock.calls[0]?.[0]);
  expect(saved).toBeCloseTo(0.51, 11);
  expect(saved).not.toBeCloseTo(smoothifyVolume(0.51), 4);

  // Simulate the reload: the persisted level feeds straight back into state
  // and reads as the same percentage (the player persists its argument
  // verbatim and keeps state linear, so save -> reload is exact).
  await restate(screen, saved, false);
  await expect.element(page.getByText('51%')).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Volume' });
  expect(slider.element().getAttribute('aria-valuenow')).toBe('51');
});

test('the perceptual curve round-trips and pins the reported drift fixtures', () => {
  // Identity: curving for the audio stage and back restores the level.
  for (const level of [0, 0.01, 0.39, 0.5, 0.53, 0.75, 0.99, 1]) {
    expect(unsmoothifyVolume(smoothifyVolume(level))).toBeCloseTo(level, 12);
  }
  // 2026-10-09 drift report: the stored values were curved gains of exact
  // slider percents (53/75/100/39%) - the curve had leaked into persistence.
  // These pin the factor, so a silent curve change cannot reinterpret levels.
  expect(smoothifyVolume(0.53)).toBeCloseTo(0.20449828, 7);
  expect(smoothifyVolume(0.75)).toBeCloseTo(0.48713928, 7);
  expect(smoothifyVolume(1)).toBe(1);
  expect(smoothifyVolume(0.39)).toBeCloseTo(0.09498642, 7);
});

// Residual (named, 2026-10-09): Escape-dismissal of the popover is not
// asserted here. It passes in isolation (~33ms) but fails in full-file runs:
// after an earlier test's real click parks the mouse over the button, an
// Escape keydown (userEvent and direct dispatch alike) leaves `open` true on
// a proven single attached mount. Design question deferred by the owner;
// revisit with the volume-design decision.

test('the wheel adjusts the volume and never scrolls the page', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // The wheel listener lives on the row container; a wheel over the mute
  // button bubbles to it, so the comfortable hit target is the button itself.
  expect(element.tagName).toBe('BUTTON');

  // Two discrete notches in one gesture: each is its own step. A whole-gesture
  // suppression window (the rejected round-1 mechanism) would collapse the
  // second notch and only one `setVolume` call would be seen.
  const first = wheel(element, -100);
  const second = wheel(element, -100);

  // Each step is up (+1% from 0.50), and the default scroll is prevented.
  expect(first.defaultPrevented).toBe(true);
  expect(second.defaultPrevented).toBe(true);
  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);
  for (const call of harness.player.setVolume.mock.calls) {
    expect(call[0]).toBeCloseTo(0.51, 11);
  }
});

test('a sub-notch wheel event steps on the very first event', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // Trackpads, free-spinning wheels and high-resolution wheels report deltas
  // well below one 100px notch; the first one must still move exactly one step.
  const event = wheel(element, -10);

  expect(event.defaultPrevented).toBe(true);
  expect(harness.player.setVolume).toHaveBeenCalledTimes(1);
  expect(harness.player.setVolume.mock.calls[0]?.[0]).toBeCloseTo(0.51, 11);
});

test('a continuous wheel gesture stays bounded and proportional, not a single step', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // A trackpad flick is a single gesture: 20 * 10px is two notches of travel,
  // so it must fire two bounded steps - not one (the rejected round-1
  // whole-gesture suppression) and not twenty.
  for (let i = 0; i < 20; i += 1) wheel(element, -10);

  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);
  for (const call of harness.player.setVolume.mock.calls) {
    expect(call[0]).toBeCloseTo(0.51, 11);
  }
});

test('N rapid discrete notches yield N steps, not one for the whole roll', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // A fast mouse roll is three separate notches, each dispatched back-to-back.
  // The old gesture window collapsed them into a single step.
  wheel(element, -100);
  wheel(element, -100);
  wheel(element, -100);

  expect(harness.player.setVolume).toHaveBeenCalledTimes(3);
  // Every step is up (+1% from 0.50): a direction bug would report 0.49.
  for (const call of harness.player.setVolume.mock.calls) {
    expect(call[0]).toBeCloseTo(0.51, 11);
  }
});

test('a direction reversal steps the new way immediately', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // A sub-notch down-scroll followed by an immediate overshoot back up: the
  // reversal must step down then up, never swallow the correction.
  wheel(element, 10);
  wheel(element, -10);

  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);
  expect(harness.player.setVolume.mock.calls[0]?.[0]).toBeCloseTo(0.49, 11);
  expect(harness.player.setVolume.mock.calls[1]?.[0]).toBeCloseTo(0.51, 11);
});

test('the gesture re-arms after a quiet gap', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // Two notches of travel inside one gesture: two steps (a whole-gesture
  // suppression window would collapse this to one).
  for (let i = 0; i < 20; i += 1) wheel(element, -10);
  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);

  // Advance the synthetic clock past the gesture gap: the next lone sub-notch
  // event must step on its own. Without the re-arm the first-event allowance
  // would still be spent and that event would be swallowed.
  wheel(element, -10, 250);
  expect(harness.player.setVolume).toHaveBeenCalledTimes(3);
  for (const call of harness.player.setVolume.mock.calls) {
    expect(call[0]).toBeCloseTo(0.51, 11);
  }
});

test('sub-pixel jitter neither steps nor fakes a reversal', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // A real notch, then sub-pixel trackpad jitter, then a real notch. Without
  // the floor the two jitter events read as a reversal and a re-reversal,
  // producing four steps; with it, only the two real notches step.
  wheel(element, -100);
  wheel(element, 0.1);
  wheel(element, -0.1);
  wheel(element, -100);

  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);
  for (const call of harness.player.setVolume.mock.calls) {
    expect(call[0]).toBeCloseTo(0.51, 11);
  }
});

test('a deliberate slow scroll steps on every event', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // A deliberate, discrete scroll - each event spaced past the gesture gap - is
  // intended to step on every event (the original "delay before it works"
  // complaint): ten 1px events are ten steps, not one accumulation.
  for (let i = 0; i < 10; i += 1) wheel(element, -1, 250);

  expect(harness.player.setVolume).toHaveBeenCalledTimes(10);
  for (const call of harness.player.setVolume.mock.calls) {
    expect(call[0]).toBeCloseTo(0.51, 11);
  }
});

test('a long sub-notch stream stays proportional, not a single step', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // Fifteen trackpad deltas of 10px are 1.5 notches of travel. This must not
  // collapse to one step (whole-gesture suppression) nor fire a burst.
  for (let i = 0; i < 15; i += 1) wheel(element, -10);

  const calls = harness.player.setVolume.mock.calls.length;
  expect(calls).toBeGreaterThanOrEqual(2);
  expect(calls).toBeLessThanOrEqual(3);
});

test('arrow keys adjust the volume when the bar is focused', async () => {
  harness.state.volume = 0.5;
  harness.state.muted = false;
  await mount();

  bar().element().focus();

  await userEvent.keyboard('{ArrowRight}');
  expect(harness.player.setVolume).toHaveBeenCalledTimes(1);
  expect(harness.player.setVolume.mock.calls[0]?.[0]).toBeCloseTo(0.51, 11);

  await userEvent.keyboard('{ArrowDown}');
  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);
  expect(harness.player.setVolume.mock.calls[1]?.[0]).toBeCloseTo(0.49, 11);
});
