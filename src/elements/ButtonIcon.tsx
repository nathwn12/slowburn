import * as stylex from '@stylexjs/stylex';
import type React from 'react';

import Icon, { type IconName, type IconSize } from '../components/Icon';

type Props = React.ComponentPropsWithRef<'button'> & {
  label: string;
  icon: IconName;
  iconSize?: IconSize;
  isActive?: boolean;
  xstyle?: stylex.CompiledStyles;
};

export default function ButtonIcon(props: Props) {
  const { label, onClick, icon, iconSize, isActive, ref, xstyle, ...rest } =
    props;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-museeks-action
      {...rest}
      {...stylex.props(styles.button, xstyle)}
    >
      <Icon
        name={icon}
        size={iconSize}
        // Deliberate exception: --main-color is the RUNTIME user-picked /
        // art-tint accent written by SettingsAPI, not the static brand
        // token, so it must keep tracking the live accent here.
        color={isActive ? 'var(--main-color)' : undefined}
        {...stylex.props(styles.icon)}
      />
    </button>
  );
}

const styles = stylex.create({
  button: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: '0',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-dim)',
    textAlign: 'center',
    padding: 'var(--space-1)',
    // Icon-only buttons must keep a real hit target even for the smallest
    // glyph: 28px floor (32px `--row-compact` where callers add padding).
    minWidth: '28px',
    minHeight: '28px',
    display: 'inline-grid',
    placeItems: 'center',
    lineHeight: 1,
    cursor: 'pointer',
    opacity: {
      ':disabled': 0.5,
    },
  },
  icon: {
    verticalAlign: 'middle',
  },
});
