import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from '@tanstack/react-router';

import Icon from '../components/Icon';
import DatabaseBridge from '../lib/bridge-database';

export const Route = createFileRoute('/artists')({
  component: ViewArtists,
  beforeLoad: async () => {
    const [artists, hasCompilations] = await Promise.all([
      DatabaseBridge.getAllArtists(),
      DatabaseBridge.hasCompilations(),
    ]);

    return { artists, hasCompilations };
  },
  loader: async ({ context }) => {
    return context;
  },
});

/**
 * The Artists view of the Library stack item: a dense list of artists (the
 * breadcrumb rail is gone). Selecting one lands on the artist's albums.
 */
function ViewArtists() {
  const { artists, hasCompilations } = Route.useLoaderData();
  const { pathname } = useLocation();
  const { t } = useLingui();

  if (pathname !== '/artists') {
    return <Outlet />;
  }

  const empty = artists.length === 0 && !hasCompilations;

  return (
    <div {...stylex.props(styles.view)}>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.title)}>{t`ARTISTS`}</h2>
        <span {...stylex.props(styles.count)}>
          {artists.length} {artists.length === 1 ? t`artist` : t`artists`}
        </span>
      </div>

      {empty ? (
        <div
          {...stylex.props(styles.empty)}
        >{t`No artists in your library`}</div>
      ) : (
        <ul aria-label={t`Artists`} {...stylex.props(styles.list)}>
          {artists.map((artist) => (
            <li key={artist}>
              <Link
                to="/artists/$artistID"
                params={{ artistID: artist }}
                draggable={false}
                {...stylex.props(styles.row)}
              >
                <span {...stylex.props(styles.rowName)}>{artist}</span>
                <span {...stylex.props(styles.chevron)} aria-hidden="true">
                  <Icon name="chevronDown" size={12} xstyle={styles.chevIcon} />
                </span>
              </Link>
            </li>
          ))}
          {hasCompilations && (
            <li>
              <Link
                to="/artists/presets/compilations"
                draggable={false}
                {...stylex.props(styles.row)}
              >
                <span {...stylex.props(styles.rowName)}>{t`Compilations`}</span>
                <span {...stylex.props(styles.chevron)} aria-hidden="true">
                  <Icon name="chevronDown" size={12} xstyle={styles.chevIcon} />
                </span>
              </Link>
            </li>
          )}
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
    color: 'var(--text-faint)',
    fontSize: 'var(--text-sm)',
  },
});
