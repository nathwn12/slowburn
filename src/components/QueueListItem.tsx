import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useCallback } from 'react';

import type { Track } from '../generated/typings';
import useFormattedDuration from '../hooks/useFormattedDuration';
import player from '../lib/player';
import Icon from './Icon';
import { useIsSavedLoop } from './saved-loops';

type Props = {
  index: number;
  track: Track;
  queueCursor: number;
};

export default function QueueListItem(props: Props) {
  const { track, index } = props;
  const { t } = useLingui();
  const duration = useFormattedDuration(track.duration);
  const savedLoop = useIsSavedLoop(track.id);

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: track.id,
      data: {
        type: 'queue-track',
      },
    });

  const itemStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const remove = useCallback(() => {
    // `player.removeFromQueue` takes an index RELATIVE to the cursor; this row
    // holds its absolute queue index for display.
    player.removeFromQueue(index - props.queueCursor - 1);
  }, [index, props.queueCursor]);

  const playNext = useCallback(() => {
    player.addNextInQueue([track]);
  }, [track]);

  const play = useCallback(async () => {
    await player.startFromQueue(index);
  }, [index]);

  return (
    <li
      {...attributes}
      ref={setNodeRef}
      style={itemStyle}
      onDoubleClick={play}
      role="option"
      aria-selected="false"
      data-track-id={track.id}
      {...listeners}
      {...stylex.props(styles.row)}
    >
      <span {...stylex.props(styles.idx)}>{index + 1}</span>
      <span {...stylex.props(styles.meta)}>
        <span {...stylex.props(styles.t1)}>{track.title}</span>
        <span {...stylex.props(styles.t2)}>
          {track.artists.join(', ')} · {track.album}
        </span>
      </span>
      <span {...stylex.props(styles.right)}>
        {savedLoop && (
          <span
            {...stylex.props(styles.pin)}
            title={t`Saved A-B loop`}
            aria-label={t`Saved A-B loop`}
          >
            ◆
          </span>
        )}
        <span {...stylex.props(styles.dur)}>{duration}</span>
        <button
          type="button"
          {...stylex.props(styles.action)}
          onClick={playNext}
          aria-label={t`Play next`}
          title={t`Play next`}
        >
          <Icon name="skipForward" size={12} />
        </button>
        <button
          type="button"
          {...stylex.props(styles.remove)}
          onClick={remove}
          aria-label={t`Remove from queue`}
          title={t`Remove from queue`}
        >
          &times;
        </button>
      </span>
    </li>
  );
}

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    minHeight: '40px',
    width: '100%',
    paddingInline: '10px',
    position: 'relative',
    cursor: 'pointer',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
  },
  idx: {
    width: '20px',
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    color: 'var(--text-faint)',
  },
  meta: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  t1: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  t2: {
    display: 'block',
    marginTop: '1px',
    fontSize: '10.5px',
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '7px',
    flexShrink: 0,
  },
  pin: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '15px',
    height: '15px',
    borderRadius: '50%',
    backgroundColor: 'var(--pink-soft)',
    color: 'var(--deep-pink)',
    fontSize: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--pink-line)',
  },
  dur: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    color: 'var(--text-faint)',
    width: '38px',
    textAlign: 'right',
  },
  remove: {
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--danger)',
    },
    borderStyle: 'none',
    backgroundColor: 'transparent',
    width: '18px',
    height: '18px',
    lineHeight: 1,
    padding: 0,
    fontSize: '14px',
    textDecoration: 'none',
  },
  action: {
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--text-bright)',
    },
    borderStyle: 'none',
    backgroundColor: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    padding: 0,
    cursor: 'pointer',
  },
});
