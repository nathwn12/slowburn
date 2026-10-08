import { Trans, useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ask, open } from '@tauri-apps/plugin-dialog';
import { useCallback } from 'react';

import LibraryAPI from '../api/LibraryAPI';
import * as Setting from '../components/Setting';
import Button from '../elements/Button';
import Flexbox from '../elements/Flexbox';
import useInvalidate, { useInvalidateCallback } from '../hooks/useInvalidate';
import { allTracksQuery, configQuery } from '../lib/queries';
import useLibraryStore from '../lib/store';

export const Route = createFileRoute('/settings/library')({
  component: ViewSettingsLibrary,
});

function ViewSettingsLibrary() {
  const config = useSuspenseQuery(configQuery).data;
  const libraryFolders = config.library_folders;
  const allTracks = useQuery(allTracksQuery).data ?? [];

  const isLibraryRefreshing = useLibraryStore((state) => state.refreshing);
  const refresh = useLibraryStore((state) => state.refresh);
  const invalidate = useInvalidate();
  const { t } = useLingui();

  const addLibraryFolders = useCallback(async () => {
    const paths = await open({
      directory: true,
      multiple: true,
    });

    if (paths == null) {
      return;
    }

    await LibraryAPI.addLibraryFolders(paths);
    await invalidate();
  }, [invalidate]);

  return (
    <>
      <Setting.Section>
        <Setting.Title>
          <Trans>Files</Trans>
        </Setting.Title>
        {libraryFolders.length === 0 && (
          <Setting.Description>
            <Trans>No library folders yet.</Trans>
          </Setting.Description>
        )}
        {libraryFolders.length > 0 && (
          <ul
            aria-label={t`Library folders`}
            {...stylex.props(styles.libraryFolders)}
          >
            {config.library_folders.map((folder) => {
              const trackCount = allTracks.filter(
                (track) =>
                  track.path === folder ||
                  track.path.startsWith(`${folder}/`) ||
                  track.path.startsWith(folder),
              ).length;

              return (
                <li key={folder} aria-label={folder}>
                  <Flexbox align="center">
                    <button
                      type="button"
                      {...stylex.props(styles.libraryFoldersRemove)}
                      title={t`Remove`}
                      aria-label={t`Remove folder ${folder}`}
                      data-museeks-action
                      onClick={() =>
                        LibraryAPI.removeLibraryFolder(folder).then(invalidate)
                      }
                    >
                      &times;
                    </button>
                    <span>{folder}</span>
                    <span>
                      {trackCount} {trackCount === 1 ? t`track` : t`tracks`}
                    </span>
                    <span>
                      {isLibraryRefreshing
                        ? t`Scanning ${refresh.current}/${refresh.total}`
                        : t`Up to date`}
                    </span>
                  </Flexbox>
                </li>
              );
            })}
          </ul>
        )}
        <Flexbox gap={4}>
          <Button
            disabled={isLibraryRefreshing}
            onClick={useInvalidateCallback(addLibraryFolders)}
          >
            <Trans>Add folder</Trans>
          </Button>
          <Button
            disabled={isLibraryRefreshing || libraryFolders.length === 0}
            onClick={useInvalidateCallback(() => LibraryAPI.scan())}
          >
            <Trans>Rescan all</Trans>
          </Button>
          <Button
            disabled={isLibraryRefreshing || libraryFolders.length === 0}
            onClick={useInvalidateCallback(async () => {
              const confirm = await ask(
                t`All track data will be updated from the base files, but your original files won't be modified. Any Slowburn-specific edits you may have done will be reset.`,
                {
                  title: t`Refresh all tracks?`,
                  kind: 'warning',
                  cancelLabel: t`Cancel`,
                  okLabel: t`Refresh`,
                },
              );

              if (confirm) {
                await LibraryAPI.scan(true);
              }
            })}
            title={t`Force the refresh of all tracks tags`}
          >
            <Trans>Refresh</Trans>
          </Button>
        </Flexbox>
        <Setting.Description>
          <Trans>
            <code>.m3u</code> files will also be imported as playlists.
          </Trans>
        </Setting.Description>
      </Setting.Section>
    </>
  );
}

const styles = stylex.create({
  libraryFolders: {
    listStyle: 'none',
    paddingBlock: '4px',
    paddingInline: '8px',
    margin: '0',
    fontFamily: 'monospace',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: 'var(--border-color)',
    overflowX: 'auto',
    whiteSpace: 'pre',
    width: '120%',
  },
  libraryFoldersRemove: {
    color: 'red',
    borderStyle: 'none',
    backgroundColor: 'transparent',
    appearance: 'none',
    fontSize: '16px',
  },
});
