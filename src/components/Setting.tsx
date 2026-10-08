import * as stylex from '@stylexjs/stylex';
import type React from 'react';
import { useId } from 'react';

type Props = {
  children: React.ReactNode;
};

export function Section(props: Props) {
  return (
    <section {...stylex.props(styles.settingSection)}>{props.children}</section>
  );
}

export function Description(props: Props) {
  return <p {...stylex.props(styles.settingDescription)}>{props.children}</p>;
}

export function Label(
  props: React.LabelHTMLAttributes<HTMLLabelElement> & {
    noMargin?: boolean;
    htmlFor: string;
  },
) {
  const { children, noMargin, htmlFor, ...restProps } = props;

  return (
    <label
      htmlFor={htmlFor}
      {...restProps}
      {...stylex.props(
        styles.settingLabel,
        noMargin && styles.settingLabelNoMargin,
      )}
    >
      {children}
    </label>
  );
}

export function Title(props: Props) {
  return <h3 {...stylex.props(styles.settingTitle)}>{props.children}</h3>;
}

type InputProps = {
  label: string;
  description?: string | React.ReactNode;
};

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & InputProps,
) {
  const { label, description, ...otherProps } = props;
  const id = useId();

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        autoComplete="off"
        {...otherProps}
        {...stylex.props(styles.settingInput)}
      />
      {description != null && <Description>{description}</Description>}
    </div>
  );
}

export function Select(
  props: Props & React.SelectHTMLAttributes<HTMLSelectElement> & InputProps,
) {
  const { label, description, ...otherProps } = props;
  const id = useId();

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div {...stylex.props(styles.selectWrapper)}>
        <select id={id} {...otherProps} {...stylex.props(styles.settingSelect)}>
          {props.children}
        </select>
        <span aria-hidden="true" {...stylex.props(styles.selectChevron)}>
          ▾
        </span>
      </div>
      {description != null && <Description>{description}</Description>}
    </div>
  );
}

export function ColorSelector(
  props: React.InputHTMLAttributes<HTMLInputElement> & InputProps,
) {
  const { label, description, value, ...otherProps } = props;
  const id = useId();

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div {...stylex.props(styles.colorRow)}>
        <input
          id={id}
          type="color"
          value={value}
          {...otherProps}
          {...stylex.props(styles.settingInput, styles.settingColorInput)}
        />
        <span {...stylex.props(styles.colorValue)}>
          {String(value ?? '').toUpperCase()}
        </span>
      </div>
      {description != null && <Description>{description}</Description>}
    </div>
  );
}

const styles = stylex.create({
  settingSection: {
    marginBottom: 'var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    rowGap: 'var(--space-2)',
    columnGap: 'var(--space-2)',
    minWidth: 0,
    maxWidth: '100%',
  },
  settingTitle: {
    display: 'block',
    margin: 0,
    fontSize: 'var(--text-md)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--text-bright)',
  },
  settingDescription: {
    fontWeight: 'var(--weight-normal)',
    fontSize: 'var(--text-sm)',
    marginTop: 'var(--space-1)',
    marginBottom: 'var(--space-1)',
    color: 'var(--text-dim)',
  },
  settingLabel: {
    display: 'inline-block',
    marginBottom: 'var(--space-2)',
    fontWeight: 'var(--weight-medium)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text)',
  },
  settingLabelNoMargin: {
    marginBottom: 0,
  },
  settingSelect: {
    appearance: 'none',
    display: 'block',
    backgroundColor: 'var(--surface-inset)',
    color: 'var(--text)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--control-border)',
      ':focus-visible': 'var(--accent)',
      ':focus': 'var(--accent)',
    },
    borderRadius: 'var(--radius)',
    padding: 'var(--space-2)',
    paddingRight: 'var(--space-5)',
    minHeight: 'var(--row)',
    width: '100%',
    fontSize: 'var(--text-md)',
    boxSizing: 'border-box',
    opacity: {
      ':disabled': 0.6,
    },
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed',
    },
  },
  selectWrapper: {
    position: 'relative',
    display: 'block',
    width: '100%',
  },
  selectChevron: {
    position: 'absolute',
    right: 'var(--space-3)',
    top: '50%',
    transform: 'translateY(-50%)',
    pointerEvents: 'none',
    color: 'var(--text-dim)',
    fontSize: 'var(--text-md)',
    lineHeight: 1,
  },
  settingInput: {
    appearance: 'none',
    display: 'block',
    backgroundColor: 'var(--surface-inset)',
    color: 'var(--text)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--control-border)',
      ':focus-visible': 'var(--accent)',
      ':focus': 'var(--accent)',
    },
    borderRadius: 'var(--radius)',
    padding: 'var(--space-2)',
    minHeight: 'var(--row)',
    width: '100%',
    fontSize: 'var(--text-md)',
    boxSizing: 'border-box',
    opacity: {
      ':disabled': 0.6,
    },
    cursor: {
      ':disabled': 'not-allowed',
    },
  },
  settingColorInput: {
    padding: 0,
    width: 'var(--space-6)',
    minHeight: 'var(--row)',
    flexShrink: 0,
    cursor: 'pointer',
  },
  colorRow: {
    display: 'flex',
    alignItems: 'center',
    columnGap: 'var(--space-2)',
  },
  colorValue: {
    fontFamily: 'var(--mono-font)',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-dim)',
  },
});
