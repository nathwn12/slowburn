import { useSortable } from '@dnd-kit/sortable';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import type React from 'react';

import type { Track } from '../generated/typings';
import useFormattedDuration from '../hooks/useFormattedDuration';
import PlayingIndicator from './PlayingIndicator';
import { useIsSavedLoop } from './saved-loops';

export type TrackRowEvents = {
  onTrackSelect: (
    event: React.MouseEvent,
    trackID: string,
    trackIndex: number,
  ) => void;
  onContextMenu: (
    event: React.MouseEvent,
    trackID: string,
    trackIndex: number,
  ) => void;
  onPlaybackStart: (trackID: string) => void;
};

type Props = {
  selected: boolean;
  hasSelectedAbove?: boolean;
  track: Track;
  index: number;
  setSize?: number;
  isPlaying?: boolean;
  draggable?: boolean;
  simplified?: boolean;
  showArtistInTitle?: boolean;
  style?: React.CSSProperties;
} & TrackRowEvents;

/**
 * A Dense track row (design §5): 40 px, two lines — title on top, `artist ·
 * album` beneath, the saved-loop `◆` pin and the duration on the right. The
 * cursor selection is `--info` blue, the playing row is magenta: two different
 * facts, never colour-alone (position + pin + indicator carry them too).
 */
export default function TrackRow(props: Props) {
  const {
    track,
    index,
    selected,
    draggable,
    onTrackSelect,
    onContextMenu,
    onPlaybackStart,
  } = props;
  const { t } = useLingui();

  const duration = useFormattedDuration(track.duration);
  const savedLoop = useIsSavedLoop(track.id);

  // Drag-and-Drop for playlists
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging, // is this item being dragged around
    isOver, // is this item being dragged over by another item
    activeIndex,
    overIndex,
  } = useSortable({
    id: props.track.id,
    disabled: !draggable,
    data: {
      type: 'playlist-track',
      index,
    },
  });

  const isDropIndicatorVisible = isOver && !isDragging;
  const isDropAbove = isOver && overIndex < activeIndex;
  const isDropBelow = isOver && overIndex > activeIndex;

  return (
    // oxlint-disable-next-line jsx_a11y/click-events-have-key-events - given by ...listeners
    <li
      onDoubleClick={() => onPlaybackStart(track.id)}
      onMouseDown={(e) => onTrackSelect(e, track.id, index)}
      onClick={(e) => onTrackSelect(e, track.id, index)}
      onContextMenu={(e) => onContextMenu(e, track.id, index)}
      data-is-playing={props.isPlaying === true}
      data-track-id={track.id}
      // dnd-related props:
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // accessibility
      aria-disabled="false" // required
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={props.setSize}
      role="option" // technically already given by attributes, but that'll make the linter happy
      // styles
      {...stylex.props(
        trackStyles.track,
        selected && trackStyles.trackSelected,
        props.isPlaying === true && trackStyles.trackPlaying,
        isDragging && trackStyles.isDragging,
        isDropIndicatorVisible && trackStyles.isDraggedOver,
        isDropAbove && trackStyles.isDraggedOverAbove,
        isDropBelow && trackStyles.isDraggedOverBelow,
      )}
      style={props.style}
    >
      <span {...stylex.props(cellStyles.index)}>
        {props.isPlaying === true ? <PlayingIndicator /> : index + 1}
      </span>

      <span {...stylex.props(cellStyles.meta)}>
        <span
          {...stylex.props(
            cellStyles.title,
            props.isPlaying === true && cellStyles.titlePlaying,
          )}
        >
          {track.title}
          {props.showArtistInTitle === true && track.artists.length > 0 && (
            <span {...stylex.props(cellStyles.artistInTitle)}>
              {' — '}
              {track.artists.join(', ')}
            </span>
          )}
        </span>
        <span {...stylex.props(cellStyles.subtitle)}>
          {track.artists.join(', ')} · {track.album}
        </span>
      </span>

      <span {...stylex.props(cellStyles.right)}>
        {savedLoop && (
          <span
            {...stylex.props(cellStyles.loopPin)}
            title={t`Saved A-B loop`}
            aria-label={t`Saved A-B loop`}
          >
            ◆
          </span>
        )}
        <span {...stylex.props(cellStyles.duration)}>{duration}</span>
      </span>
    </li>
  );
}

const trackStyles = stylex.create({
  track: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    minWidth: 0,
    maxWidth: '100%',
    height: '100%',
    paddingInlineStart: '10px',
    paddingInlineEnd: '12px',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    cursor: 'default',
  },
  trackSelected: {
    backgroundColor: 'var(--info-soft)',
    borderLeftColor: 'var(--info)',
  },
  trackPlaying: {
    backgroundColor: 'var(--pink-soft)',
    backgroundImage:
      'linear-gradient(90deg, var(--pink-soft), rgba(255,20,147,.02) 60%)',
    borderLeftColor: 'var(--deep-pink)',
  },
  isDragging: {
    opacity: 0.5,
  },
  isDraggedOver: {
    '::after': {
      pointerEvents: 'none',
      position: 'absolute',
      zIndex: 1,
      display: 'block',
      width: '100%',
      content: '""',
      height: '2px',
      backgroundColor: 'var(--main-color)',
    },
  },
  isDraggedOverAbove: {
    '::after': {
      top: '-1px',
    },
  },
  isDraggedOverBelow: {
    '::after': {
      bottom: '-1px',
    },
  },
});

const cellStyles = stylex.create({
  index: {
    width: '20px',
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    color: 'var(--text-faint)',
  },
  meta: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
  },
  title: {
    display: 'block',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  titlePlaying: {
    color: 'var(--pink-text)',
  },
  artistInTitle: {
    color: 'var(--text-muted)',
    fontWeight: 500,
    fontSize: '0.9em',
  },
  subtitle: {
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
  loopPin: {
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
  duration: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    color: 'var(--text-faint)',
    width: '38px',
    textAlign: 'right',
  },
});
