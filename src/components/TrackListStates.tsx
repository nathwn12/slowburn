import { Trans } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import LibraryAPI from '../api/LibraryAPI';
import Link from '../elements/Link';
import * as ViewMessage from '../elements/ViewMessage';
import type { Track, TrackGroup } from '../generated/typings';
import useLibraryStore from '../lib/store';

type Props = {
  isLoading: boolean;
  tracks: Array<Track> | Array<TrackGroup>;
  children?: React.ReactNode;
};

export default function TrackListStates(props: Props) {
  const { isLoading, tracks, children } = props;

  const refreshing = useLibraryStore((state) => state.refreshing);
  const search = useLibraryStore((state) => state.search);

  // Refreshing library
  if (isLoading) {
    return (
      <ViewMessage.Notice>
        <p>
          <Trans>Loading library...</Trans>
        </p>
      </ViewMessage.Notice>
    );
  }

  // Refreshing library
  if (refreshing) {
    return (
      <ViewMessage.Notice>
        <p>
          <Trans>Your library is being scanned</Trans>
        </p>
        <ViewMessage.Sub>
          <Trans>hold on...</Trans>
        </ViewMessage.Sub>
      </ViewMessage.Notice>
    );
  }

  // Empty library
  if (tracks.length === 0 && search === '') {
    return (
      <ViewMessage.Notice>
        <p>
          <Trans>There is no music in your library</Trans>
        </p>
        <ViewMessage.Sub>
          <Trans>
            you can{' '}
            <Link linkOptions={{ to: '/settings/library' }}>
              add your music here
            </Link>
          </Trans>
        </ViewMessage.Sub>
      </ViewMessage.Notice>
    );
  }

  // Empty search: offer a way out instead of a dead end (mirrors the
  // empty-library state above, which links to the library settings).
  if (tracks.length === 0) {
    return (
      <ViewMessage.Notice>
        <p>
          <Trans>Your search returned no results</Trans>
        </p>
        <ViewMessage.Sub>
          <button
            type="button"
            onClick={() => LibraryAPI.search('')}
            {...stylex.props(styles.clearSearch)}
          >
            <Trans>Show all tracks</Trans>
          </button>
        </ViewMessage.Sub>
      </ViewMessage.Notice>
    );
  }

  return <>{children}</>;
}

const styles = stylex.create({
  clearSearch: {
    color: 'var(--accent)',
    fontWeight: 700,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    borderStyle: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontSize: 'inherit',
    paddingBlock: '2px',
    paddingInline: '6px',
    outline: {
      ':focus-visible': '2px solid var(--focus-color)',
    },
    outlineOffset: '1px',
  },
});
