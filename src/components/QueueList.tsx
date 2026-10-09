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

/**
 * Reorder `queue` from a drag performed in the rendered upcoming list.
 *
 * Positions are derived from `visibleIds` - the ids actually rendered - not
 * from full-queue indices, so filtered-out rows, the playing row, and rows
 * beyond the page can never be a drag endpoint. The mutation is confined to
 * indices after `queueCursor`, and the cursor track is verified still in
 * place; otherwise the queue is left untouched (`null`). Pure so it is
 * unit-testable without the drag layer.
 */
export function reorderQueue(
  queue: Track[],
  queueCursor: number,
  visibleIds: Array<string>,
  activeId: string,
  overId: string,
): Track[] | null {
  if (activeId === overId) return null;
  const fromVisible = visibleIds.indexOf(activeId);
  const toVisible = visibleIds.indexOf(overId);
  if (fromVisible === -1 || toVisible === -1) return null;

  const moved = queue.find((track) => track.id === activeId);
  if (moved === undefined) return null;

  const next = queue.filter((track) => track.id !== activeId);
  const anchor = next.findIndex((track) => track.id === overId);
  // Mirror arrayMove on the rendered order: after the drop target when
  // moving down, before it when moving up.
  const at =
    anchor === -1 ? next.length : anchor + (fromVisible < toVisible ? 1 : 0);
  next.splice(at, 0, moved);

  // The cursor track is never draggable; if it drifted, refuse the write.
  if (next[queueCursor]?.id !== queue[queueCursor]?.id) return null;
  return next;
}

export default function QueueList(props: Props) {
  const { queue, queueCursor, savedOnly, mostPlayed, trackPlaying } = props;
  const { t } = useLingui();
  const [queueSize, setQueueSize] = useState(INITIAL_QUEUE_SIZE);
  // Click-to-select: the selected upcoming row owns the roving tabindex.
  // `null` means "nothing selected yet", which falls back to the first row.
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      if (over == null) return;

      const next = reorderQueue(
        queue,
        queueCursor,
        visibleUpcoming.map((track) => track.id),
        String(active.id),
        String(over.id),
      );
      if (next !== null) player.setQueue(next);
    },
    [queue, queueCursor, visibleUpcoming],
  );

  return (
    <DndContext
      onDragEnd={onDragEnd}
      id={dndId}
      modifiers={DND_MODIFIERS}
      sensors={sensors}
    >
      <ul
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- sortable option list with buttons in rows and roving tabindex: native select only allows option children
        role="listbox"
        aria-label={t`Queue`}
        {...stylex.props(styles.list)}
      >
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
            // Roving tabindex: the selected row (or the first row before
            // any selection) is the only tab stop.
            const isTabStop =
              (selectedId ?? visibleUpcoming[0]?.id) === track.id;
            return (
              <QueueListItem
                key={`track-${track.id}-${absoluteIndex}`}
                index={absoluteIndex}
                track={track}
                queueCursor={queueCursor}
                selected={selectedId === track.id}
                tabIndex={isTabStop ? 0 : -1}
                onSelect={setSelectedId}
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
                  Math.min(
                    queueSize + INITIAL_QUEUE_SIZE,
                    incomingQueue.length,
                  ),
                )
              }
              {...stylex.props(styles.more)}
            >
              {t`See more`}
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
        <span {...stylex.props(styles.t1, styles.t1Playing)}>
          {track.title}
        </span>
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
    // Breathing room past the last row so it never sits flush-clipped
    // against the panel bottom edge.
    paddingBlockStart: '2px',
    paddingBlockEnd: '8px',
    // This list is its own scroller (not wrapped in `Scrollable`), so it
    // carries the same thin themed scrollbar and stable gutter: the gutter
    // reserves the scrollbar lane up front, so the bar never paints over
    // the duration / action controls at the row ends.
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--text-faint) transparent',
    scrollbarGutter: 'stable',
    '::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '::-webkit-scrollbar-track': {
      backgroundColor: 'transparent',
    },
    '::-webkit-scrollbar-thumb': {
      backgroundColor: 'var(--text-faint)',
      borderRadius: '9999px',
    },
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    columnGap: 'var(--space-2)',
    minHeight: 'var(--row-compact)',
    paddingInline: '10px',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    cursor: 'pointer',
  },
  rowPlaying: {
    borderLeftColor: 'var(--accent)',
    backgroundImage:
      'linear-gradient(90deg, var(--accent-soft), transparent 60%)',
    // The playing row has no click handler: never show a pointer cursor.
    cursor: 'default',
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
  t1Playing: {
    color: 'var(--accent-text)',
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
  more: {
    width: '100%',
    paddingBlock: '6px',
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--text-bright)',
    },
    fontSize: 'var(--text-xs)',
    textAlign: 'center',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    borderStyle: 'none',
    cursor: 'pointer',
    outline: {
      ':focus-visible': '2px solid var(--focus-color)',
    },
    outlineOffset: '-2px',
  },
});
