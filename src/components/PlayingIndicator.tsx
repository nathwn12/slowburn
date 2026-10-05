import * as stylex from '@stylexjs/stylex';

const eq = stylex.keyframes({
  '0%, 100%': { transform: 'scaleY(.45)' },
  '50%': { transform: 'scaleY(1)' },
});

const noMotion = '@media (prefers-reduced-motion: no-preference)';

/**
 * The playing indicator: the four-bar brand motif, magenta. Decorative
 * (`aria-hidden`) so it never competes with the transport's single Play/Pause
 * control. Motion is gated on `prefers-reduced-motion`.
 */
export default function PlayingIndicator() {
  return (
    <span {...stylex.props(styles.bars)} aria-hidden="true">
      <span {...stylex.props(styles.bar, styles.bar1)} />
      <span {...stylex.props(styles.bar, styles.bar2)} />
      <span {...stylex.props(styles.bar, styles.bar3)} />
      <span {...stylex.props(styles.bar, styles.bar4)} />
    </span>
  );
}

const styles = stylex.create({
  bars: {
    display: 'inline-flex',
    alignItems: 'flex-end',
    columnGap: '1.5px',
    height: '12px',
    width: '14px',
  },
  bar: {
    width: '2px',
    backgroundColor: 'var(--accent)',
    borderRadius: '1px',
    transformOrigin: 'bottom',
    animationName: {
      [noMotion]: eq,
    },
    animationDuration: {
      [noMotion]: '.9s',
    },
    animationTimingFunction: {
      [noMotion]: 'ease-in-out',
    },
    animationIterationCount: {
      [noMotion]: 'infinite',
    },
  },
  bar1: {
    height: '5px',
  },
  bar2: {
    height: '11px',
    animationDelay: {
      [noMotion]: '.18s',
    },
  },
  bar3: {
    height: '7px',
    animationDelay: {
      [noMotion]: '.36s',
    },
  },
  bar4: {
    height: '12px',
    animationDelay: {
      [noMotion]: '.54s',
    },
  },
});
