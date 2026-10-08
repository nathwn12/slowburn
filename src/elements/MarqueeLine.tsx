import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';

type Props = {
  /** The complete string. Rendered verbatim, so the accessible name is whole. */
  text: string;
  /** Typography for the line (font, size, colour, line-height). Overflow
      mechanics stay here; never pass whiteSpace/overflow/textOverflow. */
  xstyle?: stylex.CompiledStyles;
  /** Stable test seam, e.g. `np-title`. */
  testId?: string;
};

/** Pauses (ms) at each end of a hover reveal before travelling. */
const END_PAUSE_MS = 450;
/** Travel speed floor/ceiling (ms) so short overflows feel calm, not jumpy. */
const MIN_TRAVEL_MS = 1200;
const MAX_TRAVEL_MS = 6000;
/** Pixels per second of reveal travel. */
const PX_PER_SECOND = 30;

/**
 * A single-line overflow label: ellipsis by default, with the block height
 * fixed by the caller's line-height (no wrap, ever), and the full string
 * always on `title`.
 *
 * When - and only when - the text actually overflows, hovering the line
 * gently scrolls it to reveal the rest, pausing briefly at each end. Text
 * that fits never moves. `prefers-reduced-motion` disables
 * the reveal entirely (plain ellipsis + tooltip).
 */
export default function MarqueeLine({ text, xstyle, testId }: Props) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const travelTimer = useRef<number | null>(null);
  const [overflows, setOverflows] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  // Measure overflow (scrollWidth vs clientWidth) on mount, text change, and
  // any resize of the line itself. Never animate text that fits.
  useEffect(() => {
    const outer = outerRef.current;
    if (outer == null) return;
    const measure = () => {
      setOverflows(outer.scrollWidth > outer.clientWidth + 1);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [text]);

  // Track the reduced-motion preference live, so a mid-session toggle applies
  // without a reload.
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // A pending reveal must never fire after unmount or after the pointer left.
  useEffect(
    () => () => {
      if (travelTimer.current != null) {
        window.clearTimeout(travelTimer.current);
      }
    },
    [],
  );

  const cancelTravel = () => {
    if (travelTimer.current != null) {
      window.clearTimeout(travelTimer.current);
      travelTimer.current = null;
    }
    const inner = innerRef.current;
    if (inner != null) {
      inner.style.transition = 'transform 250ms ease';
      inner.style.transform = 'translateX(0)';
    }
    setRevealing(false);
  };

  const beginTravel = () => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (outer == null || inner == null) return;
    if (!overflows || reducedMotion) return;
    const distance = outer.scrollWidth - outer.clientWidth;
    if (distance <= 0) return;
    if (travelTimer.current != null) {
      window.clearTimeout(travelTimer.current);
    }
    const travelMs = Math.min(
      MAX_TRAVEL_MS,
      Math.max(MIN_TRAVEL_MS, (distance / PX_PER_SECOND) * 1000),
    );
    setRevealing(true);
    travelTimer.current = window.setTimeout(() => {
      inner.style.transition = `transform ${Math.round(travelMs)}ms linear`;
      inner.style.transform = `translateX(${-distance}px)`;
    }, END_PAUSE_MS);
  };

  return (
    <div
      ref={outerRef}
      {...stylex.props(styles.outer, xstyle)}
      title={text}
      data-testid={testId}
      data-overflowing={overflows ? 'true' : 'false'}
      data-revealing={revealing ? 'true' : 'false'}
      onMouseEnter={beginTravel}
      onMouseLeave={cancelTravel}
    >
      <span ref={innerRef} {...stylex.props(styles.inner)}>
        {text}
      </span>
    </div>
  );
}

const styles = stylex.create({
  outer: {
    display: 'block',
    minWidth: 0,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  inner: {
    display: 'inline-block',
    maxWidth: 'none',
    willChange: 'transform',
    transitionProperty: 'transform',
    // The reveal is JS-gated on the media query too; this is the belt and
    // braces so no transition ever runs under reduced motion.
    transitionDuration: {
      default: '250ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionTimingFunction: 'ease',
  },
});
