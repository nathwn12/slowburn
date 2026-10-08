import { Slider } from '@base-ui/react/slider';
import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import useEffectsConfig from '../hooks/useEffectsConfig';
import player from '../lib/player';
import Icon from './Icon';
import { REVERB_STEP, STEP, useWheelStep } from './wheel-step';

const SLOW_MIN = 0.7;
const SLOW_MAX = 1.3;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * The always-visible Burn strip (design §3): Slow + Reverb as one row of two
 * controls, directly under the transport. The mono readout is the truth; the
 * sliders are a coarse sweep. Neutral means exactly 1.00× / 0%.
 */
export default function EffectControls() {
  const { t } = useLingui();
  const effects = useEffectsConfig();

  const slow = clamp(effects.slow, SLOW_MIN, SLOW_MAX);
  const reverbPct = Math.round(clamp(effects.reverbIntensity, 0, 1) * 100);
  const slowEngaged = Math.abs(slow - 1) > 0.0001;
  const reverbEngaged = reverbPct > 0;

  const setSlow = (value: number) => {
    player.setEffectsConfig({
      enabled: true,
      slowEnabled: true,
      slow: clamp(round2(value), SLOW_MIN, SLOW_MAX),
    });
  };
  const setReverb = (pct: number) => {
    player.setEffectsConfig({
      enabled: true,
      reverbEnabled: true,
      reverbIntensity: clamp(Math.round(pct), 0, 100) / 100,
    });
  };

  return (
    <div
      {...stylex.props(styles.burn)}
      aria-label={t`Effects: slow and reverb`}
    >
      <BurnControl
        label={t`SLOW`}
        engaged={slowEngaged}
        readout={`${slow.toFixed(2)}×`}
        sliderValue={slow}
        sliderMin={SLOW_MIN}
        sliderMax={SLOW_MAX}
        sliderStep={STEP}
        onChange={setSlow}
        onStepDown={() => setSlow(slow - STEP)}
        onStepUp={() => setSlow(slow + STEP)}
        onReset={() => setSlow(1)}
        canDown={slow > SLOW_MIN + 0.0001}
        canUp={slow < SLOW_MAX - 0.0001}
        decreaseLabel={t`Decrease speed`}
        decreaseTitle={t`Slower (−0.01×)`}
        increaseLabel={t`Increase speed`}
        increaseTitle={t`Faster (+0.01×)`}
        sliderLabel={t`Playback speed, pitch follows`}
        resetLabel={t`Reset speed to normal`}
        resetTitle={t`Reset to 1.00×`}
      />

      <div {...stylex.props(styles.burnSep)} aria-hidden="true" />

      <BurnControl
        label={t`REVERB`}
        engaged={reverbEngaged}
        readout={`${reverbPct}%`}
        sliderValue={reverbPct}
        sliderMin={0}
        sliderMax={100}
        sliderStep={REVERB_STEP}
        onChange={setReverb}
        onStepDown={() => setReverb(reverbPct - REVERB_STEP)}
        onStepUp={() => setReverb(reverbPct + REVERB_STEP)}
        onReset={() => setReverb(0)}
        canDown={reverbPct > 0}
        canUp={reverbPct < 100}
        decreaseLabel={t`Decrease reverb`}
        decreaseTitle={t`Less reverb (−1%)`}
        increaseLabel={t`Increase reverb`}
        increaseTitle={t`More reverb (+1%)`}
        sliderLabel={t`Reverb intensity`}
        resetLabel={t`Reset reverb to dry`}
        resetTitle={t`Reset to dry (0%)`}
      />
    </div>
  );
}

type BurnControlProps = {
  label: string;
  engaged: boolean;
  readout: string;
  sliderValue: number;
  sliderMin: number;
  sliderMax: number;
  sliderStep: number;
  onChange: (value: number) => void;
  onStepDown: () => void;
  onStepUp: () => void;
  onReset: () => void;
  canDown: boolean;
  canUp: boolean;
  decreaseLabel: string;
  decreaseTitle: string;
  increaseLabel: string;
  increaseTitle: string;
  sliderLabel: string;
  resetLabel: string;
  resetTitle: string;
};

