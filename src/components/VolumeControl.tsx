import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useCallback, type KeyboardEvent } from 'react';

import Icon, { type IconName } from './Icon';
import { usePlayerState } from '../hooks/usePlayer';
import player from '../lib/player';
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

export default function VolumeControl() {
  const volume = usePlayerState((state) => state.volume);
  const muted = usePlayerState((state) => state.muted);
  const { t } = useLingui();

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

  const wheelRef = useWheelStep((steps) => {
    setPlayerVolume(Math.min(1, Math.max(0, sliderValue + steps * STEP)));
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
    <div {...stylex.props(styles.volumeRow)}>
      <span {...stylex.props(styles.muteButton)} aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <div
        ref={wheelRef}
        role="button"
        tabIndex={0}
        aria-label={label}
        title={label}
        data-muted={muted ? 'true' : 'false'}
        data-icon={icon}
        onClick={() => player.toggleMute()}
        onKeyDown={onKeyDown}
        {...stylex.props(styles.denseTrack, muted && styles.faded)}
      >
        <div
          {...stylex.props(styles.denseRange)}
          // A runtime percentage cannot be a static StyleX rule; this matches
          // the existing dynamic-width pattern in TrackProgress.tsx.
          style={{ width: `${sliderValue * 100}%` }}
        />
      </div>
      <span {...stylex.props(styles.readout)} aria-hidden="true">
        {readout}
      </span>
    </div>
  );
}

const styles = stylex.create({
  // --- Volume strip -------------------------------------------------------
  volumeRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '7px',
    marginLeft: 'auto',
    minWidth: 0,
  },
  muteButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-dim)',
  },
  denseTrack: {
    backgroundColor: 'var(--track)',
    position: 'relative',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '56px',
    minWidth: 0,
    maxWidth: '110px',
    borderRadius: '9999px',
    height: '4px',
    cursor: 'pointer',
  },
  denseRange: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'var(--accent)',
    borderRadius: '9999px',
  },
  readout: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    color: 'var(--text-dim)',
    width: '30px',
    textAlign: 'right',
  },
  faded: {
    opacity: 0.6,
  },
});
