import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useCallback, type KeyboardEvent } from 'react';

import type { Track } from '../generated/typings';
import useFormattedDuration from '../hooks/useFormattedDuration';
import player from '../lib/player';
import Icon from './Icon';
import { useIsSavedLoop } from './saved-loops';

type Props = {
  index: number;
  track: Track;
  queueCursor: number;
  selected: boolean;
  tabIndex: number;
  onSelect: (trackId: string) => void;
};

export default function QueueListItem(props: Props) {
  const { track, index, selected, tabIndex, onSelect } = props;
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

  const select = useCallback(() => {
    onSelect(track.id);
  }, [onSelect, track.id]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void play();
      }
    },
    [play],
  );

  return (
    <li
      {...attributes}
      ref={setNodeRef}
      style={itemStyle}
      onClick={select}
      onDoubleClick={play}
      onKeyDown={onKeyDown}
      role="option"
      aria-selected={selected}
      tabIndex={tabIndex}
      data-track-id={track.id}
      {...stylex.props(styles.row, selected && styles.rowSelected)}
    >
      {/*
       * The drag handle owns the sortable listeners: a click-to-select on
       * the row body never starts a drag.
       */}
      <span
        {...listeners}
        {...stylex.props(styles.idx, styles.handle)}
        title={t`Drag to reorder`}
        aria-hidden="true"
      >
        {index + 1}
      </span>

      <span {...stylex.props(styles.meta)}>
        <span
          {...stylex.props(styles.t1)}
          title={track.title}
          data-testid="queue-title"
        >
          {track.title}
        </span>
        <span
          {...stylex.props(styles.t2)}
          title={`${track.artists.join(', ')} . ${track.album}`}
          data-testid="queue-subtitle"
        >
          {track.artists.join(', ')} . {track.album}
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
        <span {...stylex.props(styles.dur)} data-testid="queue-duration">
          {duration}
        </span>
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
    columnGap: 'var(--space-2)',
    minHeight: 'var(--row-compact)',
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
    outline: {
      ':focus-visible': '2px solid var(--focus-color)',
    },
    outlineOffset: '-2px',
  },
  rowSelected: {
    backgroundColor: 'var(--info-soft)',
    borderLeftColor: 'var(--info)',
  },
  idx: {
    width: '20px',
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-faint)',
  },
  handle: {
    // The only drag affordance: a grab cursor confined to the index gutter
    // so the row body stays a plain click-to-select surface.
    cursor: 'grab',
    touchAction: 'none',
    borderRadius: 'var(--radius-sm)',
  },
  meta: {
    minWidth: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  t1: {
    display: 'block',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  t2: {
    display: 'block',
    marginTop: '1px',
    fontSize: 'var(--text-xs)',
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
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--accent)',
    fontSize: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--accent)',
  },
  dur: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-faint)',
    // Hour-long tracks (`1:00:00`) need ~6 chars: never clip the duration.
    minWidth: '44px',
    width: 'auto',
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
    fontSize: 'var(--text-lg)',
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
