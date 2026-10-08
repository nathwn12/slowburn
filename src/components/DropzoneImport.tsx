import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { lstat } from '@tauri-apps/plugin-fs';
import { useCallback, useEffect, useState } from 'react';

import LibraryAPI from '../api/LibraryAPI';
import useInvalidate from '../hooks/useInvalidate';
import DatabaseBridge from '../lib/bridge-database';
import player from '../lib/player';
import toastManager from '../lib/toast-manager';
import { logAndNotifyError } from '../lib/utils';

/**
 * File extensions the backend scanner accepts (mirrors
 * `SUPPORTED_AUDIO_FORMATS` in `src-tauri/src/libs/database.rs`).
 */
const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'aac',
  'm4a',
  '3gp',
  'wav',
  'ogg',
  'opus',
  'flac',
  'weba',
]);

function isAudioFile(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  return AUDIO_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

export default function DropzoneImport() {
  const { t } = useLingui();

  const [isShown, setIsShown] = useState(false);
  const invalidate = useInvalidate();

  // Hosts the player singleton's single audio element in the document (kept
  // `display: none`: playback and the Web Audio graph are unaffected, but the
  // real node - with its `preload="auto"` - is observable in the tree).
  const audioHostRef = useCallback((node: HTMLDivElement | null) => {
    if (node == null) return;
    const element = player.getAudioElement();
    if (!node.contains(element)) {
      node.appendChild(element);
    }
  }, []);

  // Simplification welcome
  useEffect(() => {
    async function attachFileDropEvent() {
      const unlisten = getCurrentWindow()
        .onDragDropEvent(async (event) => {
          if (event.payload.type === 'over') {
            setIsShown(true);
          } else if (event.payload.type === 'drop') {
            setIsShown(false);

            // Museeks does not deal in terms of files anymore, so we need to only retain folders.
            // Why? Because in case a user imports a specific file from within a folder, it should
            // ignore all other files, but it cannot do that as of today.
            const fileInfos = await Promise.all(
              event.payload.paths.map(async (path) => {
                return {
                  ...(await lstat(path)),
                  path,
                };
              }),
            );

            const folders = fileInfos
              .filter((fileOrFolder) => fileOrFolder.isDirectory)
              .map((folderInfo) => folderInfo.path);

            // S5: audio files dropped anywhere are queued, not ignored. Files
            // already in the library match by path; the rest are imported
            // first (the scanner reads files as well as folders).
            const audioFiles = fileInfos
              .filter(
                (fileOrFolder) =>
                  !fileOrFolder.isDirectory && isAudioFile(fileOrFolder.path),
              )
              .map((fileInfo) => fileInfo.path);

            const skippedItemsCount =
              event.payload.paths.length - folders.length - audioFiles.length;

            if (skippedItemsCount !== 0) {
              const message = plural(skippedItemsCount, {
                one: '# invalid item ignored',
                other: '# invalid items ignored',
              });

              toastManager.add({ title: message, type: 'warning' });
            }

            if (folders.length > 0) {
              await LibraryAPI.addLibraryFolders(folders);

              const message = plural(folders.length, {
                one: '# folder added to the library',
                other: '# folders added to the library',
              });

              toastManager.add({ title: message, type: 'success' });

              await LibraryAPI.scan();
              await invalidate();
            }

            if (audioFiles.length > 0) {
              await DatabaseBridge.importTracks(audioFiles);
              const tracks = await DatabaseBridge.getAllTracks();
              const dropped = tracks.filter((track) =>
                audioFiles.includes(track.path),
              );

              if (dropped.length > 0) {
                player.addToQueue(dropped);

                const message = plural(dropped.length, {
                  one: '# audio file queued',
                  other: '# audio files queued',
                });

                toastManager.add({ title: message, type: 'success' });
              }

              await invalidate();
            }
          } else {
            setIsShown(false);
          }
        })
        .catch(logAndNotifyError);

      return unlisten;
    }

    const unlisten = attachFileDropEvent().catch(logAndNotifyError);

    return function cleanup() {
      void unlisten.then((unlisten) => (unlisten ? unlisten() : null));
    };
  }, [invalidate]);

  return (
    <div {...stylex.props(styles.dropzone, isShown && styles.shown)}>
      <div
        {...stylex.props(styles.dropzoneTitle)}
      >{t`Add music to the library`}</div>
      <span>{t`Drop folders anywhere`}</span>
      <span>{t`Drop audio files anywhere to queue them`}</span>
      <div
        ref={audioHostRef}
        aria-hidden="true"
        {...stylex.props(styles.audioHost)}
      />
    </div>
  );
}

const styles = stylex.create({
  dropzone: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    backgroundColor: 'var(--faded-bg)',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    opacity: 0,
    transition: 'opacity 0.1s ease-in-out',
  },
  shown: {
    opacity: 1,
  },
  dropzoneTitle: {
    fontSize: '1.4rem',
    marginBottom: '8px',
  },
  audioHost: {
    display: 'none',
  },
});
