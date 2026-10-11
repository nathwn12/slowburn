import { Trans } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useNavigate } from '@tanstack/react-router';

import Icon from './Icon';

/**
 * Empty state for the play-history surface. Follows the `QueueEmpty`
 * pattern: an icon, a one-line statement, a one-line explanation, and a
 * call to action back into the library. Shown when no track has a completed
 * play yet (`play_count` is 0 everywhere).
 */
export default function HistoryEmpty() {
  const navigate = useNavigate();

  return (
    <div {...stylex.props(styles.empty)}>
      <span {...stylex.props(styles.icon)} aria-hidden="true">
        <Icon name="list" size={28} />
      </span>
      <div {...stylex.props(styles.big)}>
        <Trans>No play history yet</Trans>
      </div>
      <div {...stylex.props(styles.small)}>
        <Trans>Tracks you finish playing will appear here, newest first.</Trans>
      </div>
      <button
        type="button"
        onClick={() => void navigate({ to: '/library' })}
        {...stylex.props(styles.cta)}
      >
        <Trans>Browse the library</Trans>
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
    minHeight: 0,
    overflowY: 'auto',
    textAlign: 'center',
    color: 'var(--text-faint)',
    padding: 'var(--space-5)',
  },
  icon: {
    color: 'var(--control-border)',
  },
  big: {
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  small: {
    fontSize: 'var(--text-xs)',
    lineHeight: 1.5,
    maxWidth: '320px',
    textWrap: 'balance',
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
