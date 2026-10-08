import { Slider } from '@base-ui/react/slider';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Track } from '../generated/typings';
import useFormattedDuration from '../hooks/useFormattedDuration';
import { usePlayerState } from '../hooks/usePlayer';
import usePlayingTrackCurrentTime from '../hooks/usePlayingTrackCurrentTime';
import { clampSeconds } from '../lib/dense-ab';
import { formatClock } from '../lib/dense-format';
import player from '../lib/player';
import { useWaveform, type Peaks } from './useWaveform';

type Props = {
  trackPlaying: Track;
  /** Dense now-playing seek: gutter + hatched A-B region + slider handles. */
  dense?: boolean;
};

export default function TrackProgress(props: Props) {
  if (props.dense) {
    return <DenseSeek trackPlaying={props.trackPlaying} />;
  }
  return <CompactProgress trackPlaying={props.trackPlaying} />;
}

/* -------------------------------------------------------------------------- */
/* Dense seek (.seek)                                                         */
/* -------------------------------------------------------------------------- */

function DenseSeek({ trackPlaying }: { trackPlaying: Track }) {
  const abLoop = usePlayerState((state) => state.abLoop);
  const elapsed = usePlayingTrackCurrentTime();
  const peaks = useWaveform(trackPlaying);
  const { t } = useLingui();

  const trackRef = useRef<HTMLDivElement>(null);
  const [seeking, setSeeking] = useState(false);
  // Drag-local preview: the fill/playhead track the pointer at 60fps while
  // scrubbing, instead of waiting for the engine's ~4 Hz `timeupdate`.
  const [previewTime, setPreviewTime] = useState<number | null>(null);

  const duration = trackPlaying.duration;
  const denom = duration > 0 ? duration : 1;
  const shownTime = Math.min(previewTime ?? elapsed, duration);
  const a = abLoop.startSeconds;
  const b = abLoop.endSeconds;
  const hasRegion = a != null || b != null;

  const lo = a != null ? a : 0;
  const hi = b != null ? b : a != null ? Math.max(shownTime, a) : 0;
  const regionWidth = Math.max(0, hi - lo);

  const posFromEvent = useCallback((clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const seekTo = useCallback(
    (seconds: number) => {
      player.setCurrentTime(clampSeconds(seconds, duration));
    },
    [duration],
  );

  const onTrackPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      trackRef.current?.setPointerCapture(e.pointerId);
      setSeeking(true);
      const seconds = posFromEvent(e.clientX) * duration;
      setPreviewTime(seconds);
      seekTo(seconds);
    },
    [duration, posFromEvent, seekTo],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!seeking) return;
      const seconds = posFromEvent(e.clientX) * duration;
      setPreviewTime(seconds);
      seekTo(seconds);
    },
    [duration, posFromEvent, seekTo, seeking],
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!seeking) return;
      try {
        trackRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // capture already gone
      }
      setSeeking(false);
      setPreviewTime(null);
    },
    [seeking],
  );

  return (
    <div
      role="group"
      aria-label={t`Seek bar with A-B loop region`}
      {...stylex.props(styles.seek)}
    >
      <div {...stylex.props(styles.seekTimes)}>
        <span {...stylex.props(styles.elapsedText)}>
          {formatClock(Math.min(shownTime, duration))}
        </span>
        <span {...stylex.props(styles.totalText)}>{formatClock(duration)}</span>
      </div>

      <div
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        {...stylex.props(styles.seekTrack)}
      >
        {peaks != null ? (
          <>
            <Waveform peaks={peaks} />
            <div
              {...stylex.props(styles.waveElapsed)}
              style={{
                width: `${(Math.min(shownTime, denom) / denom) * 100}%`,
              }}
            />
          </>
        ) : (
          <div {...stylex.props(styles.gutter)}>
            <div
              {...stylex.props(styles.seekElapsed)}
              style={{
                width: `${(Math.min(shownTime, denom) / denom) * 100}%`,
              }}
            />
          </div>
        )}

        {hasRegion && (
          <div
            {...stylex.props(styles.abRegion)}
            style={{
              left: `${(lo / denom) * 100}%`,
              width: `${(regionWidth / denom) * 100}%`,
              display: 'block',
            }}
          >
            <span {...stylex.props(styles.abTag)}>A–B LOOP</span>
          </div>
        )}

        <div
          {...stylex.props(styles.seekHead)}
          style={{ left: `${(Math.min(shownTime, denom) / denom) * 100}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Waveform                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The seek waveform: a canvas envelope mirrored around the centre line. It is
 * decorative (`aria-hidden`) and sits under the bar; all pointer interaction
 * stays on the parent `.seek-track`.
 */
function Waveform({ peaks }: { peaks: Peaks }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas == null) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d');
      if (ctx == null) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const mid = height / 2;
      const amplitude = mid * 0.92;
      const count = peaks.max.length;
      // Canvas can't resolve CSS vars itself; read the themed token once.
      ctx.fillStyle =
        getComputedStyle(canvas).getPropertyValue('--text-faint').trim() ||
        '#6b7280';
      for (let x = 0; x < width; x += 1) {
        const from = Math.floor((x * count) / width);
        const to = Math.max(from + 1, Math.floor(((x + 1) * count) / width));
        let lo = 0;
        let hi = 0;
        for (let b = from; b < to && b < count; b += 1) {
          if (peaks.min[b] < lo) lo = peaks.min[b];
          if (peaks.max[b] > hi) hi = peaks.max[b];
        }
        const top = mid - hi * amplitude;
        const bottom = mid - lo * amplitude;
        ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks]);

  return (
    <canvas ref={ref} aria-hidden="true" {...stylex.props(styles.waveCanvas)} />
  );
}

/* -------------------------------------------------------------------------- */
/* Compact seek (header mini-bar, unchanged behaviour)                        */
/* -------------------------------------------------------------------------- */

function CompactProgress({ trackPlaying }: { trackPlaying: Track }) {
  const elapsed = usePlayingTrackCurrentTime();

  const jumpAudioTo = useCallback((value: number) => {
    player.setCurrentTime(value);
  }, []);

  const [tooltipTargetTime, setTooltipTargetTime] = useState<null | number>(
    null,
  );
  const [tooltipX, setTooltipX] = useState<null | number>(null);

  const showTooltip = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const { offsetX } = e.nativeEvent;
      const barWidth = e.currentTarget.offsetWidth;

      const percent = (offsetX / barWidth) * 100;

      const time = (percent * trackPlaying.duration) / 100;

      setTooltipTargetTime(time);
      setTooltipX(percent);
    },
    [trackPlaying],
  );

  const hideTooltip = useCallback(() => {
    setTooltipTargetTime(null);
    setTooltipX(null);
  }, []);

  const tooltipContent = useFormattedDuration(tooltipTargetTime);

  return (
    <Slider.Root
      min={0}
      max={trackPlaying.duration}
      step={1}
      value={elapsed}
      onValueChange={jumpAudioTo}
    >
      <Slider.Control
        {...stylex.props(styles.trackRoot)}
        onMouseMoveCapture={showTooltip}
        onMouseLeave={hideTooltip}
      >
        <Slider.Track {...stylex.props(styles.trackProgress)}>
          <Slider.Indicator {...stylex.props(styles.trackRange)} />
          <div
            {...stylex.props(styles.progressTooltip)}
            style={{
              left: `${tooltipX}%`,
              display: tooltipX == null ? 'none' : 'block',
            }}
          >
            {tooltipContent}
          </div>
        </Slider.Track>
        <Slider.Thumb />
      </Slider.Control>
    </Slider.Root>
  );
}

const styles = stylex.create({
  // --- Dense seek ---------------------------------------------------------
  seek: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '5px',
  },
  seekTimes: {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    lineHeight: 1,
  },
  elapsedText: {
    color: 'var(--text-dim)',
    fontVariantNumeric: 'tabular-nums',
  },
  totalText: {
    color: 'var(--text-faint)',
    fontVariantNumeric: 'tabular-nums',
  },
  seekTrack: {
    position: 'relative',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    touchAction: 'none',
  },
  gutter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 'calc(50% - 3px)',
    height: '6px',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--surface-inset)',
    borderRadius: '9999px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03)',
    overflow: 'visible',
  },
  waveCanvas: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  waveElapsed: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,20,147,.55)',
    borderTopLeftRadius: '3px',
    borderBottomLeftRadius: '3px',
    pointerEvents: 'none',
  },
  abRegion: {
    position: 'absolute',
    top: 'calc(50% - 4px)',
    height: '8px',
    left: 0,
    width: 0,
    display: 'none',
    backgroundColor: 'rgba(255,20,147,.2)',
    backgroundImage:
      'repeating-linear-gradient(115deg, rgba(255,20,147,.45) 0 6px, rgba(255,20,147,.22) 6px 12px)',
    borderLeftWidth: '2px',
    borderRightWidth: '2px',
    borderTopWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftStyle: 'solid',
    borderRightStyle: 'solid',
    borderTopStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftColor: 'var(--deep-pink)',
    borderRightColor: 'var(--deep-pink)',
    borderTopColor: 'rgba(255,20,147,.55)',
    borderBottomColor: 'rgba(255,20,147,.55)',
    borderRadius: '3px',
  },
  abTag: {
    position: 'absolute',
    top: '-16px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '8.5px',
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '.09em',
    color: 'var(--on-accent-ink)',
    backgroundColor: 'var(--deep-pink)',
    paddingBlock: '3px',
    paddingInline: '7px',
    borderRadius: '9999px',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(255,20,147,.5)',
    pointerEvents: 'none',
  },
  seekElapsed: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 0,
    backgroundImage:
      'linear-gradient(180deg, var(--accent) 0%, var(--accent-hover) 100%)',
    borderTopLeftRadius: '3px',
    borderBottomLeftRadius: '3px',
    pointerEvents: 'none',
  },
  seekHead: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '12px',
    height: '12px',
    marginLeft: '-6px',
    transform: 'translateY(-50%)',
    borderRadius: '50%',
    backgroundColor: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,.6), 0 0 0 2px var(--accent)',
    pointerEvents: 'none',
    transitionProperty: 'transform',
    transitionDuration: '.08s',
  },

  // --- Compact seek -------------------------------------------------------
  trackRoot: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
    touchAction: 'none',
    height: '7px',
    transform: 'translateY(4px)',
    outline: {
      ':has(:focus-visible)': '2px solid var(--focus-color)',
    },
  },
  trackProgress: {
    display: 'block',
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--header-bg)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-color)',
  },
  trackRange: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'var(--main-color)',
    boxShadow: 'inset 0 0 0 1px rgba(0 0 0 / 0.2)',
  },
  progressTooltip: {
    position: 'absolute',
    backgroundColor: 'var(--background)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-color)',
    fontSize: '10px',
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingLeft: '5px',
    paddingRight: '5px',
    bottom: '10px',
    zIndex: 1,
    transform: 'translateX(-11px)',
    pointerEvents: 'none',
    '::before': {
      content: '""',
      position: 'absolute',
      width: 0,
      height: 0,
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderBottomWidth: 0,
      top: '16px',
      left: '5px',
      borderTopColor: 'var(--border-color)',
      borderWidth: '6px',
    },
    '::after': {
      content: '""',
      position: 'absolute',
      width: 0,
      height: 0,
      borderStyle: 'solid',
      borderColor: 'transparent',
      borderBottomWidth: 0,
      top: '15px',
      left: '6px',
      borderTopColor: 'var(--background)',
      borderWidth: '5px',
    },
  },
});
