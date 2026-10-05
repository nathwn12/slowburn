import { useCallback, useRef } from 'react';

/**
 * One Burn/volume unit: 0.01× for Slow, 1% for Reverb and Volume.
 *
 * Single source of truth for every 1-unit mover — the Burn steppers, the
 * sliders' arrow keys and the scroll wheel all resolve their increment here.
 */
export const STEP = 0.01;
/** Reverb/volume are expressed in percent, so their unit is 100 × STEP. */
export const REVERB_STEP = STEP * 100;

/**
 * Pixels in one physical mouse-wheel notch. Chromium reports a mouse wheel as
 * `deltaMode: 0` with `deltaY` ≈ 100; lines are ~3 per notch. Trackpads emit
 * many small pixel deltas, so we accumulate in notch units rather than stepping
 * per raw event.
 */
const PIXELS_PER_NOTCH = 100;
const LINES_PER_NOTCH = 3;

/**
 * Tolerance for the notch accumulator: ten trackpad deltas of `10px` sum to
 * `0.9999999999999999`, so a bare floor would swallow the tenth.
 */
const NOTCH_EPSILON = 1e-6;

function toNotches(deltaY: number, deltaMode: number): number {
  switch (deltaMode) {
    case 1:
      return deltaY / LINES_PER_NOTCH;
    case 2:
      return deltaY;
    default:
      return deltaY / PIXELS_PER_NOTCH;
  }
}

/**
 * Turns a wheel over a slider into whole steps. The returned callback ref goes
 * on the slider's `Control` element:
 *
 *  - the listener is non-passive and `preventDefault()`s, so a wheel over the
 *    slider never scrolls the page; a wheel elsewhere is untouched;
 *  - deltas are normalised and accumulated, so one notch is exactly one step
 *    and a trackpad flick cannot race the value to the end;
 *  - `onSteps` is called with whole steps only; the caller must route them
 *    through the same setter (clamp + round) as the steppers and the drag.
 *
 * A callback ref is used on purpose: it detaches the previous listener before
 * attaching, so a re-run can never leave two handlers accumulating in parallel.
 */
export function useWheelStep(
  onSteps: (steps: number) => void,
  enabled = true,
): (element: HTMLDivElement | null) => void {
  const accumulator = useRef(0);
  const callback = useRef(onSteps);
  callback.current = onSteps;
  const detach = useRef<(() => void) | null>(null);

  return useCallback(
    (element: HTMLDivElement | null) => {
      detach.current?.();
      detach.current = null;

      if (element == null || !enabled) return;

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        // Wheel UP reports a negative deltaY; the convention (AIMP included)
        // is wheel-up = value up, so flip the sign here. One notch up = +1 step.
        accumulator.current += toNotches(-event.deltaY, event.deltaMode);
        const raw = accumulator.current;
        const steps =
          raw >= 0
            ? Math.floor(raw + NOTCH_EPSILON)
            : Math.ceil(raw - NOTCH_EPSILON);
        if (steps === 0) return;
        accumulator.current = raw - steps;
        callback.current(steps);
      };

      element.addEventListener('wheel', onWheel, { passive: false });
      detach.current = () => {
        element.removeEventListener('wheel', onWheel);
      };
    },
    [enabled],
  );
}
