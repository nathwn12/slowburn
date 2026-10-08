import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  /** Right-aligned header slot, e.g. a Toggle or link */
  actions?: ReactNode;
  xstyle?: stylex.CompiledStyles;
};

/**
 * Labelled settings/content block: small semibold header row over children.
 */
export default function Section(props: Props) {
  const { title, children, actions, xstyle } = props;

  return (
    <section {...stylex.props(styles.section, xstyle)}>
      <header {...stylex.props(styles.header)}>
        <h2 {...stylex.props(styles.title)}>{title}</h2>
        {actions}
      </header>
      <div>{children}</div>
    </section>
  );
}

const styles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: 'var(--space-2)',
    minWidth: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 'var(--space-2)',
    minHeight: 'var(--row-compact)',
  },
  title: {
    margin: 0,
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--text-dim)',
  },
});
