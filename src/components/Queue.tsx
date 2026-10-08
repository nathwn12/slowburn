import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import type { Playlist, Track } from '../generated/typings';
import useFilteredTracks from '../hooks/useFilteredTracks';
import { usePlayerState } from '../hooks/usePlayer';
import DatabaseBridge from '../lib/bridge-database';
import player from '../lib/player';
import { allTracksQuery, configQuery } from '../lib/queries';
import type { QueueOrigin } from '../types/museeks';
import Icon from './Icon';
import QueueEmpty from './QueueEmpty';
import QueueList from './QueueList';
import { useSavedLoopsStore } from './saved-loops';
import TrackList from './TrackList';
import TrackListStates from './TrackListStates';

type Props = {
  queue: Track[];
  queueCursor: number | null;
};

type Source = 'queue' | 'library' | 'playlist';

const LIBRARY_ORIGIN: QueueOrigin = { type: 'library' };

/**
 * The Dense queue panel (design §1/§5): head with the track count, an
 * explicit Up Next statement (the queue is separate from playlists;
 * starting a playlist replaces the queue), an origin badge, a filter
 * sub-bar (`◆ Saved loops` plus a `Sort: <order>` menu button naming the
 * active queue order) and dense 40 px rows. The
 * playing row leads the list; the left column owns the transport.
 *
 * S4 keeps the legacy QUEUE heading (other views assert on it) and states
 * the split explicitly right below it. No engine change: shuffle goes
 * through `player.toggleShuffle` so the pre-shuffle order survives in the
 * engine's `oldQueue` backup.
 */
