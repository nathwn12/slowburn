import { Trans } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useNavigate } from '@tanstack/react-router';

import Icon from './Icon';

export default function QueueEmpty(props: { compact?: boolean }) {
  const { compact = false } = props;
  const navigate = useNavigate();

  return (
    <div {...stylex.props(styles.empty, compact && styles.compact)}>
      <span {...stylex.props(styles.icon)} aria-hidden="true">
        <Icon name="list" size={28} />
      </span>
      <div {...stylex.props(styles.big)}>
        <Trans>Queue is empty</Trans>
      </div>
      <div {...stylex.props(styles.small)}>
        <Trans>
          Import music to get started. Saved A-B loops, speed and reverb
          settings are remembered per file.
        </Trans>
      </div>
      <button
        type="button"
        onClick={() => void navigate({ to: '/library' })}
        {...stylex.props(styles.cta)}
      >
        <Trans>Add tracks to queue</Trans>
      </button>
    </div>
  );
}

const styles = stylex.create({
  empty: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 'var(--space-2)',
    height: '100%',
    textAlign: 'center',
    color: 'var(--text-faint)',
    padding: 'var(--space-5)',
  },
  icon: {
    color: 'var(--control-border)',
  },
  compact: {
    flexGrow: 0,
    flexShrink: 0,
    height: 'auto',
    padding: 'var(--space-3)',
    rowGap: 'var(--space-1)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
  },
  big: {
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  small: {
    fontSize: 'var(--text-xs)',
    lineHeight: 1.5,
    maxWidth: '230px',
  },
  cta: {
    marginTop: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-bright)',
    backgroundColor: 'var(--surface-hover)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius)',
    paddingBlock: '6px',
    paddingInline: 'var(--space-3)',
    cursor: 'pointer',
  },
});
