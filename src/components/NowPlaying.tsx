import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useQuery } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback } from 'react';

import LibraryAPI from '../api/LibraryAPI';
import useInvalidate from '../hooks/useInvalidate';
import usePlayingTrack from '../hooks/usePlayingTrack';
import { allTracksQuery } from '../lib/queries';
import { logAndNotifyError } from '../lib/utils';
import Cover from './Cover';
import EffectControls from './EffectControls';
import Icon from './Icon';
import LoopControls from './LoopControls';
import PlayerControls from './PlayerControls';
import PlayingBarInfo from './PlayingBarInfo';
import TrackDetails from './TrackDetails';
import TrackProgress from './TrackProgress';

/**
 * The left column of the Dense layout: the whole "now" half of the job —
 * art, facts, the A-B seek, the transport, the Burn strip and the detail
 * ledger — visible at once, no tabs.
 */
export default function NowPlaying() {
  const trackPlaying = usePlayingTrack();
  const allTracks = useQuery(allTracksQuery).data;
  const invalidate = useInvalidate();
  const { t } = useLingui();
  const repeat = 'None' as const;

  // The same path as Ctrl+O, as a real affordance (there is no File menu).
  const importFolders = useCallback(async () => {
    try {
      const selection = await open({ directory: true, multiple: true });
      if (selection == null) return;
      const folders = Array.isArray(selection) ? selection : [selection];
      if (folders.length === 0) return;
      await LibraryAPI.addLibraryFolders(folders);
      await LibraryAPI.scan();
      await invalidate();
    } catch (error) {
      logAndNotifyError(error);
    }
  }, [invalidate]);

  if (trackPlaying == null) {
    const libraryEmpty = (allTracks?.length ?? 0) === 0;

    return (
      <section aria-label={t`Now playing`} {...stylex.props(styles.now)}>
        <div {...stylex.props(styles.emptyNp)}>
          <div {...stylex.props(styles.emptyArt)} aria-hidden="true">
            <Icon name="musicalNotes" size={36} />
          </div>

          {libraryEmpty ? (
            <>
              <h3 {...stylex.props(styles.emptyTitle)}>{t`Your library is empty`}</h3>
              <p {...stylex.props(styles.emptyText)}>
                {t`Slowburn plays files you already own. Nothing is streamed, nothing leaves this machine.`}
              </p>
              <div {...stylex.props(styles.emptyRules)}>
                <b>{t`Drag`}</b> FLAC · MP3 · M4A · OGG · WAV {t`onto the window`}
                <br />
                <button
                  type="button"
                  onClick={() => void importFolders()}
                  {...stylex.props(styles.importBtn)}
                >
                  {t`Import folder…`}
                </button>
                <br />
                <b>Ctrl+O</b> {t`to open files`}
              </div>
            </>
          ) : (
            <>
              <h3 {...stylex.props(styles.emptyTitle)}>{t`Nothing playing`}</h3>
              <p {...stylex.props(styles.emptyText)}>
                {t`Pick a track from the library to begin.`}
              </p>
            </>
          )}
        </div>

        {/* Kept so the idle now-playing column still offers the one global
            transport affordance the app has always had (e2e asserts it). */}
        <div {...stylex.props(styles.transportWrap)}>
          <PlayerControls dense />
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t`Now playing`} {...stylex.props(styles.now)}>
      <div {...stylex.props(styles.npTop)}>
        <Cover track={trackPlaying} dense />
        <PlayingBarInfo
          trackPlaying={trackPlaying}
          shuffle={false}
          repeat={repeat}
          variant="dense"
        />
      </div>

      <div {...stylex.props(styles.transportWrap)}>
        <TrackProgress trackPlaying={trackPlaying} dense />
        <LoopControls trackPlaying={trackPlaying} />
        <PlayerControls dense />
      </div>

      <EffectControls />

      <TrackDetails trackPlaying={trackPlaying} />
    </section>
  );
}

const styles = stylex.create({
  now: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    paddingTop: '12px',
    paddingBottom: '10px',
    paddingInline: '12px',
    rowGap: '10px',
    backgroundColor: 'var(--bg)',
    // Scroll rather than clip: below the design height the ledger and Burn
    // strip must stay reachable.
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  npTop: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: '12px',
    rowGap: '8px',
    // Keep the header block at its content height: with the column's
    // `overflow-y: auto` this makes the stack genuinely overflow and scroll,
    // instead of flex-shrinking the metadata to nothing so the opaque
    // transport card below paints over its overflowing contents.
    flexShrink: 0,
  },
  transportWrap: {
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: '8px',
    paddingTop: '9px',
    paddingBottom: '10px',
    paddingInline: '11px',
    display: 'flex',
    flexDirection: 'column',
    rowGap: '9px',
  },

  // --- empty library ------------------------------------------------------
  emptyNp: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    rowGap: '12px',
    textAlign: 'center',
    padding: '20px',
  },
  emptyArt: {
    width: '96px',
    height: '96px',
    borderRadius: 'var(--radius)',
    borderWidth: '1.5px',
    borderStyle: 'dashed',
    borderColor: 'var(--control-border)',
    display: 'grid',
    placeItems: 'center',
    color: 'var(--text-faint)',
    backgroundColor: 'rgba(255,255,255,.015)',
  },
  emptyTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-dim)',
  },
  emptyText: {
    margin: 0,
    fontSize: '11.5px',
    color: 'var(--text-faint)',
    maxWidth: '300px',
    lineHeight: 1.5,
  },
  emptyRules: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: 1.9,
    color: 'var(--text-faint)',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius)',
    paddingBlock: '10px',
    paddingInline: '14px',
    textAlign: 'left',
  },
  importBtn: {
    marginBlock: '2px',
    paddingBlock: '4px',
    paddingInline: '10px',
    borderRadius: 'var(--radius-sm)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--control-border)',
    backgroundColor: 'var(--surface)',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    fontFamily: 'var(--mono-font)',
    fontSize: '10px',
    fontWeight: 700,
    cursor: 'pointer',
  },
});

