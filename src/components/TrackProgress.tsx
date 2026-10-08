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
  // Hover/drag glow: the fill line and playhead pick up `--glow-accent`
  // while the pointer is over the track or scrubbing (the head itself is
  // `pointer-events: none`, so the parent tracks hover).
  const [hovering, setHovering] = useState(false);
  const glowing = hovering || seeking;
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

  // Keyboard seek: the same `player.setCurrentTime` path as pointer
  // scrubbing, so arrows/Home/End move the real engine position.
  const onTrackKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = 5;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(shownTime - step);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(shownTime + step);
      } else if (e.key === 'Home') {
        e.preventDefault();
        seekTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        seekTo(duration);
      }
    },
    [duration, seekTo, shownTime],
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
        role="slider"
        tabIndex={0}
        aria-label={t`Seek`}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shownTime)}
        aria-valuetext={`${formatClock(shownTime)} of ${formatClock(duration)}`}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => setHovering(false)}
        onKeyDown={onTrackKeyDown}
        {...stylex.props(styles.seekTrack)}
      >
        {peaks != null ? (
          <Waveform
            peaks={peaks}
            progress={Math.min(shownTime, denom) / denom}
          />
        ) : (
          <div {...stylex.props(styles.gutter)}>
            <div
              {...stylex.props(
                styles.seekElapsed,
                glowing && styles.seekElapsedGlow,
              )}
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
          {...stylex.props(styles.seekHead, glowing && styles.seekHeadGlow)}
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
 * Parse a CSS color string (`#rgb`, `#rrggbb`, `rgb()/rgba()`) into channels.
 * Returns `null` when the format is not recognized; callers fall back to the
 * raw token value so an unparsable theme never breaks the draw.
 */
function parseCssColor(raw: string): [number, number, number] | null {
  const value = raw.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex != null) {
    let digits = hex[1];
    if (digits.length === 3) {
      digits =
        digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
    }
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
    ];
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgb != null) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return null;
}