function BurnControl(props: BurnControlProps) {
  const wheelRef = useWheelStep((steps) => {
    props.onChange(props.sliderValue + steps * props.sliderStep);
  });

  return (
    <div {...stylex.props(styles.burnCtl)}>
      <div {...stylex.props(styles.burnId)}>
        <span
          {...stylex.props(styles.burnDot, props.engaged && styles.burnDotOn)}
          aria-hidden="true"
        />
        <span
          {...stylex.props(styles.burnName, props.engaged && styles.burnNameOn)}
        >
          {props.label}
        </span>
      </div>

      <button
        type="button"
        onClick={props.onStepDown}
        disabled={!props.canDown}
        aria-label={props.decreaseLabel}
        title={props.decreaseTitle}
        {...stylex.props(styles.step)}
      >
        <Icon name="minus" size={12} />
      </button>

      <span
        {...stylex.props(styles.readout, props.engaged && styles.readoutOn)}
        aria-hidden="true"
      >
        {props.readout}
      </span>

      <button
        type="button"
        onClick={props.onStepUp}
        disabled={!props.canUp}
        aria-label={props.increaseLabel}
        title={props.increaseTitle}
        {...stylex.props(styles.step)}
      >
        <Icon name="plus" size={12} />
      </button>

      <Slider.Root
        value={props.sliderValue}
        min={props.sliderMin}
        max={props.sliderMax}
        step={props.sliderStep}
        onValueChange={props.onChange}
        {...stylex.props(styles.sliderWrap)}
      >
        <Slider.Control ref={wheelRef} {...stylex.props(styles.sliderRoot)}>
          <Slider.Track {...stylex.props(styles.sliderTrack)}>
            <Slider.Indicator
              {...stylex.props(
                styles.sliderFill,
                props.engaged ? styles.sliderFillOn : styles.sliderFillOff,
              )}
            />
          </Slider.Track>
          <Slider.Thumb
            aria-label={props.sliderLabel}
            getAriaValueText={() => props.readout}
            data-museeks-action
            {...stylex.props(
              styles.sliderThumb,
              props.engaged ? styles.sliderThumbOn : styles.sliderThumbOff,
            )}
          />
        </Slider.Control>
      </Slider.Root>

      {/* Screen-reader mirror of the visual readout (which stays aria-hidden):
          a visually-hidden live text so assistive tech gets the value. */}
      <span role="status" {...stylex.props(styles.srValue)}>
        {props.readout}
      </span>

      <button
        type="button"
        onClick={props.onReset}
        disabled={!props.engaged}
        aria-label={props.resetLabel}
        title={props.resetTitle}
        {...stylex.props(styles.burnReset)}
      >
        <Icon name="reset" size={12} />
      </button>
    </div>
  );
}

