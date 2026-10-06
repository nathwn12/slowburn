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
 * Quiet gap that ends a wheel gesture. Trackpads and free-spinning wheels
 * stream events a few milliseconds apart; a deliberate second turn, or a finger
 * lifted and re-placed, comes after a longer pause. Events closer together than
 * this belong to the same gesture.
 */
const GESTURE_GAP_MS = 200;

/**
 * Tolerance for the notch accumulator: ten trackpad deltas of `10px` sum to
 * `0.9999999999999999`, so a bare floor would swallow the tenth.
 */
const NOTCH_EPSILON = 1e-6;

/**
 * Sub-pixel wheel noise floor, in notch units (~= 0.2 px at the 100 px notch).
 * Trackpads emit a fraction-of-a-pixel delta before/after real travel; without a
 * floor such an event reads as a direction change and awards a spurious reversal
 * step. It is deliberately separate from `NOTCH_EPSILON` (the accumulator's
 * rounding tolerance, four orders of magnitude smaller): every deliberate scroll
 * delta is far above this floor, so a real turn is never ignored.
 */
const WHEEL_JITTER_EPSILON = 2e-3;

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
 *  - a discrete notch steps immediately and every notch steps, so a fast
 *    N-notch roll yields N steps instead of one;
 *  - a sub-notch event still steps on the first event of a gesture, so a
 *    trackpad or high-resolution wheel answers on the first turn instead of
 *    waiting to accumulate a whole notch (the original "delay before it works");
 *  - after that first step the remaining sub-notch travel is accumulated, so a
 *    long stream stays proportional to distance (one step per notch) instead of
 *    collapsing to a single step or firing a burst;
 *  - a direction change resets the accumulator and steps the new way at once, so
 *    an overshoot-and-correct gesture never has a dead zone;
 *  - sub-pixel jitter (below `WHEEL_JITTER_EPSILON`) is ignored entirely, so it
 *    can neither step nor fake a direction change;
 *  - a quiet gap (`GESTURE_GAP_MS`) ends the gesture: the accumulator and the
 *    first-step allowance re-arm, so a deliberate slow scroll steps on every
 *    event (intended - see the re-arm site);
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
  // Whether the current gesture has already answered its first event, so the
  // sub-notch "answer immediately" allowance only applies once per gesture.
  const steppedFirst = useRef(false);
  // Sign of the last event; 0 while no direction is set. Tracked separately from
  // the accumulator so a reversal is seen even when the accumulator sits at 0.
  const lastDirection = useRef(0);
  const lastEventAt = useRef(0);
  const callback = useRef(onSteps);
  callback.current = onSteps;
  const detach = useRef<(() => void) | null>(null);

  return useCallback(
    (element: HTMLDivElement | null) => {
      detach.current?.();
      detach.current = null;

      if (element == null || !enabled) return;

      const resetGesture = () => {
        accumulator.current = 0;
        steppedFirst.current = false;
        lastDirection.current = 0;
      };

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        // Wheel UP reports a negative deltaY; the convention (AIMP included)
        // is wheel-up = value up, so flip the sign here. One notch up = +1 step.
        const notches = toNotches(-event.deltaY, event.deltaMode);
        // Horizontal-only, zero, and sub-pixel jitter deltas carry no direction:
        // ignore them without opening, extending, or reversing a gesture. A
        // sub-floor event never steps, neither as a first-event step nor as a
        // reversal step.
        if (Math.abs(notches) < WHEEL_JITTER_EPSILON) return;

        // A pause ends the previous gesture. This is intentional: a slow,
        // discrete scroll (events spaced wider than GESTURE_GAP_MS) re-arms on
        // every event and so steps on every event. The owner's original
        // complaint was the "delay before it works", and a deliberate turn must
        // answer immediately; there is deliberately no rate limit or suppression
        // window beyond this gap.
        if (event.timeStamp - lastEventAt.current > GESTURE_GAP_MS) {
          resetGesture();
        }
        lastEventAt.current = event.timeStamp;

        const direction = notches > 0 ? 1 : -1;
        // ...and a reversal resets too, so we never keep stepping the stale way.
        if (direction !== lastDirection.current) {
          resetGesture();
          lastDirection.current = direction;
        }

        accumulator.current += notches;
        const raw = accumulator.current;
        let steps =
          raw >= 0
            ? Math.floor(raw + NOTCH_EPSILON)
            : Math.ceil(raw - NOTCH_EPSILON);

        if (steps === 0) {
          // The first event of a gesture answers immediately even below one
          // notch; consuming its travel keeps the rest proportional to distance.
          if (steppedFirst.current) return;
          steps = direction;
          accumulator.current = 0;
        } else {
          accumulator.current = raw - steps;
        }

        steppedFirst.current = true;
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
