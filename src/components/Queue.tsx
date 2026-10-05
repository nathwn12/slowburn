import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useMemo, useState } from 'react';

import type { Track } from '../generated/typings';
import player from '../lib/player';
import Icon from './Icon';
import QueueEmpty from './QueueEmpty';
import QueueList from './QueueList';
import { useSavedLoopsStore } from './saved-loops';

type Props = {
  queue: Track[];
  queueCursor: number | null;
};

/**
 * The Dense queue panel (design §1/§5): head with the track count, a filter
 * sub-bar (`◆ Saved loops`, sorted: manual) and dense 40 px rows. The playing
 * row leads the list; the left column owns the transport.
 */
export default function Queue(props: Props) {
  const { queue, queueCursor } = props;
  const { t } = useLingui();
  const [savedOnly, setSavedOnly] = useState(false);
  const [mostPlayed, setMostPlayed] = useState(false);

  const savedIds = useSavedLoopsStore((state) => state.ids);

  const trackPlaying =
    queueCursor != null ? (queue[queueCursor] ?? null) : null;

  const upcoming = useMemo(
    () => (queueCursor != null ? queue.slice(queueCursor + 1) : queue),
    [queue, queueCursor],
  );

  /** Reorder only the upcoming slice; the cursor and the playing track stay. */
  const shuffleQueue = useCallback(() => {
    if (queueCursor == null) return;
    const tail = queue.slice(queueCursor + 1);
    for (let i = tail.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [tail[i], tail[j]] = [tail[j], tail[i]];
    }
    player.setQueue([...queue.slice(0, queueCursor + 1), ...tail]);
  }, [queue, queueCursor]);

  const isQueueEmpty = queue.length === 0 || queueCursor == null;
  const hasVisibleRows =
    queue.length > 0 &&
    (!savedOnly ||
      (trackPlaying != null && savedIds.has(trackPlaying.id)) ||
      upcoming.some((track) => savedIds.has(track.id)));

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
            onClick={shuffleQueue}
            aria-label={t`Shuffle queue`}
            title={t`Shuffle queue`}
            {...stylex.props(styles.tool)}
          >
            <Icon name="shuffle" size={12} />
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
        <button
          type="button"
          aria-pressed={mostPlayed}
          aria-label={t`Sort by most played`}
          onClick={() => setMostPlayed((value) => !value)}
          data-on={mostPlayed ? 'true' : 'false'}
          title={t`Sort the queue by how many times each track has been played`}
          {...stylex.props(styles.filter, mostPlayed && styles.filterOn)}
        >
          {t`Most played`}
        </button>
        <span {...stylex.props(styles.sort)}>
          {mostPlayed ? t`sorted: most played` : t`sorted: manual`}
        </span>
      </div>

      {isQueueEmpty || !hasVisibleRows ? (
        <QueueEmpty />
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
    columnGap: '8px',
    height: '38px',
    flexShrink: 0,
    paddingInline: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
  },
  title: {
    margin: 0,
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '.1em',
    color: 'var(--text-dim)',
  },
  count: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10px',
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
    width: '24px',
    height: '24px',
    borderRadius: 'var(--radius-sm)',
    display: 'grid',
    placeItems: 'center',
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--text-bright)',
    },
    backgroundColor: {
      ':hover': 'var(--surface-hover)',
    },
    fontSize: '14px',
    lineHeight: 1,
    borderStyle: 'none',
    padding: 0,
  },
  sub: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    height: '34px',
    flexShrink: 0,
    paddingInline: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    fontFamily: 'var(--mono-font)',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-faint)',
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
    fontSize: '10px',
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
    color: 'var(--deep-pink)',
  },
  sort: {
    marginLeft: 'auto',
  },
});