/** Scale a color toward black by `factor` (0-1); result stays fully opaque. */
function shadeColor(
  rgb: [number, number, number] | null,
  factor: number,
): string | null {
  if (rgb == null) return null;
  const [r, g, b] = rgb.map((c) =>
    Math.max(0, Math.min(255, Math.round(c * factor))),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The seek waveform: a canvas envelope mirrored around the centre line. It is
 * decorative (`aria-hidden`) and sits under the bar; all pointer interaction
 * stays on the parent `.seek-track`.
 *
 * Fully committed to the accent: played bars are the live `--accent` token
 * at full saturation with a clearly visible glow halo, unplayed bars a deep
 * shade derived from that same token (never a grey wash), so the contrast is
 * strong in every theme. Both colours come from the themed DOM at draw time
 * (canvas cannot resolve CSS vars itself), so no value is hardcoded. Each
 * bar's height is the true min/max sample envelope for its pixel column, so
 * the shape follows the actual audio like AIMP's waveform.
 */
function Waveform({ peaks, progress }: { peaks: Peaks; progress: number }) {
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
      const computed = getComputedStyle(canvas);
      const accent =
        computed.getPropertyValue('--accent').trim() || computed.color;
      // Deep-pink sibling of the live accent for the unplayed portion:
      // same hue family, roughly 40% brightness, fully opaque.
      const deep = shadeColor(parseCssColor(accent), 0.4) ?? accent;

      // 2px bars on a 3px pitch: saturated presence with separation, true
      // per-column min/max envelope, 2px minimum height so quiet passages
      // stay visible without flattening the shape.
      for (let x = 0; x < width; x += 3) {
        const barWidth = Math.min(2, width - x);
        const from = Math.floor((x * count) / width);
        const to = Math.max(from + 1, Math.floor(((x + 3) * count) / width));
        let lo = 0;
        let hi = 0;
        for (let b = from; b < to && b < count; b += 1) {
          if (peaks.min[b] < lo) lo = peaks.min[b];
          if (peaks.max[b] > hi) hi = peaks.max[b];
        }
        let top = mid - hi * amplitude;
        let bottom = mid - lo * amplitude;
        if (bottom - top < 2) {
          const center = (top + bottom) / 2;
          top = center - 1;
          bottom = center + 1;
        }
        const barHeight = bottom - top;
        if ((x + barWidth) / width <= progress) {
          // Played: halo pass first (wide soft glow), then a crisp
          // full-saturation core so the bar stays vivid inside its glow.
          ctx.fillStyle = accent;
          ctx.shadowColor = accent;
          ctx.shadowBlur = 10;
          ctx.fillRect(x, top, barWidth, barHeight);
          ctx.shadowBlur = 0;
          ctx.fillRect(x, top, barWidth, barHeight);
        } else {
          ctx.fillStyle = deep;
          ctx.shadowBlur = 0;
          ctx.fillRect(x, top, barWidth, barHeight);
        }
      }
      ctx.shadowBlur = 0;
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, progress]);

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
        <Slider.Thumb {...stylex.props(styles.thumb)} />
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
    fontSize: 'var(--text-xs)',
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
  abRegion: {
    position: 'absolute',
    top: 'calc(50% - 4px)',
    height: '8px',
    left: 0,
    width: 0,
    display: 'none',
    backgroundColor: 'var(--accent-soft)',
    backgroundImage:
      'repeating-linear-gradient(115deg, var(--accent-soft) 0 6px, transparent 6px 12px)',
    borderLeftWidth: '2px',
    borderRightWidth: '2px',
    borderTopWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftStyle: 'solid',
    borderRightStyle: 'solid',
    borderTopStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftColor: 'var(--accent)',
    borderRightColor: 'var(--accent)',
    borderTopColor: 'var(--accent)',
    borderBottomColor: 'var(--accent)',
    borderRadius: '3px',
  },
  abTag: {
    position: 'absolute',
    top: '-16px',
    // Docked to the region start instead of centred: centred collided with
    // the time labels above at narrow widths (the gutter is overflow:visible).
    // Hidden entirely once the viewport squeezes the column (~300px column).
    left: 0,
    display: {
      default: 'block',
      '@media (max-width: 560px)': 'none',
    },
    fontSize: '8.5px',
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '.09em',
    color: 'var(--on-accent-ink)',
    backgroundColor: 'var(--accent)',
    paddingBlock: '3px',
    paddingInline: '7px',
    borderRadius: '9999px',
    whiteSpace: 'nowrap',
    boxShadow: 'var(--shadow-elevated)',
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
    borderTopLeftRadius: 'var(--radius)',
    borderBottomLeftRadius: 'var(--radius)',
    pointerEvents: 'none',
  },
  seekElapsedGlow: {
    boxShadow: 'var(--glow-accent)',
  },
  seekHead: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '12px',
    height: '12px',
    marginLeft: '-6px',
    transform: 'translateY(-50%)',
    // Control-radius squircle, same family as the 6px transport buttons.
    borderRadius: 'var(--radius)',
    boxSizing: 'border-box',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--text-bright)',
    boxShadow: 'var(--shadow-elevated)',
    pointerEvents: 'none',
    transitionProperty: 'transform',
    transitionDuration: '.08s',
  },
  seekHeadGlow: {
    boxShadow: 'var(--shadow-elevated), var(--glow-accent)',
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
    borderRadius: 'var(--radius)',
    outline: {
      ':has(:focus-visible)': '2px solid var(--focus-color)',
    },
    boxShadow: {
      default: 'none',
      ':hover': 'var(--glow-hover)',
      ':has(:focus-visible)': 'var(--glow-focus)',
    },
  },
  trackProgress: {
    display: 'block',
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  trackRange: {
    position: 'absolute',
    height: '100%',
    backgroundImage:
      'linear-gradient(180deg, var(--accent) 0%, var(--accent-hover) 100%)',
    boxShadow: '0 0 8px var(--accent-soft)',
  },
  thumb: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    boxSizing: 'border-box',
    borderRadius: 'var(--radius)',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--text-bright)',
    boxShadow: {
      default: 'var(--shadow-elevated)',
      ':hover': 'var(--glow-accent)',
      ':focus-visible': 'var(--glow-focus)',
    },
    outline: {
      ':focus-visible': 'none',
    },
  },
  progressTooltip: {
    position: 'absolute',
    backgroundColor: 'var(--bg)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
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
      borderTopColor: 'var(--border)',
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
      borderTopColor: 'var(--bg)',
      borderWidth: '5px',
    },
  },
});
