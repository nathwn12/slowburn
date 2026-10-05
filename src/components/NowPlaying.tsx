import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useQuery } from '@tanstack/react-query';

import usePlayingTrack from '../hooks/usePlayingTrack';
import { allTracksQuery } from '../lib/queries';
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
  const { t } = useLingui();
  const repeat = 'None' as const;

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
                {t`or`} <b>{t`File ▸ Import folder…`}</b>
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
    overflow: 'hidden',
  },
  npTop: {
    display: 'flex',
    columnGap: '12px',
    minHeight: 0,
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
    borderColor: '#4b4b4b',
    display: 'grid',
    placeItems: 'center',
    color: '#555',
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
});
