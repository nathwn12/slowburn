import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type KeyboardEvent } from 'react';

import * as ViewMessage from '../elements/ViewMessage';
import type { Track } from '../generated/typings';
import useFormattedDuration from '../hooks/useFormattedDuration';
import usePlayingTrackID from '../hooks/usePlayingTrackID';
import { formatPlayed } from '../lib/dense-format';
import { selectHistoryTracks } from '../lib/history';
import player from '../lib/player';
import { allTracksQuery } from '../lib/queries';
import type { QueueOrigin } from '../types/museeks';
import HistoryEmpty from './HistoryEmpty';
import PlayingIndicator from './PlayingIndicator';
import { useIsSavedLoop } from './saved-loops';

const HISTORY_ORIGIN: QueueOrigin = { type: 'library' };

/**
 * The play-history surface: every track with at least one completed play,
 * newest `last_played` first. It is built from the all-tracks query the
 * library already loads (`play_count` and `last_played` ride along on every
 * `Track`), so there is no history query, no migration, and no new Tauri
 * command behind it.
 *
 * Rows follow the `QueueListItem` idiom (click to select with a roving
 * tabindex, double-click / Enter / Space to play, the brand EQ bars on the
 * playing row, the saved-loop pin) and add the one fact the queue rows do
 * not carry: the existing `formatPlayed` dense string (`3 times ·
 * yesterday`). Playing a row starts a new queue from the history order, the
 * same contract as starting a track from the library list.
 */
export default function History() {
  const { t } = useLingui();
  const { data: tracks, isLoading } = useQuery(allTracksQuery);

  const history = useMemo(() => selectHistoryTracks(tracks ?? []), [tracks]);

  // Click-to-select: the selected row owns the roving tabindex. `null`
  // means "nothing selected yet", which falls back to the first row.
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <ViewMessage.Notice>
        <p>{t`Loading history...`}</p>
      </ViewMessage.Notice>
    );
  }

  return (
    <div {...stylex.props(styles.view)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t`HISTORY`}</h2>
        <span {...stylex.props(styles.count)}>
          {history.length} {history.length === 1 ? t`track` : t`tracks`}
        </span>
      </div>

      <p {...stylex.props(styles.sub)}>
        {t`Newest first. Playing a track starts a new queue.`}
      </p>

      {history.length === 0 ? (
        <HistoryEmpty />
      ) : (
        <ul
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- selectable option list with custom rows and roving tabindex: native select only allows option children
          role="listbox"
          aria-label={t`Play history`}
          {...stylex.props(styles.list)}
        >
          {history.map((track, index) => (
            <HistoryRow
              key={track.id}
              track={track}
              index={index}
              setSize={history.length}
              history={history}
              selected={selectedId === track.id}
              tabIndex={(selectedId ?? history[0]?.id) === track.id ? 0 : -1}
              onSelect={setSelectedId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type RowProps = {
  track: Track;
  index: number;
  setSize: number;
  history: Array<Track>;
  selected: boolean;
  tabIndex: number;
  onSelect: (trackId: string) => void;
};

function HistoryRow(props: RowProps) {
  const { track, index, setSize, history, selected, tabIndex, onSelect } =
    props;
  const { t } = useLingui();
  const duration = useFormattedDuration(track.duration);
  const savedLoop = useIsSavedLoop(track.id);
  const trackPlayingID = usePlayingTrackID();
  const isPlaying = trackPlayingID === track.id;
  const played = formatPlayed(track.play_count, track.last_played);

  const play = () => {
    void player.start(history, track.id, HISTORY_ORIGIN);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    play();
  };

  return (
    <li
      onClick={() => onSelect(track.id)}
      onDoubleClick={play}
      onKeyDown={onKeyDown}
      role="option"
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={setSize}
      tabIndex={tabIndex}
      data-track-id={track.id}
      {...stylex.props(
        styles.row,
        selected && styles.rowSelected,
        isPlaying && styles.rowPlaying,
      )}
    >
      <span {...stylex.props(styles.idx)} aria-hidden="true">
        {isPlaying ? <PlayingIndicator /> : index + 1}
      </span>
      <span {...stylex.props(styles.meta)}>
        <span
          {...stylex.props(styles.t1, isPlaying && styles.t1Playing)}
          title={track.title}
          data-testid="history-title"
        >
          {track.title}
        </span>
        <span
          {...stylex.props(styles.t2)}
          title={`${track.artists.join(', ')} . ${track.album}`}
          data-testid="history-subtitle"
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
        <span {...stylex.props(styles.facts)}>
          <span
            {...stylex.props(styles.fact)}
            title={played}
            data-testid="history-played"
          >
            {played}
          </span>
          <span {...stylex.props(styles.dur)} data-testid="history-duration">
            {duration}
          </span>
        </span>
      </span>
    </li>
  );
}

const styles = stylex.create({
  view: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    backgroundColor: 'var(--surface-2)',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    columnGap: 'var(--space-2)',
    height: 'var(--row)',
    flexShrink: 0,
    paddingInline: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
  },
  title: {
    margin: 0,
    fontSize: 'var(--text-xs)',
    fontWeight: 800,
    letterSpacing: '.1em',
    color: 'var(--text-dim)',
  },
  count: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-faint)',
    backgroundColor: 'var(--bg)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: '9999px',
    paddingBlock: '3px',
    paddingInline: '7px',
  },
  sub: {
    margin: 0,
    flexShrink: 0,
    paddingBlock: '6px',
    paddingInline: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
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
    paddingBlockStart: '2px',
    paddingBlockEnd: '8px',
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
  rowPlaying: {
    borderLeftColor: 'var(--accent)',
    backgroundImage:
      'linear-gradient(90deg, var(--accent-soft), transparent 60%)',
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
  facts: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    rowGap: '1px',
    minWidth: 0,
  },
  fact: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  },
  dur: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-faint)',
    minWidth: '44px',
    width: 'auto',
    textAlign: 'right',
  },
});
