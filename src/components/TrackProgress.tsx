import { Slider } from '@base-ui/react/slider';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useRef, useState } from 'react';

import type { Track } from '../generated/typings';
import useFormattedDuration from '../hooks/useFormattedDuration';
import usePlayingTrackCurrentTime from '../hooks/usePlayingTrackCurrentTime';
import { usePlayerState } from '../hooks/usePlayer';
import {
  clampSeconds,
  nudgeA,
  nudgeB,
  resolveDragA,
  resolveDragB,
} from '../lib/dense-ab';
import { formatClock } from '../lib/dense-format';
import player from '../lib/player';

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
  const { t } = useLingui();

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<null | 'seek' | 'A' | 'B'>(null);

  const duration = trackPlaying.duration;
  const denom = duration > 0 ? duration : 1;
  const a = abLoop.startSeconds;
  const b = abLoop.endSeconds;
  const hasRegion = a != null || b != null;

  const lo = a != null ? a : 0;
  const hi =
    b != null ? b : a != null ? Math.max(elapsed, a) : 0;
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
      if ((e.target as HTMLElement).dataset.abHandle !== undefined) return;
      e.preventDefault();
      trackRef.current?.setPointerCapture(e.pointerId);
      setDragging('seek');
      seekTo(posFromEvent(e.clientX) * duration);
    },
    [duration, posFromEvent, seekTo],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragging === null) return;
      const ratio = posFromEvent(e.clientX);
      if (dragging === 'seek') {
        seekTo(ratio * duration);
        return;
      }
      if (dragging === 'A') {
        void player.setAbPoint('A', resolveDragA(ratio * duration, b, duration));
      } else {
        void player.setAbPoint('B', resolveDragB(ratio * duration, a, duration));
      }
    },
    [a, b, dragging, duration, posFromEvent, seekTo],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return;
    try {
      trackRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // capture already gone
    }
    setDragging(null);
  }, [dragging]);

  const onHandlePointerDown = useCallback(
    (which: 'A' | 'B') => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      trackRef.current?.setPointerCapture(e.pointerId);
      setDragging(which);
    },
    [],
  );

  const onHandleKeyDown = useCallback(
    (which: 'A' | 'B') => (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      const step = e.shiftKey ? 0.002 : 0.01;
      let delta: number | null = null;
      let jump: number | null = null;
      if (e.key === 'ArrowLeft') delta = -step * duration;
      else if (e.key === 'ArrowRight') delta = step * duration;
      else if (e.key === 'Home') jump = 0;
      else if (e.key === 'End') jump = duration;
      if (delta === null && jump === null) return;
      e.preventDefault();
      e.stopPropagation();
      if (which === 'A') {
        const next = jump ?? nudgeA(delta ?? 0, a, b, duration);
        void player.setAbPoint('A', next);
      } else {
        const next = jump ?? nudgeB(delta ?? 0, a, b, duration);
        void player.setAbPoint('B', next);
      }
    },
    [a, b, duration],
  );

  const handleA = a != null;
  const handleB = b != null;
  const editing = dragging === 'A' || dragging === 'B';

  return (
    <div {...stylex.props(styles.seek)}>
      <div {...stylex.props(styles.seekTimes)}>
        <span {...stylex.props(styles.elapsedText)}>
          {formatClock(Math.min(elapsed, duration))}
        </span>
        <span {...stylex.props(styles.totalText)}>{formatClock(duration)}</span>
      </div>

      <div
        ref={trackRef}
        role="group"
        aria-label={t`Seek bar with A-B loop region`}
        data-ab-editing={editing ? 'true' : undefined}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        {...stylex.props(styles.seekTrack)}
      >
        <div {...stylex.props(styles.gutter)}>
          <div
            {...stylex.props(styles.seekElapsed)}
            style={{ width: `${(Math.min(elapsed, denom) / denom) * 100}%` }}
          />
          {hasRegion && (
            <div
              {...stylex.props(styles.abRegion, editing && styles.abRegionEditing)}
              style={{
                left: `${(lo / denom) * 100}%`,
                width: `${(regionWidth / denom) * 100}%`,
                display: 'block',
              }}
            >
              <span {...stylex.props(styles.abTag)}>A–B LOOP</span>
            </div>
          )}
        </div>

        {handleA && (
          <div
            role="slider"
            tabIndex={0}
            data-ab-handle="A"
            aria-label={t`Loop point A`}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(a)}
            aria-valuetext={formatClock(a)}
            onPointerDown={onHandlePointerDown('A')}
            onKeyDown={onHandleKeyDown('A')}
            {...stylex.props(
              styles.abHandle,
              dragging === 'A' && styles.abHandleActive,
            )}
            style={{ left: `${(a / denom) * 100}%` }}
          />
        )}

        {handleB && (
          <div
            role="slider"
            tabIndex={0}
            data-ab-handle="B"
            aria-label={t`Loop point B`}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(b)}
            aria-valuetext={formatClock(b)}
            onPointerDown={onHandlePointerDown('B')}
            onKeyDown={onHandleKeyDown('B')}
            {...stylex.props(
              styles.abHandle,
              dragging === 'B' && styles.abHandleActive,
            )}
            style={{ left: `${(b / denom) * 100}%` }}
          />
        )}

        <div
          {...stylex.props(styles.seekHead)}
          style={{ left: `${(Math.min(elapsed, denom) / denom) * 100}%` }}
        />
      </div>
    </div>
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
    height: '6px',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#262626',
    borderRadius: '9999px',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,.03)',
    overflow: 'visible',
  },
  abRegion: {
    position: 'absolute',
    top: '-1px',
    bottom: '-1px',
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
  abRegionEditing: {
    borderTopStyle: 'dashed',
    borderBottomStyle: 'dashed',
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
    color: '#12030b',
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
  abHandle: {
    position: 'absolute',
    top: '50%',
    left: 0,
    width: '11px',
    height: '20px',
    marginLeft: '-5.5px',
    transform: 'translateY(-50%)',
    borderRadius: '3px',
    backgroundColor: 'var(--deep-pink)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ff7cc4',
    boxShadow: '0 2px 6px rgba(0,0,0,.5)',
    cursor: 'ew-resize',
    zIndex: 3,
    touchAction: 'none',
    '::after': {
      content: '""',
      position: 'absolute',
      top: '6px',
      bottom: '6px',
      left: '3.5px',
      right: '3.5px',
      borderLeftWidth: '1px',
      borderRightWidth: '1px',
      borderLeftStyle: 'solid',
      borderRightStyle: 'solid',
      borderLeftColor: 'rgba(255,255,255,.75)',
      borderRightColor: 'rgba(255,255,255,.75)',
    },
  },
  abHandleActive: {
    backgroundColor: '#ff4fb0',
    cursor: 'grabbing',
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
