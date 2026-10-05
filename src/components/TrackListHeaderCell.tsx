import * as stylex from '@stylexjs/stylex';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import React, { useCallback } from 'react';

import type {
  Config,
  SortBy,
  SortField,
  SortKey,
  SortOrder,
} from '../generated/typings';
import ConfigBridge from '../lib/bridge-config';
import { configQuery } from '../lib/queries';
import Icon from './Icon';

/**
 * The header still renders `SortBy` labels ("Artist", "Title", ...), but the
 * persisted model is the camelCase `SortField`. Map between them here.
 */
const SORT_FIELD_FOR: Record<SortBy, SortField> = {
  Artist: 'artist',
  Album: 'album',
  Title: 'title',
  Duration: 'duration',
  Genre: 'genre',
};

type Props = {
  title: string;
  xstyle?: stylex.CompiledStyles;
  sortBy?: SortBy | null;
};

export default function TrackListHeaderCell(props: Props) {
  const { sortBy, xstyle, title } = props;
  const queryClient = useQueryClient();

  const config = useSuspenseQuery(configQuery).data;

  const field = sortBy ? SORT_FIELD_FOR[sortBy] : null;
  const activeKey: SortKey | undefined = config.library_sort_keys[0];

  const icon =
    field && activeKey?.field === field
      ? activeKey.direction === 'Asc'
        ? 'chevronUp'
        : 'chevronDown'
      : null;

  const sortMutation = useMutation({
    mutationFn: async (newSort: SortKey) => {
      await ConfigBridge.multiSet({ library_sort_keys: [newSort] });
    },
    onMutate: async (newSort) => {
      await queryClient.cancelQueries({ queryKey: configQuery.queryKey });
      const previousConfig = queryClient.getQueryData<Config>(
        configQuery.queryKey,
      );
      queryClient.setQueryData(configQuery.queryKey, {
        ...previousConfig,
        library_sort_keys: [newSort],
      });
      return { previousConfig };
    },
  });

  const handleSort = useCallback(() => {
    if (!field) return;
    const direction: SortOrder =
      activeKey?.field === field
        ? activeKey.direction === 'Asc'
          ? 'Dsc'
          : 'Asc'
        : 'Asc';
    sortMutation.mutate({ field, direction });
  }, [field, activeKey, sortMutation]);

  const content = (
    <React.Fragment>
      <div {...stylex.props(styles.name)}>{title}</div>
      {icon && (
        <div {...stylex.props(styles.icon)}>
          <Icon name={icon} size={12} />
        </div>
      )}
    </React.Fragment>
  );

  return (
    <button
      type="button"
      disabled={sortBy === null}
      onClick={handleSort}
      {...stylex.props(
        styles.trackCellHeader,
        sortBy && styles.sortable,
        xstyle,
      )}
    >
      {content}
    </button>
  );
}

const styles = stylex.create({
  trackCellHeader: {
    fontWeight: 'var(--bold)',
    appearance: 'none',
    borderWidth: '0',
    backgroundColor: 'transparent',
    textAlign: 'left',
    padding: 0,
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    color: 'inherit',
    borderLeftWidth: {
      ':not(:first-child)': '1px',
    },
    borderLeftStyle: {
      ':not(:first-child)': 'solid',
    },
    borderLeftColor: {
      ':not(:first-child)': 'var(--border-color)',
    },
  },
  sortable: {
    backgroundColor: {
      default: 'transparent',
      ':focus': 'rgba(0 0 0 / 0.025)',
      ':active': 'rgba(0 0 0 / 0.04)',
    },
  },
  icon: {
    marginBlock: '4px',
    marginInline: '0',
    paddingBlock: '0',
    paddingInline: '4px',
    display: 'flex',
    alignItems: 'center',
  },
  name: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    marginBlock: '4px',
    marginInline: '0',
    paddingBlock: '0',
    paddingInline: '4px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
});
