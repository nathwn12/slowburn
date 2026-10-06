import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import Link from '../elements/Link';
import type { Repeat, Track } from '../generated/typings';
import useEffectsConfig from '../hooks/useEffectsConfig';
import useFormattedDuration from '../hooks/useFormattedDuration';
import { usePlayerState } from '../hooks/usePlayer';
import usePlayingTrackCurrentTime from '../hooks/usePlayingTrackCurrentTime';
import {
  audioFormatLabel,
  formatBitDepth,
  formatBitrate,
  formatChannels,
  formatSampleRate,
  isLosslessFormat,
} from '../lib/dense-format';
import TrackProgress from './TrackProgress';

type Props = {
  trackPlaying: Track;
  shuffle: boolean;
  repeat: Repeat;
  /** Dense now-playing info: tech line + loop/effects chips. */
  variant?: 'compact' | 'dense';
};

export default function PlayingBarInfo(props: Props) {
  const { trackPlaying, variant = 'compact' } = props;
  const elapsed = usePlayingTrackCurrentTime();
  const abLoop = usePlayerState((state) => state.abLoop);
  const effects = useEffectsConfig();
  const { t } = useLingui();
  const formattedDuration = useFormattedDuration(trackPlaying.duration);
  const formattedProgress = useFormattedDuration(
    Math.min(trackPlaying.duration, elapsed),
  );

  if (variant === 'dense') {
    const format = audioFormatLabel(trackPlaying.path);
    const lossless = isLosslessFormat(format);

    const saved = abLoop.startSeconds != null || abLoop.endSeconds != null;
    const slow = effects.slow;
    const reverbPct = Math.round(effects.reverbIntensity * 100);
    const slowEngaged = Math.abs(slow - 1) > 0.0001;
    const reverbEngaged = reverbPct > 0;
    const effectsEngaged = slowEngaged || reverbEngaged;

    const effectsBits: string[] = [];
    if (slowEngaged) effectsBits.push(`Slow ${slow.toFixed(2)}×`);
    if (reverbEngaged) effectsBits.push(`Reverb ${reverbPct}%`);

    const albumMeta: string[] = [];
    if (trackPlaying.year != null) albumMeta.push(String(trackPlaying.year));
    if (trackPlaying.track_no != null) {
      albumMeta.push(
        trackPlaying.track_of != null
          ? `track ${trackPlaying.track_no}/${trackPlaying.track_of}`
          : `track ${trackPlaying.track_no}`,
      );
    }

    return (
      <div {...stylex.props(styles.npInfo)}>
        <div {...stylex.props(styles.npTitle)} title={trackPlaying.title}>
          {trackPlaying.title}
        </div>
        <div
          {...stylex.props(styles.npArtist)}
          title={trackPlaying.artists.join(', ')}
        >
          {trackPlaying.artists.join(', ')}
        </div>
        <div {...stylex.props(styles.npAlbum)} title={trackPlaying.album}>
          {trackPlaying.album}
          {albumMeta.length > 0 && (
            <span {...stylex.props(styles.npYear)}>
              {' · '}
              {albumMeta.join(' · ')}
            </span>
          )}
        </div>

        <div
          {...stylex.props(styles.tech)}
          aria-label={t`Technical format information`}
        >
          <span {...stylex.props(styles.techCell, lossless && styles.lossless)}>
            {format}
          </span>
          <span {...stylex.props(styles.techCell)}>
            {formatSampleRate(trackPlaying.sample_rate)}
          </span>
          <span {...stylex.props(styles.techCell)}>
            {formatBitrate(trackPlaying.bitrate)}
          </span>
          <span {...stylex.props(styles.techCell)}>
            {formatBitDepth(trackPlaying.bit_depth)}
          </span>
          <span {...stylex.props(styles.techCell)}>
            {formatChannels(trackPlaying.channels)}
          </span>
        </div>

        <div {...stylex.props(styles.npChips)}>
          <span
            {...stylex.props(styles.chip, saved && styles.chipLive)}
            title={t`A-B loop state for this file`}
          >
            <span {...stylex.props(styles.chipDot)} aria-hidden="true" />
            {saved ? t`A–B loop saved` : t`No loop for this track`}
          </span>
          <span
            {...stylex.props(styles.chip, effectsEngaged && styles.chipLive)}
            title={t`Slow and reverb state`}
          >
            <span {...stylex.props(styles.chipDot)} aria-hidden="true" />
            {effectsEngaged
              ? `${effectsBits.join(' · ')} engaged`
              : t`Effects neutral (1.00× · dry)`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.playingBarInfo)} data-tauri-drag-region>
      <div {...stylex.props(styles.playingBarInfoMetas)}>
        <div {...stylex.props(styles.duration)}>{formattedProgress}</div>

        <div {...stylex.props(styles.metas)}>
          <strong {...stylex.props(styles.metadata, styles.metadataTitle)}>
            {trackPlaying.title}
          </strong>
          <div {...stylex.props(styles.metadata)}>
            <Link
              inheritColor
              type="normal"
              linkOptions={
                trackPlaying.is_compilation
                  ? {
                      to: '/artists/presets/compilations',
                      search: { focused_album: trackPlaying.album },
                    }
                  : {
                      to: '/artists/$artistID',
                      params: { artistID: trackPlaying.album_artist },
                    }
              }
            >
              {trackPlaying.artists.join(', ')}
            </Link>
            &nbsp;—&nbsp;
            <Link
              inheritColor
              type="normal"
              linkOptions={
                trackPlaying.is_compilation
                  ? {
                      to: '/artists/presets/compilations',
                      search: { focused_album: trackPlaying.album },
                    }
                  : {
                      to: '/artists/$artistID',
                      params: { artistID: trackPlaying.album_artist },
                      search: { focused_album: trackPlaying.album },
                    }
              }
            >
              {trackPlaying.album}
            </Link>
          </div>
        </div>

        <div {...stylex.props(styles.duration)}>{formattedDuration}</div>
      </div>
      <TrackProgress trackPlaying={trackPlaying} />
    </div>
  );
}

