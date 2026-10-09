import { useSortable } from '@dnd-kit/sortable';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import type React from 'react';
import type { KeyboardEvent } from 'react';

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
  // The row ellipsizes, so the tooltip carries the whole visible line for
  // discoverability. The accessible name (element content) is untouched.
  const titleTip =
    props.showArtistInTitle === true && track.artists.length > 0
      ? `${track.title} - ${track.artists.join(', ')}`
      : track.title;
  const subtitleTip =
    props.showArtistInTitle === true
      ? track.album || track.artists.join(', ')
      : `${track.artists.join(', ')} . ${track.album}`;

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

  // Keyboard path (mirrors QueueListItem): Enter/Space starts playback, like
  // a double-click. Placed after `...listeners` so it wins over the dnd-kit
  // keyboard activation, which was unreachable while rows were unfocusable.
  // `tabIndex={-1}` keeps every row out of the tab order.
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onPlaybackStart(track.id);
  };

  return (
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
      tabIndex={-1}
      onKeyDown={onKeyDown}
      // styles
      {...stylex.props(
        trackStyles.track,
        selected && trackStyles.trackSelected,
        props.isPlaying === true && trackStyles.trackPlaying,
        selected &&
          props.isPlaying === true &&
          trackStyles.trackSelectedPlaying,
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
          title={titleTip}
          data-testid="track-title"
        >
          {track.title}
          {props.showArtistInTitle === true && track.artists.length > 0 && (
            <span {...stylex.props(cellStyles.artistInTitle)}>
              {' - '}
              {track.artists.join(', ')}
            </span>
          )}
        </span>
        <span
          {...stylex.props(cellStyles.subtitle)}
          title={subtitleTip}
          data-testid="track-subtitle"
        >
          {props.showArtistInTitle === true
            ? track.album || track.artists.join(', ')
            : `${track.artists.join(', ')} . ${track.album}`}
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
        <span
          {...stylex.props(cellStyles.duration)}
          data-testid="track-duration"
        >
          {duration}
        </span>
      </span>
    </li>
  );
}

const trackStyles = stylex.create({
  track: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    columnGap: 'var(--space-2)',
    minWidth: 0,
    maxWidth: '100%',
    height: '100%',
    paddingInlineStart: '10px',
    paddingInlineEnd: 'var(--space-3)',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    cursor: 'default',
    outline: {
      ':focus-visible': '2px solid var(--focus-color)',
    },
    outlineOffset: '-2px',
  },
  trackSelected: {
    backgroundColor: 'var(--info-soft)',
    borderLeftColor: 'var(--info)',
  },
  trackPlaying: {
    backgroundColor: 'var(--accent-soft)',
    backgroundImage:
      'linear-gradient(90deg, var(--accent-soft), rgba(255,20,147,.02) 60%)',
    borderLeftColor: 'var(--accent)',
    boxShadow: 'inset 0 0 18px var(--accent-soft)',
  },
  // Playing AND selected: keep the accent playing background, and carry the
  // selection on a distinct outline so the selected row never disappears
  // into the playing row.
  trackSelectedPlaying: {
    backgroundColor: 'var(--accent-soft)',
    backgroundImage:
      'linear-gradient(90deg, var(--accent-soft), rgba(255,20,147,.02) 60%)',
    borderLeftColor: 'var(--accent)',
    boxShadow: 'inset 0 0 18px var(--accent-soft)',
    outlineWidth: '2px',
    outlineStyle: 'solid',
    outlineColor: 'var(--info)',
    outlineOffset: '-2px',
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
      backgroundColor: 'var(--accent)',
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
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  titlePlaying: {
    color: 'var(--accent-text)',
  },
  artistInTitle: {
    color: 'var(--text-dim)',
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
    backgroundColor: 'var(--accent-soft)',
    color: 'var(--accent)',
    fontSize: '8px',
    borderWidth: '1px',
    borderStyle: 'solid',
    // Deliberate exception: no canonical --accent-line token exists and the
    // theme JSONs are owned elsewhere, so the accent hairline keeps its
    // legacy --pink-line name until an --accent-line token lands.
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
