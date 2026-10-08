import { Trans, useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import {
  createFileRoute,
  Link,
  Outlet,
  useMatch,
  useNavigate,
} from '@tanstack/react-router';
import { useCallback } from 'react';

import PlaylistsAPI from '../api/PlaylistsAPI';
import Icon from '../components/Icon';
import useInvalidate from '../hooks/useInvalidate';
import DatabaseBridge from '../lib/bridge-database';

export const Route = createFileRoute('/playlists')({
  component: ViewPlaylists,
  beforeLoad: async () => {
    const playlists = await DatabaseBridge.getAllPlaylists();
    return { playlists };
  },
  loader: async ({ context }) => {
    return context;
  },
});

/**
 * The Playlists view of the right-column stack: a dense list of playlists
 * (the breadcrumb rail is gone). Selecting one opens its tracks.
 */
function ViewPlaylists() {
  const { playlists } = Route.useLoaderData();
  const { t } = useLingui();

  const invalidate = useInvalidate();
  const navigate = useNavigate();

  const createPlaylist = useCallback(async () => {
    const playlist = await PlaylistsAPI.create(t`New playlist`, [], false);

    if (playlist) {
      await invalidate();
      void navigate({
        to: '/playlists/$playlistID',
        params: { playlistID: playlist.id },
      });
    }
  }, [navigate, invalidate, t]);

  const childPlaylistMatch = useMatch({
    from: '/playlists/$playlistID',
    shouldThrow: false,
  });

  if (childPlaylistMatch) {
    return <Outlet />;
  }

  return (
    <div {...stylex.props(styles.view)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t`PLAYLISTS`}</h2>
        <span {...stylex.props(styles.count)}>
          {playlists.length}{' '}
          {playlists.length === 1 ? t`playlist` : t`playlists`}
        </span>
        <button
          type="button"
          onClick={createPlaylist}
          aria-label={t`New Playlist`}
          title={t`New Playlist`}
          {...stylex.props(styles.tool)}
        >
          <Icon name="plus" size={12} />
        </button>
      </div>

      {playlists.length === 0 ? (
        <div {...stylex.props(styles.empty)}>
          <p>
            <Trans>You haven{"'"}t created any playlist yet</Trans>
          </p>
          <button
            type="button"
            onClick={createPlaylist}
            {...stylex.props(styles.createLink)}
          >
            <Trans>Create one now</Trans>
          </button>
        </div>
      ) : (
        <ul
          role="listbox"
          aria-label={t`Playlists`}
          {...stylex.props(styles.list)}
        >
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <Link
                to="/playlists/$playlistID"
                params={{ playlistID: playlist.id }}
                draggable={false}
                {...stylex.props(styles.row)}
              >
                <Icon name="playlist" size={12} />
                <span {...stylex.props(styles.rowName)}>{playlist.name}</span>
                <span {...stylex.props(styles.chevron)} aria-hidden="true">
                  <Icon name="chevronDown" size={12} xstyle={styles.chevIcon} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  tool: {
    marginLeft: 'auto',
    width: 'var(--space-5)',
    height: 'var(--space-5)',
    borderRadius: 'var(--radius-sm)',
    display: 'grid',
    placeItems: 'center',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    backgroundColor: {
      ':hover': 'var(--surface-hover)',
    },
    borderStyle: 'none',
    padding: 0,
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
    overflowY: 'auto',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    paddingBlock: '2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    columnGap: 'var(--space-2)',
    // Same rhythm as the queue/track rows: the shared compact row token.
    minHeight: 'var(--row-compact)',
    paddingInline: 'var(--space-3)',
    color: 'var(--text)',
    textDecoration: 'none',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
  },
  rowName: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chevron: {
    color: 'var(--text-faint)',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
  },
  // The set carries no right chevron: the down chevron rotated to point
  // right keeps list chevrons on the shared Icon instead of a `'` glyph.
  chevIcon: {
    transform: 'rotate(-90deg)',
  },
  empty: {
    flexGrow: 1,
    display: 'grid',
    placeItems: 'center',
    alignContent: 'center',
    rowGap: 'var(--space-2)',
    color: 'var(--text-faint)',
    fontSize: 'var(--text-sm)',
    textAlign: 'center',
    padding: 'var(--space-5)',
  },
  createLink: {
    color: 'var(--accent)',
    fontWeight: 700,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    borderStyle: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    paddingBlock: '2px',
    paddingInline: '8px',
    outline: {
      ':focus-visible': '2px solid var(--focus-color)',
    },
    outlineOffset: '1px',
  },
});
