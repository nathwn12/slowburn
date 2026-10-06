import * as stylex from '@stylexjs/stylex';

type Props = {
  children: React.ReactNode;
  layout?: keyof typeof layoutVariants;
  hasPadding?: boolean;
  xstyle?: stylex.CompiledStyles;
};

/**
 * Default View to be used by all route components
 */
export default function View(props: Props) {
  const { layout = 'full-width' } = props;

  // Library or Settings pages
  return (
    <div
      {...stylex.props(
        styles.view,
        layoutVariants[layout],
        props.hasPadding && styles.hasPadding,
        props.xstyle,
      )}
    >
      {layout === 'centered' ? (
        <div {...stylex.props(styles.centeredContent)}>{props.children}</div>
      ) : (
        props.children
      )}
    </div>
  );
}

const styles = stylex.create({
  view: {
    height: '100%',
    maxHeight: '100%',
    backgroundColor: 'var(--background)',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    overflow: 'auto',
    position: 'relative',
  },
  centeredContent: {
    position: 'relative',
  },
  hasPadding: {
    padding: 'clamp(16px,4vw,40px)',
  },
});

const layoutVariants = stylex.create({
  'full-width': {},
  centered: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 350px)',
    justifyContent: 'center',
    scrollbarGutter: 'stable',
  },
});
