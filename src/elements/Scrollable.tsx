import * as stylex from '@stylexjs/stylex';
import type React from 'react';

type Props = {
  children: React.ReactNode;
  ref: React.Ref<HTMLDivElement>;
} & React.HTMLAttributes<HTMLDivElement>;

export default function Scrollable(props: Props) {
  const { children, ref, ...rest } = props;

  return (
    <div {...stylex.props(styles.scrollable)} ref={ref} {...rest}>
      {children}
    </div>
  );
}

const styles = stylex.create({
  scrollable: {
    overflowY: 'auto',
    // Thin themed scrollbars, and a stable gutter on list scrollers so
    // content never shifts when the scrollbar appears.
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--text-faint) transparent',
    scrollbarGutter: 'stable',
    '::-webkit-scrollbar': {
      width: '8px',
      height: '8px',
    },
    '::-webkit-scrollbar-track': {
      backgroundColor: 'transparent',
    },
    '::-webkit-scrollbar-thumb': {
      backgroundColor: 'var(--text-faint)',
      borderRadius: '9999px',
    },
  },
});
