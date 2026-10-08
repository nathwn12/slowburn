import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

import { usePlayerState } from '../hooks/usePlayer';
import player from '../lib/player';
import Icon, { type IconName } from './Icon';
import { STEP, useWheelStep } from './wheel-step';

// Volume easing - http://www.dr-lex.be/info-stuff/volumecontrols.html#about
const SMOOTHING_FACTOR = 2.5;

const smoothifyVolume = (value: number): number => value ** SMOOTHING_FACTOR;
const unsmoothifyVolume = (value: number): number =>
  value ** (1.0 / SMOOTHING_FACTOR);

const getVolumeIcon = (volume: number, muted: boolean): IconName => {
  if (muted) return 'volumeMute';
  if (volume === 0) return 'volumeOff';
  if (volume < 0.33) return 'volumeLow';
  if (volume < 0.67) return 'volumeMedium';
  return 'volumeHigh';
};

/**
 * Minimal volume (owner ruling 2026-10-09): the transport row always shows a
 * hair-thin fill bar beside the mute icon button - no popover, no
 * hover-to-reveal, no thumb, no accent ring. The wheel adjusts, a click mutes,
 * and the numeric readout is transient: it appears only while the value
 * changes and clears ~1.4 s later, never pinned.
 */
export default function VolumeControl() {
  const volume = usePlayerState((state) => state.volume);
  const muted = usePlayerState((state) => state.muted);
  const { t } = useLingui();
  const [flash, setFlash] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  const setPlayerVolume = useCallback(
    (value: number) => {
      const smoothVolume = smoothifyVolume(value);
      // Only unmute when actually muted: an unconditional `unmute()` persisted
      // `audio_muted` on every drag frame (a config write storm).
      if (muted) void player.unmute();
      player.setVolume(smoothVolume); // Debounced save happens in player
    },
    [muted],
  );

  const sliderValue = unsmoothifyVolume(volume);
  const readout = `${Math.round(sliderValue * 100)}%`;
  const icon = getVolumeIcon(sliderValue, muted);
  const label = muted ? t`Unmute` : t`Mute`;

  // Transient percentage: visible only while the value changes, never pinned.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setFlash(true);
    if (flashTimer.current != null) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1400);
    return () => {
      if (flashTimer.current != null) clearTimeout(flashTimer.current);
    };
  }, [sliderValue, muted]);

  const wheelRef = useWheelStep((steps) => {
    setPlayerVolume(Math.min(1, Math.max(0, sliderValue + steps * STEP)));
  });

  const setFromPointer = useCallback(
    (clientX: number) => {
      const rect = sliderRef.current?.getBoundingClientRect();
      if (rect == null || rect.width === 0) return;
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      setPlayerVolume(ratio);
    },
    [setPlayerVolume],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setFromPointer(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setFromPointer(event.clientX);
  };

  const endDrag = () => setDragging(false);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    let delta = 0;
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') delta = STEP;
    else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft')
      delta = -STEP;
    else return;

    // Keep arrow keys from reaching the document keybindings (the seekbar).
    event.preventDefault();
    event.stopPropagation();
    setPlayerVolume(Math.min(1, Math.max(0, sliderValue + delta)));
  };

  return (
    <div ref={wheelRef} {...stylex.props(styles.volumeMini)}>
      <button
        type="button"
        onClick={() => {
          void player.toggleMute();
        }}
        onKeyDown={onKeyDown}
        aria-label={label}
        title={label}
        data-muted={muted ? 'true' : 'false'}
        data-icon={icon}
        {...stylex.props(styles.muteButton, muted && styles.faded)}
      >
        <Icon name={icon} size={16} />
      </button>

      {flash && (
        <span role="status" {...stylex.props(styles.flash)}>
          {muted ? t`Muted` : readout}
        </span>
      )}

      <div
        ref={sliderRef}
        role="slider"
        tabIndex={0}
        aria-label={t`Volume`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(sliderValue * 100)}
        aria-valuetext={readout}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        {...stylex.props(styles.sliderHit)}
      >
        <div {...stylex.props(styles.sliderTrack)}>
          <div
            {...stylex.props(styles.sliderRange)}
            // A runtime percentage cannot be a static StyleX rule; this
            // matches the existing dynamic-width pattern in
            // TrackProgress.tsx.
            style={{ width: `${sliderValue * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  // --- Minimal volume: icon + constantly visible hair-thin fill bar ---------
  volumeMini: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  muteButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: 'var(--radius)',
    color: 'var(--text-dim)',
    borderStyle: 'none',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    cursor: 'pointer',
    padding: 0,
  },
  // Transient on-screen percentage: mounted only while the value changes.
  flash: {
    position: 'absolute',
    bottom: 'calc(100% + 6px)',
    right: 0,
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--text-bright)',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius)',
    paddingBlock: '3px',
    paddingInline: '7px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: 3,
  },
  sliderHit: {
    display: 'flex',
    alignItems: 'center',
    width: '120px',
    height: '18px',
    cursor: 'pointer',
  },
  sliderTrack: {
    backgroundColor: 'var(--track)',
    position: 'relative',
    width: '100%',
    height: 'var(--space-1)',
    borderRadius: '9999px',
  },
  sliderRange: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'var(--accent)',
    borderRadius: '9999px',
  },
  faded: {
    opacity: 0.6,
  },
});
