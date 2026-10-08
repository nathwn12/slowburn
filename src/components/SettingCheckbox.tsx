import * as stylex from '@stylexjs/stylex';
import { useId } from 'react';

import Flexbox from '../elements/Flexbox';
import * as Setting from './Setting';

type Props = {
  title: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
};

export default function CheckboxSetting(props: Props) {
  const { title, description } = props;
  const id = useId();

  return (
    <Flexbox direction="vertical" gap={0}>
      <Flexbox gap={8} align="center">
        <input
          id={id}
          type="checkbox"
          {...stylex.props(
            styles.checkboxInput,
            props.value && styles.checkboxChecked,
          )}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
          checked={props.value}
        />
        <Setting.Label htmlFor={id} noMargin>
          {title}
        </Setting.Label>
      </Flexbox>
      {description != null && description !== '' && (
        <Setting.Description>{description}</Setting.Description>
      )}
    </Flexbox>
  );
}

const styles = stylex.create({
  checkboxInput: {
    display: 'grid',
    placeContent: 'center',
    appearance: 'none',
    width: 'var(--space-4)',
    height: 'var(--space-4)',
    flexShrink: 0,
    margin: 0,
    cursor: 'pointer',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--control-border)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-inset)',
    '::after': {
      content: '""',
      visibility: 'hidden',
      width: 'var(--space-3)',
      height: 'var(--space-3)',
      boxShadow: 'inset 1em 1em var(--on-accent-ink)',
      backgroundColor: 'var(--on-accent-ink)',
    },
  },
  checkboxChecked: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--accent)',
    '::after': {
      visibility: 'visible',
      clipPath: 'polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 79% 0%, 43% 62%)',
      transform: 'scale(0.7) rotate(10deg)',
    },
  },
});
