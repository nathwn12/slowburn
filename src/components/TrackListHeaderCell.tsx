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
import { DEFAULT_SORT_KEYS } from '../lib/sort-presets';
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

const ASC: SortOrder = 'Asc';
const DSC: SortOrder = 'Dsc';

/**
 * One sortable field. It is a control over the ordered `library_sort_keys`
 * stack, not over a single key:
 *
 * - click a field not in the stack -> append it (ascending)
 * - click an ascending field        -> make it descending
 * - click a descending field        -> remove it (restoring the default bundle
 *                                      if it was the last key)
 * - shift-click                     -> reset the stack to this single field
 *
 * A numbered badge shows the key's position in the stack, which is why it is
 * read from the key array and never from the column's render order.
 */
export default function TrackListHeaderCell(props: Props) {
  const { sortBy, xstyle, title } = props;
  const queryClient = useQueryClient();

  const config = useSuspenseQuery(configQuery).data;

  const field = sortBy ? SORT_FIELD_FOR[sortBy] : null;
  const keys = config.library_sort_keys;
  const keyIndex =
    field == null ? -1 : keys.findIndex((key) => key.field === field);
  const activeKey: SortKey | undefined = keyIndex >= 0 ? keys[keyIndex] : undefined;
  const position = keyIndex >= 0 ? keyIndex + 1 : null;

  const icon =
    activeKey == null
      ? null
      : activeKey.direction === ASC
        ? 'chevronUp'
        : 'chevronDown';

  const sortMutation = useMutation({
    mutationFn: async (nextKeys: SortKey[]) => {
      await ConfigBridge.multiSet({ library_sort_keys: nextKeys });
    },
    onMutate: async (nextKeys) => {
      await queryClient.cancelQueries({ queryKey: configQuery.queryKey });
      const previousConfig = queryClient.getQueryData<Config>(
        configQuery.queryKey,
      );
      queryClient.setQueryData(configQuery.queryKey, {
        ...previousConfig,
        library_sort_keys: nextKeys,
      });
      return { previousConfig };
    },
  });

  const handleSort = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!field) return;

      // Shift-click resets the stack to this single, ascending key — including
      // when the field is already present (Review Focus 3).
      if (event.shiftKey) {
        sortMutation.mutate([{ field, direction: ASC }]);
        return;
      }

      const currentIndex = keys.findIndex((key) => key.field === field);

      if (currentIndex === -1) {
        sortMutation.mutate([...keys, { field, direction: ASC }]);
        return;
      }

      if (keys[currentIndex].direction === ASC) {
        sortMutation.mutate(
          keys.map((key, index) =>
            index === currentIndex ? { field, direction: DSC } : key,
          ),
        );
        return;
      }

      const removed = keys.filter((_, index) => index !== currentIndex);
      sortMutation.mutate(removed.length === 0 ? DEFAULT_SORT_KEYS : removed);
    },
    [field, keys, sortMutation],
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
      <div {...stylex.props(styles.name)}>{title}</div>
      {position !== null && (
        <div {...stylex.props(styles.badge)} aria-hidden="true">
          {position}
        </div>
      )}
      {icon && (
        <div {...stylex.props(styles.icon)} aria-hidden="true">
          <Icon name={icon} size={12} />
        </div>
      )}
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
  badge: {
    marginBlock: '4px',
    marginInline: '0',
    paddingBlock: '0',
    paddingInline: '4px',
    fontFamily: 'var(--mono-font)',
    fontSize: '9px',
    fontWeight: 700,
    fontStyle: 'normal',
    lineHeight: 1,
    color: 'var(--pink-text)',
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
