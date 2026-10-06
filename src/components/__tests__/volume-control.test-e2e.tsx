/**
 * Volume strip: percentage readout, mute-vs-zero, click-to-mute, wheel and
 * keyboard adjustment, and the removal of the old slider/thumb.
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

import { messages } from '../../translations/en.po';
import VolumeControl from '../VolumeControl';

const SMOOTHING_FACTOR = 2.5;
/** The inverse of `unsmoothifyVolume`: stored volume -> raw slider value. */
const smoothify = (value: number): number => value ** SMOOTHING_FACTOR;

const harness = vi.hoisted(() => ({
  state: { volume: 1, muted: false },
  player: {
    setVolume: vi.fn(),
    unmute: vi.fn(),
    toggleMute: vi.fn(),
  },
}));

vi.mock('../../lib/player', () => ({ default: harness.player }));
vi.mock('../../hooks/usePlayer', () => ({
  usePlayerState: (
    selector: (state: { volume: number; muted: boolean }) => unknown,
  ) => selector(harness.state),
}));

const bar = () => page.getByRole('button', { name: /Mute|Unmute/ });

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

test('renders the percentage readout', async () => {
  harness.state.volume = smoothify(0.42);
  await mount();
  await expect.element(page.getByText('42%')).toBeVisible();
});

test('renders 100% at maximum volume', async () => {
  harness.state.volume = 1;
  await mount();
  await expect.element(page.getByText('100%')).toBeVisible();
  expect(document.body.textContent).not.toContain('101%');
});

test('renders 0% when volume is zero and not muted', async () => {
  harness.state.volume = 0;
  harness.state.muted = false;
  await mount();
  await expect.element(page.getByText('0%')).toBeVisible();
  expect(bar().element().getAttribute('data-muted')).toBe('false');
  expect(bar().element().getAttribute('data-icon')).toBe('volumeOff');
});

test('distinguishes muted from zero volume', async () => {
  harness.state.volume = 0;
  harness.state.muted = false;
  await mount();
  const silentOpacity = getComputedStyle(bar().element()).opacity;

  await cleanup();

  harness.state.volume = 0;
  harness.state.muted = true;
  await mount();
  const mutedBar = bar().element();

  // Same readout (0%), different visual state: the muted marker and dimming.
  await expect.element(page.getByText('0%')).toBeVisible();
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

test('renders no slider role and no thumb element', async () => {
  await mount();
  expect(document.querySelector('[role="slider"]')).toBeNull();
  expect(document.querySelector('[data-museeks-action]')).toBeNull();
});

test('the wheel adjusts the volume and never scrolls the page', async () => {
  harness.state.volume = smoothify(0.5);
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // Prove the wheel TARGET is the comfortable hit area, not the visual fill:
  // the ref'd element is >=14px while the track inside it stays 4px tall.
  const visualTrack = element.firstElementChild as HTMLElement;
  expect(element.getBoundingClientRect().height).toBeGreaterThanOrEqual(14);
  expect(visualTrack.getBoundingClientRect().height).toBeLessThanOrEqual(4);

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
    expect(call[0]).toBeCloseTo(smoothify(0.51), 11);
  }
});

test('a sub-notch wheel event steps on the very first event', async () => {
  harness.state.volume = smoothify(0.5);
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // Trackpads, free-spinning wheels and high-resolution wheels report deltas
  // well below one 100px notch; the first one must still move exactly one step.
  const event = wheel(element, -10);

  expect(event.defaultPrevented).toBe(true);
  expect(harness.player.setVolume).toHaveBeenCalledTimes(1);
  expect(harness.player.setVolume.mock.calls[0]?.[0]).toBeCloseTo(
    smoothify(0.51),
    11,
  );
});

test('a continuous wheel gesture stays bounded and proportional, not a single step', async () => {
  harness.state.volume = smoothify(0.5);
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // A trackpad flick is a single gesture: 20 * 10px is two notches of travel,
  // so it must fire two bounded steps - not one (the rejected round-1
  // whole-gesture suppression) and not twenty.
  for (let i = 0; i < 20; i += 1) wheel(element, -10);

  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);
  for (const call of harness.player.setVolume.mock.calls) {
    expect(call[0]).toBeCloseTo(smoothify(0.51), 11);
  }
});

test('N rapid discrete notches yield N steps, not one for the whole roll', async () => {
  harness.state.volume = smoothify(0.5);
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
    expect(call[0]).toBeCloseTo(smoothify(0.51), 11);
  }
});

test('a direction reversal steps the new way immediately', async () => {
  harness.state.volume = smoothify(0.5);
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // A sub-notch down-scroll followed by an immediate overshoot back up: the
  // reversal must step down then up, never swallow the correction.
  wheel(element, 10);
  wheel(element, -10);

  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);
  expect(harness.player.setVolume.mock.calls[0]?.[0]).toBeCloseTo(
    smoothify(0.49),
    11,
  );
  expect(harness.player.setVolume.mock.calls[1]?.[0]).toBeCloseTo(
    smoothify(0.51),
    11,
  );
});

test('the gesture re-arms after a quiet gap', async () => {
  harness.state.volume = smoothify(0.5);
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
    expect(call[0]).toBeCloseTo(smoothify(0.51), 11);
  }
});

test('sub-pixel jitter neither steps nor fakes a reversal', async () => {
  harness.state.volume = smoothify(0.5);
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
    expect(call[0]).toBeCloseTo(smoothify(0.51), 11);
  }
});

test('a deliberate slow scroll steps on every event', async () => {
  harness.state.volume = smoothify(0.5);
  harness.state.muted = false;
  await mount();

  const element = bar().element();
  // A deliberate, discrete scroll - each event spaced past the gesture gap - is
  // intended to step on every event (the original "delay before it works"
  // complaint): ten 1px events are ten steps, not one accumulation.
  for (let i = 0; i < 10; i += 1) wheel(element, -1, 250);

  expect(harness.player.setVolume).toHaveBeenCalledTimes(10);
  for (const call of harness.player.setVolume.mock.calls) {
    expect(call[0]).toBeCloseTo(smoothify(0.51), 11);
  }
});

test('a long sub-notch stream stays proportional, not a single step', async () => {
  harness.state.volume = smoothify(0.5);
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
  harness.state.volume = smoothify(0.5);
  harness.state.muted = false;
  await mount();

  bar().element().focus();

  await userEvent.keyboard('{ArrowRight}');
  expect(harness.player.setVolume).toHaveBeenCalledTimes(1);
  expect(harness.player.setVolume.mock.calls[0]?.[0]).toBeCloseTo(
    smoothify(0.51),
    11,
  );

  await userEvent.keyboard('{ArrowDown}');
  expect(harness.player.setVolume).toHaveBeenCalledTimes(2);
  expect(harness.player.setVolume.mock.calls[1]?.[0]).toBeCloseTo(
    smoothify(0.49),
    11,
  );
});