const styles = stylex.create({
  // --- Dense info (.np-info) ---------------------------------------------
  npInfo: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: '2px',
    rowGap: '3px',
  },
  npTitle: {
    fontSize: '17px',
    fontWeight: 700,
    lineHeight: 1.2,
    color: 'var(--text-bright)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  npArtist: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-dim)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  npAlbum: {
    fontSize: '11px',
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  npYear: {
    color: 'var(--text-faint)',
  },
  tech: {
    marginTop: '6px',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    lineHeight: 1,
    color: 'var(--text-dim)',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius-sm)',
    paddingBlock: '6px',
    paddingInline: '8px',
    width: 'fit-content',
    maxWidth: '100%',
  },
  lossless: {
    color: 'var(--success)',
    fontWeight: 700,
  },
  techCell: {
    whiteSpace: 'nowrap',
    paddingLeft: {
      default: '7px',
      ':first-child': '0',
    },
    paddingRight: {
      default: '7px',
      ':last-child': '0',
    },
    borderLeftWidth: {
      default: '1px',
      ':first-child': 0,
    },
    borderLeftStyle: 'solid',
    borderLeftColor: 'rgba(255,255,255,.07)',
  },
  npChips: {
    display: 'flex',
    columnGap: '6px',
    marginTop: 'auto',
    paddingBottom: '2px',
    flexWrap: 'wrap',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '5px',
    height: '20px',
    paddingInline: '8px',
    borderRadius: '9999px',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: 1,
    color: 'var(--text-dim)',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
  },
  chipDot: {
    width: '5px',
    height: '5px',
    flexShrink: 0,
    borderRadius: '50%',
    backgroundColor: 'var(--text-faint)',
  },
  chipLive: {
    color: 'var(--pink-text)',
    backgroundColor: 'var(--pink-soft)',
    borderColor: 'var(--pink-line)',
  },

  // --- Compact info (header mini-bar, unchanged) --------------------------
  playingBarInfo: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: '8px',
    paddingRight: '8px',
  },
  playingBarInfoMetas: {
    rowGap: '4px',
    columnGap: '4px',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  metas: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    verticalAlign: 'middle',
    textAlign: 'center',
  },
  metadataTitle: {
    fontWeight: 'var(--bold)',
    marginBottom: '2px',
  },
  metadata: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  duration: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    fontSize: '0.875rem',
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: '2px',
    paddingRight: '2px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    opacity: 0.7,
  },
});
