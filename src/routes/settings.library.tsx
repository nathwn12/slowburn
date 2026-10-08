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
import Panel from '../elements/Panel';
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
  const lastScanFailures = useLibraryStore((state) => state.lastScanFailures);
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
          <Setting.Description>
            {isLibraryRefreshing
              ? t`Scanning ${refresh.current}/${refresh.total}`
              : t`Up to date`}
          </Setting.Description>
        )}
        {libraryFolders.length > 0 &&
          !isLibraryRefreshing &&
          lastScanFailures > 0 && (
            <Setting.Description>
              {t`${lastScanFailures} file(s) could not be read during the last scan.`}
            </Setting.Description>
          )}
        {libraryFolders.length > 0 && (
          <Panel xstyle={styles.libraryFoldersPanel}>
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
                  <li
                    key={folder}
                    aria-label={folder}
                    {...stylex.props(styles.libraryFolderRow)}
                  >
                    <Flexbox align="center" gap={8}>
                      <button
                        type="button"
                        {...stylex.props(styles.libraryFoldersRemove)}
                        title={t`Remove`}
                        aria-label={t`Remove folder ${folder}`}
                        data-museeks-action
                        onClick={() =>
                          LibraryAPI.removeLibraryFolder(folder).then(
                            invalidate,
                          )
                        }
                      >
                        &times;
                      </button>
                      <span
                        {...stylex.props(styles.libraryFolderPath)}
                        title={folder}
                      >
                        {folder}
                      </span>
                      <span {...stylex.props(styles.libraryFolderMeta)}>
                        {trackCount} {trackCount === 1 ? t`track` : t`tracks`}
                      </span>
                    </Flexbox>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
        <Flexbox gap="space-2">
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
  libraryFoldersPanel: {
    paddingTop: 'var(--space-2)',
    paddingBottom: 'var(--space-2)',
    paddingLeft: 'var(--space-2)',
    paddingRight: 'var(--space-2)',
  },
  libraryFolders: {
    listStyle: 'none',
    paddingBlock: 0,
    paddingInline: 0,
    margin: '0',
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-sm)',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflowX: 'clip',
    display: 'flex',
    flexDirection: 'column',
    rowGap: 'var(--space-1)',
  },
  libraryFolderRow: {
    minWidth: 0,
    maxWidth: '100%',
    minHeight: 'var(--row-compact)',
    display: 'flex',
    alignItems: 'center',
  },
  libraryFolderPath: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: 'var(--text)',
  },
  libraryFolderMeta: {
    flexShrink: 0,
    whiteSpace: 'nowrap',
    color: 'var(--text-dim)',
    fontSize: 'var(--text-xs)',
  },
  libraryFoldersRemove: {
    flexShrink: 0,
    color: 'var(--danger)',
    borderStyle: 'none',
    backgroundColor: 'transparent',
    appearance: 'none',
    fontSize: 'var(--text-lg)',
    lineHeight: 1,
    minWidth: 'var(--row-compact)',
    minHeight: 'var(--row-compact)',
    cursor: 'pointer',
  },
});
