import { Popover } from '@base-ui/react/popover';
import { Slider } from '@base-ui/react/slider';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useCallback } from 'react';

import ButtonIcon from '../elements/ButtonIcon';
import { usePlayerState } from '../hooks/usePlayer';
import player from '../lib/player';
import { stopPropagation } from '../lib/utils-events';
import type { IconName } from './Icon';

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

type Props = {
  /** Dense transport row: mute + slider + mono readout, right-aligned. */
  dense?: boolean;
};

export default function VolumeControl({ dense = false }: Props) {
  const volume = usePlayerState((state) => state.volume);
  const muted = usePlayerState((state) => state.muted);
  const { t } = useLingui();

  const setPlayerVolume = useCallback((value: number) => {
    const smoothVolume = smoothifyVolume(value);
    void player.unmute();
    player.setVolume(smoothVolume); // Debounced save happens in player
  }, []);

  const sliderValue = unsmoothifyVolume(volume);
  const readout = `${Math.round(sliderValue * 100)}%`;

  if (dense) {
    return (
      <div {...stylex.props(styles.volumeRow)}>
        <ButtonIcon
          label={muted ? t`Unmute` : t`Mute`}
          icon={getVolumeIcon(sliderValue, muted)}
          iconSize={16}
          onClick={() => player.toggleMute()}
          xstyle={styles.muteButton}
        />
        <Slider.Root
          value={sliderValue}
          // prevent <- / -> keybinding conflicts with the seekbar when focused
          onKeyDown={stopPropagation}
          onValueChange={setPlayerVolume}
          min={0}
          max={1}
          step={0.01}
        >
          <Slider.Control
            {...stylex.props(styles.denseSlider, muted && styles.faded)}
          >
            <Slider.Track {...stylex.props(styles.denseTrack)}>
              <Slider.Indicator {...stylex.props(styles.denseRange)} />
            </Slider.Track>
            <Slider.Thumb
              aria-label={t`Volume`}
              data-museeks-action
              {...stylex.props(styles.denseThumb)}
            />
          </Slider.Control>
        </Slider.Root>
        <span {...stylex.props(styles.readout)} aria-hidden="true">
          {readout}
        </span>
      </div>
    );
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={0}
        closeDelay={150}
        render={(triggerProps) => (
          <ButtonIcon
            label={t`Volume`}
            icon={getVolumeIcon(unsmoothifyVolume(volume), muted)}
            iconSize={16}
            xstyle={styles.volumeControlContainer}
            {...triggerProps}
          />
        )}
      />
      <Popover.Portal>
        <Popover.Positioner side="right" sideOffset={8}>
          <Popover.Popup {...stylex.props(styles.volumeHoverCard)}>
            <Slider.Root
              value={unsmoothifyVolume(volume)}
              // prevent <- / -> keybinding conflicts with player seekbar when volume slider is focused
              onKeyDown={stopPropagation}
              onValueChange={setPlayerVolume}
              min={0}
              max={1}
              step={0.01}
            >
              <Slider.Control
                {...stylex.props(styles.sliderRoot, muted && styles.faded)}
              >
                <Slider.Track {...stylex.props(styles.sliderTrack)}>
                  <Slider.Indicator {...stylex.props(styles.sliderRange)} />
                </Slider.Track>
                <Slider.Thumb
                  aria-label={t`Volume`}
                  data-museeks-action
                  {...stylex.props(styles.sliderThumb)}
                />
              </Slider.Control>
            </Slider.Root>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const fadeOut = stylex.keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const styles = stylex.create({
  volumeControlContainer: {
    position: 'relative',
    marginLeft: '4px',
    paddingBlock: '0',
    paddingInline: '4px',
    lineHeight: 1,
  },

  // --- Dense transport volume --------------------------------------------
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
  denseSlider: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
    touchAction: 'none',
    width: '96px',
    maxWidth: '110px',
    height: '14px',
  },
  denseTrack: {
    backgroundColor: 'var(--track)',
    position: 'relative',
    flexGrow: 1,
    borderRadius: '9999px',
    height: '4px',
  },
  denseRange: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'var(--accent)',
    borderRadius: '9999px',
  },
  denseThumb: {
    display: 'block',
    width: '10px',
    height: '10px',
    backgroundColor: 'white',
    borderRadius: '50%',
    outline: {
      default: '2px solid var(--accent)',
      ':has(:focus-visible)': '2px solid var(--focus)',
      ':active': '2px solid var(--focus)',
    },
  },
  readout: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10.5px',
    fontWeight: 600,
    color: 'var(--text-dim)',
    width: '30px',
    textAlign: 'right',
  },

  // --- Legacy popover form (kept for non-dense callers) -------------------
  volumeHoverCard: {
    backgroundColor: 'var(--header-bg)',
    paddingBlock: '10px',
    paddingInline: '12px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-color)',
    zIndex: 1,
    animationDuration: '150ms',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'forwards',
    animationName: {
      ':is([data-open])': fadeIn,
      ':is([data-ending-style])': fadeOut,
    },
  },
  sliderRoot: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
    touchAction: 'none',
    width: '90px',
    height: '10px',
    borderRadius: 'var(--border-radius)',
  },
  sliderTrack: {
    backgroundColor: 'var(--slider-bg)',
    position: 'relative',
    flexGrow: 1,
    borderRadius: '9999px',
    height: '4px',
  },
  sliderRange: {
    position: 'absolute',
    height: '100%',
    backgroundColor: 'var(--main-color)',
    borderRadius: 'var(--border-radius)',
  },
  sliderThumb: {
    display: 'block',
    width: '10px',
    height: '10px',
    backgroundColor: 'white',
    borderRadius: '50%',
    outline: {
      default: '1px var(--border-color)',
      ':has(:focus-visible)': '2px solid var(--focus-color)',
      ':active': '2px solid var(--focus-color)',
    },
  },
  faded: {
    opacity: 0.6,
  },
});
