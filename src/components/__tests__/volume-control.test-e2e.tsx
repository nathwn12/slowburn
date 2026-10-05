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
  const event = new WheelEvent('wheel', {
    deltaY: -100,
    deltaMode: 0,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(event);

  // One notch up: 0.50 -> 0.51, and the default scroll is prevented.
  expect(event.defaultPrevented).toBe(true);
  expect(harness.player.setVolume).toHaveBeenCalledTimes(1);
  expect(harness.player.setVolume.mock.calls[0]?.[0]).toBeCloseTo(
    smoothify(0.51),
    11,
  );
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
