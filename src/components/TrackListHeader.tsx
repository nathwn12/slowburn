import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useCallback } from 'react';

import type { Config, SortKey } from '../generated/typings';
import ConfigBridge from '../lib/bridge-config';
import { configQuery } from '../lib/queries';
import { SORT_PRESETS } from '../lib/sort-presets';
import TrackListHeaderCell from './TrackListHeaderCell';

type Props = {
  sortable?: boolean;
};

/**
 * Dense sort bar. The library rows are two-line (`title` over `artist · album`),
 * so a five-column table header would fight the row rhythm; this is a compact
 * toolbar of sort options instead, which keeps sorting real without pretending
 * the list has data columns.
 *
 * The `Sort` control applies a named whole-stack preset. Presets live here, in
 * the header row, rather than in the context menu: the menu grammar belongs to
 * the deferred menus work, and sorting keeps living where sorting already is.
 */
export default function TrackListHeader({ sortable = true }: Props) {
  const { t } = useLingui();

  return (
    <div
      {...stylex.props(styles.trackListHeader)}
      role="group"
      aria-label={t`Track list sorting options`}
    >
      <SortPresetControl />
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

/**
 * Applies a named key stack wholesale. Every preset label goes through the `t`
 * macro so the catalog stays complete; the raw `labelKey` is only a fallback.
 */
function SortPresetControl() {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  const labels: Record<string, string> = {
    recentlyModified: t`Recently modified`,
    recentlyAdded: t`Recently added`,
    artistAlbum: t`Artist / Album`,
    album: t`Album`,
    length: t`Length`,
    mostPlayed: t`Most played`,
  };

  const applyPreset = useMutation({
    mutationFn: async (keys: SortKey[]) => {
      await ConfigBridge.multiSet({ library_sort_keys: keys });
    },
    onMutate: async (keys) => {
      await queryClient.cancelQueries({ queryKey: configQuery.queryKey });
      const previousConfig = queryClient.getQueryData<Config>(
        configQuery.queryKey,
      );
      queryClient.setQueryData(configQuery.queryKey, {
        ...previousConfig,
        library_sort_keys: keys,
      });
      return { previousConfig };
    },
  });

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const preset = SORT_PRESETS.find(
        (candidate) => candidate.id === event.target.value,
      );
      if (preset) applyPreset.mutate(preset.keys);
    },
    [applyPreset],
  );

  return (
    <select
      aria-label={t`Sort`}
      value=""
      onChange={handleChange}
      {...stylex.props(styles.preset)}
    >
      <option value="">{t`Sort`}</option>
      {SORT_PRESETS.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {labels[preset.id] ?? preset.labelKey}
        </option>
      ))}
    </select>
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
    // Keep the sort bar inside the column instead of forcing a horizontal
    // scrollbar under the list.
    overflowX: 'hidden',
    minWidth: 0,
  },
  preset: {
    fontSize: '9.5px',
    fontWeight: 800,
    letterSpacing: '.11em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingInline: '4px',
    flexShrink: 0,
    cursor: 'pointer',
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
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});
