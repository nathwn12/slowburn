import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import useEffectsConfig from '../hooks/useEffectsConfig';
import usePlayingTrack from '../hooks/usePlayingTrack';
import { usePlayerState } from '../hooks/usePlayer';
import { NO_VALUE, audioFormatLabel, formatFileSize, isLosslessFormat } from '../lib/dense-format';
import { allTracksQuery } from '../lib/queries';
import useLibraryStore from '../lib/store';
import { parseDuration } from '../hooks/useFormattedDuration';
import Icon from './Icon';

/**
 * The Dense status bar (design §1/§5): a 26 px "ledger" that restates library
 * totals, the playing format, the effects state, the loop state and the output
 * in prose — so none of it is colour-only.
 */
export default function StatusBar() {
  const { t } = useLingui();
  const allTracks = useQuery(allTracksQuery).data;
  const refreshing = useLibraryStore((state) => state.refreshing);
  const trackPlaying = usePlayingTrack();
  const effects = useEffectsConfig();
  const abLoop = usePlayerState((state) => state.abLoop);

  const totalDuration = useMemo(
    () => (allTracks ?? []).reduce((acc, track) => acc + track.duration, 0),
    [allTracks],
  );
  const totalSize = useMemo(
    () => (allTracks ?? []).reduce((acc, track) => acc + (track.file_size ?? 0), 0),
    [allTracks],
  );

  const count = allTracks?.length ?? 0;
  const format = trackPlaying ? audioFormatLabel(trackPlaying.path) : NO_VALUE;
  const lossless = trackPlaying != null && isLosslessFormat(format);
  const sampleRateShort =
    trackPlaying?.sample_rate != null
      ? String(trackPlaying.sample_rate / 1000)
      : null;
  const bitDepthShort = trackPlaying?.bit_depth ?? null;
  const formatSummary =
    trackPlaying == null
      ? NO_VALUE
      : [
          format,
          sampleRateShort != null && bitDepthShort != null
            ? `${sampleRateShort}/${bitDepthShort}`
            : (sampleRateShort ?? null),
          `· ${lossless ? t`lossless` : t`lossy`}`,
        ]
          .filter((part): part is string => part != null)
          .join(' ');

  const slowEngaged = Math.abs(effects.slow - 1) > 0.0001;
  const reverbPct = Math.round(effects.reverbIntensity * 100);
  const reverbEngaged = reverbPct > 0;
  const effectsEngaged = slowEngaged || reverbEngaged;

  const saved = abLoop.startSeconds != null || abLoop.endSeconds != null;
  const looping = saved && abLoop.active;

  const effectsBits: string[] = [];
  if (slowEngaged) effectsBits.push(`Slow ${effects.slow.toFixed(2)}×`);
  if (reverbEngaged) effectsBits.push(`Reverb ${reverbPct}%`);
  const effectsText = effectsEngaged
    ? `${effectsBits.join(' · ')} engaged`
    : t`Effects neutral (1.00× · dry)`;

  const loopText = saved
    ? looping
      ? t`A–B saved · looping`
      : t`A–B saved · armed`
    : t`No A–B loop`;

  return (
    <footer
      aria-label={t`Status bar`}
      {...stylex.props(styles.status)}
    >
      <span {...stylex.props(styles.st)}>
        {refreshing
          ? t`scanning tracks…`
          : `${count.toLocaleString()} ${count === 1 ? t`track` : t`tracks`} · ${formatFileSize(totalSize)} · ${parseDuration(totalDuration)}`}
      </span>

      <span {...stylex.props(styles.sep)} aria-hidden="true" />

      <span {...stylex.props(styles.st)} title={t`Format of the playing track`}>
        {formatSummary}
      </span>

      <span {...stylex.props(styles.spacer)} />

      <span
        {...stylex.props(styles.st, effectsEngaged && styles.stEff)}
        title={effectsText}
      >
        <span
          {...stylex.props(styles.dot, effectsEngaged && styles.dotEff)}
          aria-hidden="true"
        />
        {effectsEngaged ? t`Effects engaged` : t`Effects neutral`}
      </span>

      <span {...stylex.props(styles.sep)} aria-hidden="true" />

      <span {...stylex.props(styles.st)} title={loopText}>
        <span
          {...stylex.props(styles.dot, saved && styles.dotLoop)}
          aria-hidden="true"
        />
        {loopText}
      </span>

      <span {...stylex.props(styles.sep)} aria-hidden="true" />

      <span
        {...stylex.props(styles.st)}
        title={t`This webview renders through the operating system's default output device.`}
      >
        <Icon name="volumeHigh" size={12} />
        {t`Output: system default`}
      </span>
    </footer>
  );
}

const styles = stylex.create({
  status: {
    height: '26px',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    display: 'flex',
    alignItems: 'center',
    columnGap: '10px',
    paddingBlock: 0,
    paddingInline: '12px',
    backgroundColor: 'var(--bg)',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--border)',
    fontFamily: 'var(--mono-font)',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
  },
  st: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  spacer: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
  },
  sep: {
    width: '1px',
    height: '12px',
    flexShrink: 0,
    backgroundColor: 'var(--border-soft)',
  },
  dot: {
    width: '6px',
    height: '6px',
    flexShrink: 0,
    borderRadius: '50%',
    backgroundColor: 'var(--text-faint)',
  },
  dotEff: {
    backgroundColor: 'var(--deep-pink)',
    boxShadow: '0 0 6px var(--deep-pink)',
  },
  dotLoop: {
    backgroundColor: 'var(--deep-pink)',
  },
  stEff: {
    color: '#ffb8dd',
  },
});
