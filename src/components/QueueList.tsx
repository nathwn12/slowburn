import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useId, useMemo, useState } from 'react';

import type { SortKey, Track } from '../generated/typings';
import useDndSensors from '../hooks/useDnDSensors';
import useFormattedDuration from '../hooks/useFormattedDuration';
import player from '../lib/player';
import { sortTracks } from '../lib/utils-library';
import PlayingIndicator from './PlayingIndicator';
import QueueListItem from './QueueListItem';
import { useIsSavedLoop, useSavedLoopsStore } from './saved-loops';

const INITIAL_QUEUE_SIZE = 20;
const DND_MODIFIERS = [restrictToVerticalAxis];

/** The queue's "Most played" mode: play_count descending. */
const MOST_PLAYED_KEY: SortKey = { field: 'playCount', direction: 'Dsc' };

type Props = {
  queue: Track[];
  queueCursor: number;
  savedOnly: boolean;
  mostPlayed: boolean;
  trackPlaying: Track | null;
};

export default function QueueList(props: Props) {
  const { queue, queueCursor, savedOnly, mostPlayed, trackPlaying } = props;
  const { t } = useLingui();
  const [queueSize, setQueueSize] = useState(INITIAL_QUEUE_SIZE);

  const savedIds = useSavedLoopsStore((state) => state.ids);

  // Sort BEFORE paginating (Review Focus 5): "most played" must rank the whole
  // upcoming queue, not just the rows that already made the first page.
  const incomingQueue = useMemo(
    () => queue.slice(queueCursor + 1),
    [queue, queueCursor],
  );
  const orderedQueue = useMemo(
    () =>
      mostPlayed ? sortTracks(incomingQueue, [MOST_PLAYED_KEY]) : incomingQueue,
    [incomingQueue, mostPlayed],
  );

  const shownQueue = orderedQueue.slice(0, queueSize);
  const hiddenQueue = orderedQueue.slice(queueSize);

  const visibleUpcoming = useMemo(
    () =>
      savedOnly
        ? shownQueue.filter((track) => savedIds.has(track.id))
        : shownQueue,
    [shownQueue, savedOnly, savedIds],
  );

  const sensors = useDndSensors();
  const dndId = useId();

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over == null || active.id === over.id) return;

      const activeIndex = queue.findIndex((track) => track.id === active.id);
      const overIndex = queue.findIndex((track) => track.id === over.id);
      const newQueue = [...queue];
      const movedTrack = newQueue.splice(activeIndex, 1)[0];
      newQueue.splice(overIndex, 0, movedTrack);
      player.setQueue(newQueue);
    },
    [queue],
  );

  return (
    <DndContext
      onDragEnd={onDragEnd}
      id={dndId}
      modifiers={DND_MODIFIERS}
      sensors={sensors}
    >
      <ul role="listbox" aria-label={t`Queue`} {...stylex.props(styles.list)}>
        {trackPlaying != null &&
          (!savedOnly || savedIds.has(trackPlaying.id)) && (
            <NowRow track={trackPlaying} />
          )}

        <SortableContext
          items={visibleUpcoming}
          strategy={verticalListSortingStrategy}
        >
          {visibleUpcoming.map((track) => {
            const absoluteIndex = queue.findIndex(
              (candidate) => candidate.id === track.id,
            );
            return (
              <QueueListItem
                key={`track-${track.id}-${absoluteIndex}`}
                index={absoluteIndex}
                track={track}
                queueCursor={queueCursor}
              />
            );
          })}
        </SortableContext>

        {!savedOnly && hiddenQueue.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() =>
                setQueueSize(
                  Math.min(queueSize + INITIAL_QUEUE_SIZE, incomingQueue.length),
                )
              }
              {...stylex.props(styles.more)}
            >
              {t`see more`}
            </button>
          </li>
        )}
      </ul>
    </DndContext>
  );
}

/**
 * The playing row. Kept out of the sortable set on purpose — the engine owns
 * the cursor, not the drag layer — and shown with the brand EQ bars.
 */
function NowRow({ track }: { track: Track }) {
  const { t } = useLingui();
  const duration = useFormattedDuration(track.duration);
  const savedLoop = useIsSavedLoop(track.id);

  return (
    <li
      role="option"
      aria-selected="true"
      data-is-playing="true"
      {...stylex.props(styles.row, styles.rowPlaying)}
    >
      <span {...stylex.props(styles.idx)}>
        <PlayingIndicator />
      </span>
      <span {...stylex.props(styles.meta)}>
        <span {...stylex.props(styles.t1, styles.t1Playing)}>{track.title}</span>
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
      </span>
    </li>
  );
}

const styles = stylex.create({
  list: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    paddingBlock: '2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    minHeight: '40px',
    paddingInline: '10px',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    cursor: 'pointer',
  },
  rowPlaying: {
    borderLeftColor: 'var(--deep-pink)',
    backgroundImage:
      'linear-gradient(90deg, var(--pink-soft), rgba(255,20,147,.02) 60%)',
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
  t1Playing: {
    color: 'var(--pink-text)',
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
  more: {
    width: '100%',
    paddingBlock: '6px',
    color: 'var(--text-faint)',
    fontSize: '11px',
    textAlign: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    cursor: 'pointer',
  },
});

