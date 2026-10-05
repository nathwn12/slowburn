import { Trans } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import Icon from './Icon';

export default function QueueEmpty() {
  return (
    <div {...stylex.props(styles.empty)}>
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
    rowGap: '8px',
    height: '100%',
    textAlign: 'center',
    color: 'var(--text-faint)',
    padding: '24px',
  },
  icon: {
    color: '#4a4a4a',
  },
  big: {
    fontSize: '12.5px',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  small: {
    fontSize: '11px',
    lineHeight: 1.5,
    maxWidth: '230px',
  },
});
