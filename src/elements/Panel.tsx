import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Raised one level above `--surface` (dialogs, popovers, cards) */
  elevated?: boolean;
  xstyle?: stylex.CompiledStyles;
};

/**
 * Card container: 10px panel radius, soft border, standard padding.
 */
export default function Panel(props: Props) {
  const { children, elevated, xstyle } = props;

  return (
    <div {...stylex.props(styles.panel, elevated && styles.elevated, xstyle)}>
      {children}
    </div>
  );
}

const styles = stylex.create({
  panel: {
    backgroundColor: 'var(--surface)',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-4)',
    boxSizing: 'border-box',
  },
  elevated: {
    backgroundColor: 'var(--surface-elevated)',
    boxShadow: 'var(--shadow-elevated)',
  },
});
