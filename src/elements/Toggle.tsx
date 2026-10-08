import * as stylex from '@stylexjs/stylex';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name for the switch */
  label: string;
  disabled?: boolean;
  xstyle?: stylex.CompiledStyles;
};

/**
 * On/off switch. A native `button` with `role="switch"` so it works
 * without extra dependencies; visuals come only from design tokens.
 */
export default function Toggle(props: Props) {
  const { checked, onChange, label, disabled, xstyle } = props;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...stylex.props(styles.track, checked && styles.on, xstyle)}
    >
      <span {...stylex.props(styles.knob, checked && styles.knobOn)} />
    </button>
  );
}

const styles = stylex.create({
  track: {
    width: 'var(--space-6)',
    // 22px track with a 14px knob: the knob throw below is derived, not
    // magic - track width (32) minus knob (14) minus padding (2*2) minus
    // border (2*1) = 12px.
    height: '22px',
    borderRadius: 'var(--radius-lg)',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: 'var(--control-border)',
    backgroundColor: 'var(--surface-inset)',
    padding: '2px',
    margin: 0,
    cursor: 'pointer',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    opacity: {
      ':disabled': 0.5,
    },
  },
  on: {
    backgroundColor: 'var(--accent)',
    borderColor: 'var(--accent)',
    boxShadow: 'var(--glow-hover)',
  },
  knob: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    backgroundColor: 'var(--text-dim)',
    transition:
      'transform 0.12s ease-in-out, background-color 0.12s ease-in-out',
  },
  knobOn: {
    backgroundColor: 'var(--on-accent-ink)',
    transform: 'translateX(12px)',
  },
});
