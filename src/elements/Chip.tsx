import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Accent-tinted selected state */
  active?: boolean;
  onClick?: () => void;
  xstyle?: stylex.CompiledStyles;
};

/**
 * Small selectable pill for filters and toggles-row options.
 * Token-only: accent family for `active`, control border + text ramp idle.
 */
export default function Chip(props: Props) {
  const { children, active, onClick, xstyle } = props;

  // A chip without an action is not interactive: render an honest `<span>`
  // so screen readers and keyboards never meet a dead button.
  if (onClick === undefined) {
    return (
      <span
        {...stylex.props(
          styles.chip,
          active && styles.active,
          styles.static,
          xstyle,
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      {...stylex.props(styles.chip, active && styles.active, xstyle)}
    >
      {children}
    </button>
  );
}

const styles = stylex.create({
  chip: {
    borderRadius: 'var(--radius)',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: 'var(--control-border)',
    backgroundColor: 'var(--surface)',
    color: 'var(--text-dim)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    paddingBlock: 'var(--space-1)',
    paddingInline: 'var(--space-3)',
    minHeight: 'var(--row-compact)',
    cursor: 'pointer',
    boxSizing: 'border-box',
    opacity: {
      ':active': 0.7,
      ':disabled': 0.5,
    },
  },
  active: {
    backgroundColor: 'var(--accent-soft)',
    borderColor: 'var(--accent)',
    color: 'var(--accent-text)',
    boxShadow: 'var(--glow-hover)',
  },
  static: {
    cursor: 'default',
  },
});