export default function Queue(props: Props) {
  const { queue, queueCursor } = props;
  const { t } = useLingui();
  const [savedOnly, setSavedOnly] = useState(false);
  const [mostPlayed, setMostPlayed] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const sortWrapRef = useRef<HTMLDivElement>(null);

  const closeSort = (refocusTrigger: boolean) => {
    setSortOpen(false);
    if (refocusTrigger) sortTriggerRef.current?.focus();
  };

  // An outside pointer or Escape closes the sort menu; Tab lets focus
  // travel on instead of dragging it back to the trigger.
  useEffect(() => {
    if (!sortOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!sortWrapRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeSort(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [sortOpen]);

  // Mini mode gives the panel a short row (~145px in the compact window), so
  // the informational Up Next block is omitted there: it otherwise consumes
  // half the row and the library/queue tabpanel - the only shrinkable child -
  // collapses to height 0, losing the song list.
  const config = useSuspenseQuery(configQuery).data;
  const isMini = (config as { ui_mode?: unknown }).ui_mode === 'mini';

  const savedIds = useSavedLoopsStore((state) => state.ids);
  const queueOrigin = usePlayerState((state) => state.queueOrigin);
  const shuffle = usePlayerState((state) => state.shuffle);

  // Resolve the origin playlist's display name so the badge never leaks the
  // raw `playlist:<id>` internal id into visible UI (unknown ids keep the
  // legacy `playlist:<id>` fallback).
  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => DatabaseBridge.getAllPlaylists(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const originPlaylistName =
    queueOrigin?.type === 'playlist'
      ? resolveQueueOriginName(playlists, queueOrigin.playlistID)
      : null;

  const trackPlaying =
    queueCursor != null ? (queue[queueCursor] ?? null) : null;

  // S5 read-only ReplayGain display: the engine carries no gain tags yet, so
  // this surfaces the file's tag value when present and an em-dash otherwise
  // (the same "no data" convention as the Track Details panel).
  const replayGainDb =
    (trackPlaying as unknown as { replay_gain_db?: number | null } | null)
      ?.replay_gain_db ?? null;

  const upcoming = useMemo(
    () => (queueCursor != null ? queue.slice(queueCursor + 1) : queue),
    [queue, queueCursor],
  );

  const isQueueEmpty = queue.length === 0 || queueCursor == null;

  // The panel is a general track-list surface (AIMP-style), not a queue-only
  // view: the user's explicit tab wins; before any choice the queue shows
  // when it has tracks and the library list shows when nothing is playing,
  // so the panel never sits on a bare empty-queue message.
  const [pinnedSource, setPinnedSource] = useState<Source | null>(null);
  const playlistActive = queueOrigin?.type === 'playlist';
  const activeSource: Source =
    pinnedSource === 'playlist' && !playlistActive
      ? 'queue'
      : (pinnedSource ?? (isQueueEmpty ? 'library' : 'queue'));
  const hasVisibleRows =
    queue.length > 0 &&
    (!savedOnly ||
      (trackPlaying != null && savedIds.has(trackPlaying.id)) ||
      upcoming.some((track) => savedIds.has(track.id)));

  const tablistRef = useRef<HTMLDivElement>(null);

  const tabOrder: Source[] = playlistActive
    ? ['queue', 'library', 'playlist']
    : ['queue', 'library'];

  /**
   * WAI-APG automatic activation: Left/Right move selection and focus,
   * Home/End jump to the ends. Roving tabindex keeps exactly one tab in
   * the normal tab order.
   */
  const onTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabOrder.indexOf(activeSource);
    let next: Source | null = null;
    if (event.key === 'ArrowRight') {
      next = tabOrder[(current + 1) % tabOrder.length] ?? null;
    } else if (event.key === 'ArrowLeft') {
      next =
        tabOrder[(current - 1 + tabOrder.length) % tabOrder.length] ?? null;
    } else if (event.key === 'Home') {
      next = tabOrder[0] ?? null;
    } else if (event.key === 'End') {
      next = tabOrder[tabOrder.length - 1] ?? null;
    }
    if (next == null) {
      return;
    }
    event.preventDefault();
    setPinnedSource(next);
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`[data-source="${next}"]`)
      ?.focus();
  };

  return (
    <div {...stylex.props(styles.queue)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t`QUEUE`}</h2>
        <span {...stylex.props(styles.count)}>
          {queue.length} {queue.length === 1 ? t`track` : t`tracks`}
        </span>
        <div {...stylex.props(styles.tools)}>
          <button
            type="button"
            onClick={() => void player.toggleShuffle()}
            aria-label={t`Shuffle queue`}
            aria-pressed={shuffle}
            title={t`Shuffle queue`}
            {...stylex.props(styles.tool)}
          >
            <Icon name="shuffle" size={16} />
          </button>
          <button
            type="button"
            onClick={() => player.clearQueue()}
            aria-label={t`Clear queue`}
            title={t`Clear queue`}
            {...stylex.props(styles.tool)}
          >
            &times;
          </button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t`Panel source`}
        ref={tablistRef}
        onKeyDown={onTabListKeyDown}
        {...stylex.props(styles.tabs)}
      >
        <button
          type="button"
          role="tab"
          id="queue-tab-queue"
          data-source="queue"
          aria-selected={activeSource === 'queue'}
          aria-controls="queue-tabpanel"
          tabIndex={activeSource === 'queue' ? 0 : -1}
          onClick={() => setPinnedSource('queue')}
          data-on={activeSource === 'queue' ? 'true' : 'false'}
          {...stylex.props(
            styles.tab,
            activeSource === 'queue' && styles.tabOn,
          )}
        >
          {t`Queue`}
        </button>
        <button
          type="button"
          role="tab"
          id="queue-tab-library"
          data-source="library"
          aria-selected={activeSource === 'library'}
          aria-controls="queue-tabpanel"
          tabIndex={activeSource === 'library' ? 0 : -1}
          onClick={() => setPinnedSource('library')}
          data-on={activeSource === 'library' ? 'true' : 'false'}
          {...stylex.props(
            styles.tab,
            activeSource === 'library' && styles.tabOn,
          )}
        >
          {t`Library`}
        </button>
        {playlistActive && (
          <button
            type="button"
            role="tab"
            id="queue-tab-playlist"
            data-source="playlist"
            aria-selected={activeSource === 'playlist'}
            aria-controls="queue-tabpanel"
            tabIndex={activeSource === 'playlist' ? 0 : -1}
            onClick={() => setPinnedSource('playlist')}
            data-on={activeSource === 'playlist' ? 'true' : 'false'}
            title={t`The playlist now playing`}
            {...stylex.props(
              styles.tab,
              activeSource === 'playlist' && styles.tabOn,
            )}
          >
            {t`Playlist`}
          </button>
        )}
      </div>

      {!isMini && (
        <div {...stylex.props(styles.explicit)}>
          <h3 {...stylex.props(styles.explicitTitle)}>{t`Up Next`}</h3>
          <p {...stylex.props(styles.explicitCopy)}>
            {t`The queue is separate from playlists. Starting a playlist replaces the queue.`}
            {queueOrigin?.type === 'playlist' && (
              <>
                {' '}
                {t`From playlist`}{' '}
                <span {...stylex.props(styles.badge)}>
                  {originPlaylistName ?? `playlist:${queueOrigin.playlistID}`}
                </span>
              </>
            )}
          </p>
          <p {...stylex.props(styles.explicitCopy)}>
            {t`Shuffle keeps the playing track first; the pre-shuffle order is preserved.`}
          </p>
          <p {...stylex.props(styles.explicitCopy)}>
            {t`ReplayGain`}:{' '}
            {replayGainDb != null
              ? `${replayGainDb.toFixed(1)} dB`
              : t`No ReplayGain tag`}
          </p>
        </div>
      )}

      {activeSource === 'queue' || activeSource === 'playlist' ? (
        <div
          id="queue-tabpanel"
          role="tabpanel"
          aria-labelledby={`queue-tab-${activeSource}`}
          style={{ display: 'contents' }}
        >
          <div {...stylex.props(styles.sub)}>
            <button
              type="button"
              aria-pressed={savedOnly}
              onClick={() => setSavedOnly((value) => !value)}
              data-on={savedOnly ? 'true' : 'false'}
              title={t`Show only tracks with a saved A-B loop`}
              {...stylex.props(styles.filter, savedOnly && styles.filterOn)}
            >
              <span {...stylex.props(styles.filterMark)} aria-hidden="true">
                ◆
              </span>
              {t`Saved loops`}
            </button>
            {/*
             * One sort control, never a static readout: the trigger button
             * names the active queue order in words (`Sort: Manual` is the
             * queue's own play order, the default; `Sort: Most played` is
             * `play_count` descending across the whole queue) and opens a
             * menu with exactly those two orders. The library header's
             * SortControl is deliberately not reused here: it drives the
             * library's `library_sort_keys` config, while this is local
             * queue view state. `Saved loops` stays a separate filter chip.
             */}
            <div ref={sortWrapRef} {...stylex.props(styles.sortWrap)}>
              <button
                type="button"
                ref={sortTriggerRef}
                aria-haspopup="menu"
                aria-expanded={sortOpen}
                aria-label={mostPlayed ? t`Sort: Most played` : t`Sort: Manual`}
                onClick={() => setSortOpen((value) => !value)}
                title={t`Sort the queue`}
                {...stylex.props(styles.filter, mostPlayed && styles.filterOn)}
              >
                {mostPlayed ? t`Sort: Most played` : t`Sort: Manual`}
              </button>
              {sortOpen && (
                <div
                  role="menu"
                  aria-label={t`Queue sort options`}
                  {...stylex.props(styles.sortMenu)}
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={!mostPlayed}
                    onClick={() => {
                      setMostPlayed(false);
                      closeSort(true);
                    }}
                    {...stylex.props(
                      styles.sortItem,
                      !mostPlayed && styles.sortItemOn,
                    )}
                  >
                    {t`Manual`}
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={mostPlayed}
                    onClick={() => {
                      setMostPlayed(true);
                      closeSort(true);
                    }}
                    {...stylex.props(
                      styles.sortItem,
                      mostPlayed && styles.sortItemOn,
                    )}
                  >
                    {t`Most played`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/*
           * A filter hiding every row is not an empty queue: the filtered
           * state names the active filter, shows the result count, and
           * offers a way out instead of the generic "Queue is empty" dead
           * end.
           */}
          {isQueueEmpty ? (
            <QueueEmpty />
          ) : !hasVisibleRows ? (
            <QueueFilteredEmpty
              filterName={savedOnly ? t`Saved loops` : t`Most played`}
              total={queue.length}
              onClear={() => {
                setSavedOnly(false);
                setMostPlayed(false);
              }}
            />
          ) : (
            <QueueList
              queue={queue}
              queueCursor={queueCursor}
              savedOnly={savedOnly}
              mostPlayed={mostPlayed}
              trackPlaying={trackPlaying}
            />
          )}
        </div>
      ) : (
        <div
          id="queue-tabpanel"
          role="tabpanel"
          aria-labelledby={`queue-tab-${activeSource}`}
          {...stylex.props(styles.libraryPane)}
        >
          {/*
           * The queue affordances stay reachable from the library source: with
           * an empty queue the compact empty state (same texts and CTA the
           * queue view asserts on) sits above the song list instead of a bare
           * empty message.
           */}
          {isQueueEmpty && <QueueEmpty compact />}
          <LibraryPane />
        </div>
      )}
    </div>
  );
}

/**
 * Resolve a queue origin's display name from the playlists query. Pure so
 * the badge lookup is unit-testable without the query layer; unknown ids
 * resolve to `null` and the caller falls back to the legacy `playlist:<id>`.
 */
export function resolveQueueOriginName(
  playlists: Array<Playlist>,
  playlistID: string,
): string | null {
  return playlists.find((playlist) => playlist.id === playlistID)?.name ?? null;
}

/**
 * Filtered-empty state: the queue has tracks but the active filter hides
 * every row. Names the filter, states the 0-of-N result count, and offers a
 * clear-filter action back to the full queue.
 */
function QueueFilteredEmpty(props: {
  filterName: string;
  total: number;
  onClear: () => void;
}) {
  const { filterName, total, onClear } = props;
  const { t } = useLingui();

  return (
    <div {...stylex.props(styles.filteredEmpty)}>
      <div {...stylex.props(styles.filteredBig)}>
        {t`No ${filterName} tracks in the queue`}
      </div>
      <div {...stylex.props(styles.filteredSmall)}>
        {t`0 of ${total} ${total === 1 ? 'track' : 'tracks'} match. Clear the filter to see everything.`}
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label={t`Clear filter`}
        {...stylex.props(styles.filteredCta)}
      >
        {t`Clear filter`}
      </button>
    </div>
  );
}

/**
 * The library source, rendered through the existing TrackList path
 * (same rows, per-row durations, density, search/sort) so the panel reuses
 * the library list instead of inventing a third list. Starting a playlist
 * replaces the queue, so the playlist source above simply reuses QueueList.
 */
function LibraryPane() {
  const config = useSuspenseQuery(configQuery).data;
  const { data: tracks, isLoading } = useQuery(allTracksQuery);
  const { data: playlists = [] } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => DatabaseBridge.getAllPlaylists(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const filteredTracks = useFilteredTracks(
    tracks ?? [],
    config.library_sort_keys,
  );

  return (
    <div {...stylex.props(styles.libraryList)}>
      <TrackListStates isLoading={isLoading} tracks={filteredTracks}>
        <TrackList
          layout="default"
          data={filteredTracks}
          queueOrigin={LIBRARY_ORIGIN}
          tracksDensity={config.track_view_density}
          playlists={playlists}
        />
      </TrackListStates>
    </div>
  );
}

const styles = stylex.create({
  queue: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
    minWidth: 0,
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
  tools: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    columnGap: '2px',
  },
  tool: {
    width: 'var(--space-5)',
    height: 'var(--space-5)',
    borderRadius: 'var(--radius)',
    display: 'grid',
    placeItems: 'center',
    // A visible bordered affordance with a bright default glyph: these two
    // header controls must read as buttons at rest, not grey squares that
    // only reveal themselves on hover. The accessible name stays on
    // `aria-label` (+ `title` for the pointer tooltip), never hover-only.
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    backgroundColor: {
      default: 'var(--bg)',
      ':hover': 'var(--surface-hover)',
    },
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--border-soft)',
      ':hover': 'var(--control-border)',
    },
    fontSize: 'var(--text-lg)',
    fontWeight: 700,
    lineHeight: 1,
    padding: 0,
    cursor: 'pointer',
  },
  explicit: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '2px',
    flexShrink: 0,
    paddingBlock: '6px',
    paddingInline: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
  },
  explicitTitle: {
    margin: 0,
    fontSize: 'var(--text-xs)',
    fontWeight: 800,
    letterSpacing: '.1em',
    color: 'var(--text-dim)',
  },
  explicitCopy: {
    margin: 0,
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
  badge: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--info-text)',
    backgroundColor: 'var(--info-soft)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--info-line)',
    borderRadius: '9999px',
    paddingBlock: '1px',
    paddingInline: '6px',
  },
  sub: {
    display: 'flex',
    alignItems: 'center',
    columnGap: 'var(--space-2)',
    height: '34px',
    flexShrink: 0,
    paddingInline: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-faint)',
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    flexShrink: 0,
    paddingBlock: '6px',
    paddingInline: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '22px',
    paddingInline: '10px',
    borderRadius: '9999px',
    backgroundColor: 'var(--bg)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    lineHeight: 1,
    cursor: 'pointer',
  },
  tabOn: {
    color: 'var(--info-text)',
    borderColor: 'var(--info-line)',
    backgroundColor: 'var(--info-soft)',
    boxShadow: '0 0 8px var(--info-soft)',
  },
  libraryPane: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
    minWidth: 0,
    overflowY: 'auto',
  },
  libraryList: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    minHeight: '240px',
  },
  filter: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '5px',
    height: '19px',
    paddingInline: '7px',
    borderRadius: '9999px',
    backgroundColor: 'var(--bg)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    lineHeight: 1,
  },
  filterOn: {
    color: 'var(--info-text)',
    borderColor: 'var(--info-line)',
    backgroundColor: 'var(--info-soft)',
  },
  filterMark: {
    fontSize: '8px',
    color: 'var(--accent)',
  },
  sortWrap: {
    position: 'relative',
    marginLeft: 'auto',
  },
  sortMenu: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    rowGap: '2px',
    minWidth: '140px',
    padding: '4px',
    borderRadius: 'var(--radius)',
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    boxShadow: '0 8px 24px var(--bg)',
  },
  sortItem: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    paddingBlock: '6px',
    paddingInline: '8px',
    borderRadius: 'var(--radius)',
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-dim)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    lineHeight: 1,
    cursor: 'pointer',
  },
  sortItemOn: {
    color: 'var(--info-text)',
    backgroundColor: 'var(--info-soft)',
  },
  filteredEmpty: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: 'var(--space-2)',
    height: '100%',
    textAlign: 'center',
    color: 'var(--text-faint)',
    padding: 'var(--space-5)',
  },
  filteredBig: {
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--text-dim)',
  },
  filteredSmall: {
    fontSize: 'var(--text-xs)',
    lineHeight: 1.5,
    maxWidth: '230px',
  },
  filteredCta: {
    marginTop: 'var(--space-1)',
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-bright)',
    backgroundColor: {
      default: 'var(--surface-hover)',
      ':hover': 'var(--bg)',
    },
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--border)',
      ':hover': 'var(--control-border)',
    },
    borderRadius: 'var(--radius)',
    paddingBlock: '6px',
    paddingInline: 'var(--space-3)',
    cursor: 'pointer',
    outline: {
      ':focus-visible': '2px solid var(--focus-color)',
    },
    outlineOffset: '1px',
  },
});
