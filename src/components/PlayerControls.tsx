import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import { usePlayerState } from '../hooks/usePlayer';
import player from '../lib/player';
import Icon from './Icon';
import { useStopAfterCurrentStore } from './PlayerEvents';
import VolumeControl from './VolumeControl';

export default function PlayerControls() {
  const isPaused = usePlayerState((state) => state.isPaused);
  const shuffle = usePlayerState((state) => state.shuffle);
  const repeat = usePlayerState((state) => state.repeat);
  const stopAfterCurrent = useStopAfterCurrentStore((state) => state.armed);
  const toggleStopAfterCurrent = useStopAfterCurrentStore(
    (state) => state.toggle,
  );
  const { t } = useLingui();

  return (
    <div {...stylex.props(styles.transport)}>
      <button
        type="button"
        onClick={() => player.previous()}
        aria-label={t`Previous`}
        title={t`Previous`}
        {...stylex.props(styles.tbtn)}
      >
        <Icon name="skipBack" size={18} />
      </button>

      <button
        type="button"
        onClick={() => player.playPause()}
        aria-label={isPaused ? t`Play` : t`Pause`}
        title={isPaused ? t`Play` : t`Pause`}
        {...stylex.props(styles.tplay)}
      >
        <Icon name={isPaused ? 'play' : 'pause'} size={18} />
      </button>

      <button
        type="button"
        onClick={() => player.next()}
        aria-label={t`Next`}
        title={t`Next`}
        {...stylex.props(styles.tbtn)}
      >
        <Icon name="skipForward" size={18} />
      </button>

      <button
        type="button"
        onClick={() => player.stop()}
        aria-label={t`Stop`}
        title={t`Stop`}
        {...stylex.props(styles.tbtn)}
      >
        <span aria-hidden="true" {...stylex.props(styles.tstop)}>
          ■
        </span>
      </button>

      {/**
       * S5 stop-after-current: a permanently rendered (never a closed
       * dropdown) menu so the action is one press away and discoverable
       * without opening anything. Arming pauses at the end of the current
       * track instead of auto-advancing (see `PlayerEvents`).
       */}
      <div role="menu" aria-label={t`Stop options`}>
        <div
          role="menuitem"
          aria-label={t`Stop after current`}
          title={t`Stop after the current track instead of playing the next one`}
          data-on={stopAfterCurrent ? 'true' : 'false'}
          onClick={() => toggleStopAfterCurrent()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleStopAfterCurrent();
            }
          }}
          tabIndex={0}
          {...stylex.props(styles.tstopAfter, stopAfterCurrent && styles.on)}
        >
          {stopAfterCurrent
            ? t`Stop after current :white_check_mark:`
            : t`Stop after current`}
        </div>
      </div>

      <span {...stylex.props(styles.tsep)} aria-hidden="true" />

      <button
        type="button"
        onClick={() => player.toggleShuffle()}
        aria-label={t`Shuffle`}
        title={t`Shuffle`}
        aria-pressed={shuffle}
        {...stylex.props(styles.tbtn, styles.mode, shuffle && styles.modeOn)}
      >
        <Icon name="shuffle" size={16} />
      </button>

      <button
        type="button"
        onClick={() => player.toggleRepeat()}
        aria-label={t`Repeat`}
        title={t`Repeat`}
        aria-pressed={repeat !== 'None'}
        {...stylex.props(
          styles.tbtn,
          styles.mode,
          repeat !== 'None' && styles.modeOn,
        )}
      >
        <Icon name={repeat === 'One' ? 'repeatOne' : 'repeat'} size={16} />
      </button>

      <VolumeControl />
    </div>
  );
}

const styles = stylex.create({
  transport: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    minWidth: 0,
    columnGap: '6px',
    rowGap: '6px',
  },
  tbtn: {
    width: '28px',
    height: '28px',
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
    display: 'grid',
    placeItems: 'center',
    color: 'var(--text-dim)',
    borderStyle: 'none',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    transition: 'background-color .12s ease, color .12s ease',
  },
  mode: {
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
  },
  modeOn: {
    color: 'var(--accent)',
    backgroundColor: 'var(--pink-soft)',
  },
  tplay: {
    width: '38px',
    height: '34px',
    flexShrink: 0,
    borderRadius: '9999px',
    display: 'grid',
    placeItems: 'center',
    color: '#fff',
    borderStyle: 'none',
    backgroundImage:
      'linear-gradient(180deg, var(--accent) 0%, var(--accent-hover) 100%)',
    boxShadow: '0 3px 10px rgba(255, 20, 147, .35)',
    transition: 'filter .12s ease, transform .08s ease',
    filter: {
      ':hover': 'brightness(1.08)',
    },
    transform: {
      ':active': 'translateY(1px)',
    },
  },
  tsep: {
    width: '1px',
    height: '20px',
    flexShrink: 0,
    backgroundColor: 'var(--border-soft)',
    marginBlock: 0,
    marginInline: '3px',
  },
  tstop: {
    fontSize: '11px',
    lineHeight: 1,
  },
  tstopAfter: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '22px',
    paddingInline: '8px',
    borderRadius: 'var(--radius-sm)',
    fontSize: '10px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    color: 'var(--text-faint)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
  },
  on: {
    color: 'var(--accent)',
    backgroundColor: 'var(--pink-soft)',
  },
});