const styles = stylex.create({
  burn: {
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius-lg)',
    paddingTop: 'var(--space-2)',
    paddingBottom: '9px',
    paddingInline: '11px',
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1px 1fr',
      '@media (max-width: 900px)': '1fr',
    },
    columnGap: 'var(--space-3)',
    rowGap: 'var(--space-3)',
    alignItems: 'center',
    boxShadow: 'var(--shadow-elevated)',
  },
  burnSep: {
    backgroundColor: 'var(--border-soft)',
    alignSelf: 'stretch',
    display: {
      default: 'block',
      '@media (max-width: 900px)': 'none',
    },
  },
  burnCtl: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: '7px',
    rowGap: '6px',
    minWidth: 0,
  },
  // Shared label column: a floor both rows hit, so the −/readout/+ group starts
  // at the same x. Both labels ("SLOW" 32.7px, "REVERB" 57.9px incl. dot+gap)
  // fit under 58px, hence both columns measure exactly 58px. A minWidth (not a
  // fixed width) keeps longer future labels from clipping.
  burnId: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    flexShrink: 0,
    minWidth: '58px',
  },
  burnDot: {
    width: '6px',
    height: '6px',
    flexShrink: 0,
    borderRadius: '50%',
    backgroundColor: 'var(--text-faint)',
    transition: 'background-color .15s ease, box-shadow .15s ease',
  },
  burnDotOn: {
    backgroundColor: 'var(--accent)',
    boxShadow: '0 0 7px var(--accent)',
  },
  burnName: {
    fontSize: '9.5px',
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '.11em',
    color: 'var(--text-faint)',
    transition: 'color .15s ease',
  },
  burnNameOn: {
    color: 'var(--text-dim)',
  },
  // Flat, like `burnReset` below: no border, transparent until hover. The UA
  // `padding: 1px 6px` must be reset explicitly — StyleX doesn't, and with
  // `box-sizing: border-box` it collapsed the 18px content box to 4px, so the
  // 12px glyph was laid out at the content start instead of centred (measured
  // 4px right of the button centre) while the reset glyph centred exactly.
  step: {
    width: '18px',
    height: '18px',
    flexShrink: 0,
    borderRadius: '3px',
    display: 'grid',
    placeItems: 'center',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    borderStyle: 'none',
    padding: 0,
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    opacity: {
      ':disabled': 0.35,
    },
    cursor: {
      default: 'pointer',
      ':disabled': 'default',
    },
  },
  readout: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-sm)',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-.02em',
    width: '46px',
    textAlign: 'center',
    color: 'var(--text-faint)',
    transition: 'color .15s ease',
    fontVariantNumeric: 'tabular-nums',
  },
  readoutOn: {
    color: 'var(--accent-text)',
  },
  // Visually-hidden mirror of the readout for assistive tech: stays in the
  // accessibility tree while painting nothing (same technique as the
  // narrow-layout crumb words in Navigation.tsx).
  srValue: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  burnReset: {
    width: '18px',
    height: '18px',
    flexShrink: 0,
    borderRadius: '3px',
    display: 'grid',
    placeItems: 'center',
    position: 'relative',
    zIndex: 2,
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    borderStyle: 'none',
    padding: 0,
    opacity: {
      ':disabled': 0.45,
    },
    cursor: {
      default: 'pointer',
      ':disabled': 'default',
    },
  },

  sliderRoot: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    userSelect: 'none',
    touchAction: 'none',
    height: 'var(--space-4)',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: '56px',
  },
  // The Root owns the flex growth; without this the Control collapsed to its
  // 56px minWidth and left dead space in each Burn column.
  sliderWrap: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
  },
  sliderTrack: {
    position: 'relative',
    flexGrow: 1,
    height: 'var(--space-1)',
    borderRadius: '9999px',
    backgroundColor: 'var(--track)',
  },
  sliderFill: {
    position: 'absolute',
    height: '100%',
    borderRadius: '9999px',
  },
  sliderFillOn: {
    backgroundColor: 'var(--accent)',
    boxShadow: 'var(--glow-hover)',
  },
  sliderFillOff: {
    backgroundColor: 'var(--text-faint)',
  },
  sliderThumb: {
    display: 'block',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: 'var(--text-bright)',
    borderWidth: '2px',
    borderStyle: 'solid',
    boxShadow: '0 1px 3px rgba(0,0,0,.6)',
    outline: {
      ':focus-visible': '2px solid var(--focus)',
      ':active': '2px solid var(--focus)',
    },
  },
  sliderThumbOn: {
    borderColor: 'var(--accent)',
    boxShadow: 'var(--glow-accent), 0 1px 3px rgba(0,0,0,.6)',
  },
  sliderThumbOff: {
    borderColor: 'var(--text-dim)',
  },
});
