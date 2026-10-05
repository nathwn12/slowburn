import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';

import TrackListHeaderCell from './TrackListHeaderCell';

type Props = {
  sortable?: boolean;
};

/**
 * Dense sort bar. The library rows are two-line (`title` over `artist · album`),
 * so a five-column table header would fight the row rhythm; this is a compact
 * toolbar of sort options instead, which keeps sorting real without pretending
 * the list has data columns.
 */
export default function TrackListHeader({ sortable = true }: Props) {
  const { t } = useLingui();

  return (
    <div
      {...stylex.props(styles.trackListHeader)}
      role="group"
      aria-label={t`Track list sorting options`}
    >
      <span {...stylex.props(styles.label)}>{t`Sort`}</span>
      <TrackListHeaderCell
        xstyle={styles.cell}
        title={t`Title`}
        sortBy={sortable ? 'Title' : null}
      />
      <TrackListHeaderCell
        xstyle={styles.cell}
        title={t`Duration`}
        sortBy={sortable ? 'Duration' : null}
      />
      <TrackListHeaderCell
        xstyle={styles.cell}
        title={t`Artist`}
        sortBy={sortable ? 'Artist' : null}
      />
      <TrackListHeaderCell
        xstyle={styles.cell}
        title={t`Album`}
        sortBy={sortable ? 'Album' : null}
      />
      <TrackListHeaderCell
        xstyle={styles.cell}
        title={t`Genre`}
        sortBy={sortable ? 'Genre' : null}
      />
    </div>
  );
}

const styles = stylex.create({
  trackListHeader: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '2px',
    height: '24px',
    flexShrink: 0,
    paddingBlock: 0,
    paddingInline: '10px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    backgroundColor: 'var(--surface)',
    color: 'var(--text-faint)',
    position: 'sticky',
    top: 0,
    zIndex: 5,
  },
  label: {
    fontSize: '9.5px',
    fontWeight: 800,
    letterSpacing: '.11em',
    color: 'var(--text-faint)',
    paddingInline: '4px',
  },
  cell: {
    paddingBlock: 0,
    paddingInline: '7px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    borderRadius: 'var(--radius-sm)',
  },
});
