import * as stylex from '@stylexjs/stylex';

type Props = {
  relevancy?: keyof typeof relevancyVariants;
  bSize?: keyof typeof sizeVariants;
  block?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export default function Button(props: Props) {
  const { relevancy = 'default', bSize = 'default', block, ...rest } = props;

  return (
    <button
      type="button"
      {...rest}
      {...stylex.props(
        styles.button,
        relevancyVariants[relevancy],
        sizeVariants[bSize],
        block && styles.block,
      )}
    >
      {props.children}
    </button>
  );
}

const styles = stylex.create({
  button: {
    borderRadius: 'var(--radius)',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: 'var(--control-border)',
    cursor: 'pointer',
    boxSizing: 'border-box',
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--weight-medium)',
    minHeight: 'var(--row-compact)',
    opacity: {
      ':active': 0.7,
      ':disabled': 0.5,
    },
    // Explicit local focus ring: the button stays correct even if the
    // global `:focus-visible` rule in global.css ever changes.
    outlineStyle: {
      ':focus-visible': 'solid',
    },
    outlineWidth: {
      ':focus-visible': '2px',
    },
    outlineColor: {
      ':focus-visible': 'var(--focus-color)',
    },
    outlineOffset: {
      ':focus-visible': '1px',
    },
    boxShadow: {
      ':focus-visible': 'var(--glow-focus)',
    },
  },
  block: {
    display: 'block',
    width: '100%',
  },
});

const relevancyVariants = stylex.create({
  default: {
    backgroundColor: {
      default: 'var(--button-bg)',
      ':hover': 'var(--surface-hover)',
    },
    color: 'var(--button-color)',
    boxShadow: {
      default: 'none',
      ':hover': 'var(--glow-hover)',
    },
  },
  primary: {
    backgroundColor: {
      default: 'var(--accent)',
      ':hover': 'var(--accent-hover)',
    },
    borderColor: {
      default: 'var(--accent)',
      ':hover': 'var(--accent-hover)',
    },
    color: 'var(--on-accent-ink)',
    boxShadow: {
      default: 'none',
      ':hover': 'var(--glow-accent)',
    },
  },
  danger: {
    color: 'white',
    backgroundColor: 'var(--danger)',
    borderColor: 'var(--danger)',
  },
});

const sizeVariants = stylex.create({
  default: {
    paddingBlock: 'var(--space-2)',
    paddingInline: 'var(--space-3)',
  },
  small: {
    paddingBlock: 'var(--space-1)',
    paddingInline: 'var(--space-2)',
    fontSize: 'var(--text-xs)',
    minHeight: 'auto',
  },
});
