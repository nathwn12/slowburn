import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import type {
  Config,
  SortField,
  SortKey,
  SortOrder,
} from '../generated/typings';
import ConfigBridge from '../lib/bridge-config';
import { configQuery } from '../lib/queries';
import {
  DEFAULT_SORT_KEYS,
  SORT_PRESETS,
  type SortPreset,
} from '../lib/sort-presets';
import Icon from './Icon';

const ASC: SortOrder = 'Asc';
const DSC: SortOrder = 'Dsc';

/**
 * Every field the data model can order by, in menu order. The model is the
 * camelCase `SortField` union in the generated typings; this list is the
 * menu's source of truth so no supported field is ever unreachable from
 * the UI.
 */
export const ALL_SORT_FIELDS: SortField[] = [
  'artist',
  'album',
  'title',
  'genre',
  'duration',
  'trackNo',
  'diskNo',
  'playCount',
  'dateAdded',
  'fileModified',
];

type Props = {
  sortable?: boolean;
};

/**
 * One readable sort control. The library rows are two-line (`title` over
 * `artist . album`), so a five-column table header fights the row rhythm
 * and - in a narrow window - its cells collapse into truncated chips nobody
 * can read. This renders a single control instead: a `Sort: <name>` button
 * that opens the full menu, plus a separate direction button that flips the
 * primary key. Multi-key editing lives inside the menu, never in the header.
 */
export default function TrackListHeader({ sortable = true }: Props) {
  const { t } = useLingui();

  return (
    <div
      {...stylex.props(styles.trackListHeader)}
      role="group"
      aria-label={t`Track list sorting options`}
    >
      <SortControl disabled={!sortable} />
    </div>
  );
}

/**
 * Canonical translated sort-preset labels, shared with the advanced settings
 * screen. Kept behind a hook so every `t` macro stays inside a component
 * context with `useLingui` and the i18n catalog never changes shape; the raw
 * `labelKey` is only a fallback.
 */
export function useSortPresetLabels(): Record<string, string> {
  const { t } = useLingui();
  return {
    recentlyModified: t`Recently modified`,
    recentlyAdded: t`Recently added`,
    artistAlbum: t`Artist / Album`,
    album: t`Album`,
    length: t`Length`,
    mostPlayed: t`Most played`,
  };
}

/**
 * Canonical translated labels for every sortable field, same hook shape as
 * the preset labels so the menu and the settings screen can share them.
 */
export function useSortFieldLabels(): Record<SortField, string> {
  const { t } = useLingui();
  return {
    artist: t`Artist`,
    album: t`Album`,
    title: t`Title`,
    genre: t`Genre`,
    duration: t`Duration`,
    trackNo: t`Track number`,
    diskNo: t`Disc number`,
    playCount: t`Play count`,
    dateAdded: t`Date added`,
    fileModified: t`Date modified`,
  };
}

/** The preset whose whole key stack matches, if any (same match as settings). */
function presetFor(keys: SortKey[]): SortPreset | undefined {
  return SORT_PRESETS.find(
    (preset) => JSON.stringify(preset.keys) === JSON.stringify(keys),
  );
}

/**
 * The single sort control: a trigger button naming the active sort in plain
 * words plus a direction button that flips the primary key. The compact
 * variant renders the same control with tighter padding for narrow surfaces
 * (the mini/queue sub-bar); it opens the same menu. An empty stack is the
 * legitimate "Manual" order - kept as a word, rendered as a button.
 */
export function SortControl({
  compact = false,
  disabled = false,
}: {
  compact?: boolean;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const config = useSuspenseQuery(configQuery).data;
  const keys = config.library_sort_keys;

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const presetLabels = useSortPresetLabels();

  const applyKeys = useMutation({
    mutationFn: async (next: SortKey[]) => {
      await ConfigBridge.multiSet({ library_sort_keys: next });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: configQuery.queryKey });
      const previousConfig = queryClient.getQueryData<Config>(
        configQuery.queryKey,
      );
      queryClient.setQueryData(configQuery.queryKey, {
        ...previousConfig,
        library_sort_keys: next,
      });
      return { previousConfig };
    },
  });

  // An emptied stack has no defined rendering, so clearing the last level
  // falls back to the default bundle instead of sorting arbitrarily.
  const setKeys = useCallback(
    (next: SortKey[]) => {
      applyKeys.mutate(next.length === 0 ? DEFAULT_SORT_KEYS : next);
    },
    [applyKeys],
  );

  const closeMenu = useCallback((refocusTrigger: boolean) => {
    setOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  }, []);

  // An outside pointer closes the menu; Tab closes it and lets focus travel
  // on instead of dragging it back to the trigger.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        closeMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closeMenu]);

  const preset = presetFor(keys);
  const baseLabel =
    preset != null
      ? (presetLabels[preset.id] ?? preset.labelKey)
      : keys.length === 0
        ? t`Manual`
        : t`Custom (${keys.length} levels)`;

  const primary = keys[0] ?? null;

  const flipPrimary = useCallback(() => {
    if (primary == null) return;
    setKeys([
      {
        field: primary.field,
        direction: primary.direction === ASC ? DSC : ASC,
      },
      ...keys.slice(1),
    ]);
  }, [keys, primary, setKeys]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' && !open) {
      event.preventDefault();
      setOpen(true);
    }
  };

  // The direction is a word plus an arrow glyph, never colour alone, and the
  // accessible name always states both the current and the next direction.
  const directionLabel =
    primary?.direction === DSC
      ? t`Sort direction: descending. Activate to sort ascending.`
      : t`Sort direction: ascending. Activate to sort descending.`;

  return (
    <div ref={wrapRef} {...stylex.props(styles.control)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={disabled ? t`Sorting is off while reordering` : undefined}
        onClick={() => (open ? closeMenu(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
        {...stylex.props(styles.trigger, compact && styles.compact)}
      >
        <span>{t`Sort: ${baseLabel}`}</span>
        <span aria-hidden="true" {...stylex.props(styles.chevron)}>
          <Icon name="chevronDown" size={12} />
        </span>
      </button>
      {primary != null && (
        <button
          type="button"
          disabled={disabled}
          aria-label={directionLabel}
          title={disabled ? t`Sorting is off while reordering` : undefined}
          onClick={flipPrimary}
          {...stylex.props(styles.direction, compact && styles.compact)}
        >
          <span aria-hidden="true">
            {primary.direction === ASC ? '^' : 'v'}
          </span>{' '}
          {primary.direction === ASC ? t`Ascending` : t`Descending`}
        </button>
      )}
      {open && !disabled && (
        <SortMenu keys={keys} onKeysChange={setKeys} onClose={closeMenu} />
      )}
    </div>
  );
}

/**
 * The sort menu, pure over the key stack so any surface (library header,
 * queue sub-bar) can drive it from its own state: presets apply a whole
 * stack, fields sort by that field alone, and the levels section manages
 * the multi-key stack with explicit priorities. Choosing a preset or a
 * field closes the menu; level edits leave it open.
 */
export function SortMenu({
  keys,
  onKeysChange,
  onClose,
}: {
  keys: SortKey[];
  onKeysChange: (next: SortKey[]) => void;
  onClose: (refocusTrigger: boolean) => void;
}) {
  const { t } = useLingui();
  const menuRef = useRef<HTMLDivElement>(null);
  const presetLabels = useSortPresetLabels();
  const fieldLabels = useSortFieldLabels();

  const activePresetId = presetFor(keys)?.id ?? null;
  const primaryField = keys[0]?.field ?? null;

  // Focus the checked preset on open (falling back to the primary field,
  // then the first item) so keyboard users land on the current sort.
  useEffect(() => {
    const menu = menuRef.current;
    if (menu == null) return;
    const checked = menu.querySelector('[aria-checked="true"]');
    const primary =
      primaryField != null
        ? menu.querySelector(`[data-field="${primaryField}"]`)
        : null;
    const first = menu.querySelector('button:not([disabled])');
    ((checked ?? primary ?? first) as HTMLElement | null)?.focus();
  }, [primaryField]);

  // Menu keyboard grammar (mirrors the app-menu pattern): arrows walk every
  // live button including the per-level controls, Home/End jump, Enter
  // activates natively, Esc closes back onto the trigger, Tab moves on.
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose(true);
      return;
    }
    if (event.key === 'Tab') {
      onClose(false);
      return;
    }
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }
    const menu = menuRef.current;
    if (menu == null) return;
    const items = Array.from(
      menu.querySelectorAll('button:not([disabled])'),
    ) as HTMLButtonElement[];
    if (items.length === 0) return;
    const index = items.indexOf(event.target as HTMLButtonElement);
    event.preventDefault();
    if (event.key === 'ArrowDown') {
      (items[index + 1] ?? items[0])?.focus();
    } else if (event.key === 'ArrowUp') {
      (items[index - 1] ?? items[items.length - 1])?.focus();
    } else if (event.key === 'Home') {
      items[0]?.focus();
    } else {
      items[items.length - 1]?.focus();
    }
  };

  // Choosing a field sorts by that field alone and closes; shift-click adds
  // it as another level and leaves the menu open so levels accumulate.
  const pickField = (field: SortField, add: boolean) => {
    if (add) {
      if (!keys.some((key) => key.field === field)) {
        onKeysChange([...keys, { field, direction: ASC }]);
      }
      return;
    }
    onKeysChange([{ field, direction: ASC }]);
    onClose(true);
  };

  const flipKey = (field: SortField) => {
    onKeysChange(
      keys.map((key) =>
        key.field === field
          ? { field, direction: key.direction === ASC ? DSC : ASC }
          : key,
      ),
    );
  };

  const removeKey = (field: SortField) => {
    onKeysChange(keys.filter((key) => key.field !== field));
    // The row unmounts under focus, so park focus on the menu itself;
    // arrows keep working from there.
    menuRef.current?.focus();
  };

  const moveKey = (field: SortField, delta: -1 | 1) => {
    const index = keys.findIndex((key) => key.field === field);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= keys.length) return;
    const next = [...keys];
    const [moved] = next.splice(index, 1);
    if (moved == null) return;
    next.splice(target, 0, moved);
    onKeysChange(next);
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={t`Sort options`}
      tabIndex={-1}
      onKeyDown={onMenuKeyDown}
      {...stylex.props(styles.menu)}
    >
      <div role="group" aria-label={t`Sort presets`}>
        <div aria-hidden="true" {...stylex.props(styles.menuHeading)}>
          {t`Presets`}
        </div>
        {SORT_PRESETS.map((preset) => {
          const checked = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              onClick={() => {
                onKeysChange(preset.keys);
                onClose(true);
              }}
              {...stylex.props(styles.menuItem)}
            >
              <span {...stylex.props(styles.menuLabel)}>
                {presetLabels[preset.id] ?? preset.labelKey}
              </span>
              {checked && (
                <span aria-hidden="true" {...stylex.props(styles.menuCheck)}>
                  :white_check_mark:
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div aria-hidden="true" {...stylex.props(styles.menuSeparator)} />
      <div role="group" aria-label={t`Sort by field`}>
        <div aria-hidden="true" {...stylex.props(styles.menuHeading)}>
          {t`Fields`}
        </div>
        {ALL_SORT_FIELDS.map((field) => {
          const position = keys.findIndex((key) => key.field === field);
          const stacked = position >= 0 ? keys[position] : undefined;
          return (
            <button
              key={field}
              type="button"
              role="menuitem"
              data-field={field}
              title={t`Shift-click to add as another sort level`}
              onClick={(event) => pickField(field, event.shiftKey)}
              {...stylex.props(styles.menuItem)}
            >
              <span {...stylex.props(styles.menuLabel)}>
                {fieldLabels[field]}
              </span>
              {stacked != null && (
                <span {...stylex.props(styles.menuMeta)}>
                  {position + 1} .{' '}
                  {stacked.direction === ASC ? t`Ascending` : t`Descending`}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div aria-hidden="true" {...stylex.props(styles.menuSeparator)} />
      <div role="group" aria-label={t`Sort levels`}>
        <div aria-hidden="true" {...stylex.props(styles.menuHeading)}>
          {t`Levels`}
        </div>
        {keys.length === 0 ? (
          <div {...stylex.props(styles.menuNote)}>{t`Manual order`}</div>
        ) : (
          keys.map((key, index) => {
            const name = fieldLabels[key.field];
            const ascending = key.direction === ASC;
            return (
              <div key={key.field} {...stylex.props(styles.levelRow)}>
                <span {...stylex.props(styles.menuLabel)}>
                  {index + 1}. {name} .{' '}
                  {ascending ? t`Ascending` : t`Descending`}
                </span>
                <span {...stylex.props(styles.levelActions)}>
                  <button
                    type="button"
                    aria-label={
                      ascending
                        ? t`${name}: ascending. Activate to sort descending.`
                        : t`${name}: descending. Activate to sort ascending.`
                    }
                    onClick={() => flipKey(key.field)}
                    {...stylex.props(styles.levelButton)}
                  >
                    {ascending ? t`Sort descending` : t`Sort ascending`}
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={t`Move ${name} up`}
                    onClick={() => moveKey(key.field, -1)}
                    {...stylex.props(styles.levelButton)}
                  >
                    {t`Move up`}
                  </button>
                  <button
                    type="button"
                    disabled={index === keys.length - 1}
                    aria-label={t`Move ${name} down`}
                    onClick={() => moveKey(key.field, 1)}
                    {...stylex.props(styles.levelButton)}
                  >
                    {t`Move down`}
                  </button>
                  <button
                    type="button"
                    aria-label={t`Remove ${name} from the sort`}
                    onClick={() => removeKey(key.field)}
                    {...stylex.props(styles.levelButton)}
                  >
                    {t`Remove`}
                  </button>
                </span>
              </div>
            );
          })
        )}
        <div {...stylex.props(styles.menuNote)}>
          {t`Shift-click a field above to add it as another level.`}
        </div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  trackListHeader: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '2px',
    height: 'var(--space-5)',
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
    // The menu drops below the bar, so the bar must not clip it.
    overflow: 'visible',
    minWidth: 0,
  },
  control: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    columnGap: '4px',
    minWidth: 0,
  },
  trigger: {
    appearance: 'none',
    display: 'flex',
    alignItems: 'center',
    columnGap: '4px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--text-faint)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
      ':focus-visible': 'var(--surface-hover)',
    },
    borderWidth: 0,
    borderRadius: 'var(--radius-sm)',
    paddingBlock: '3px',
    paddingInline: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    opacity: {
      default: 1,
      ':disabled': 0.45,
    },
  },
  compact: {
    fontSize: '11px',
    paddingBlock: '2px',
    paddingInline: '4px',
  },
  chevron: {
    display: 'flex',
    alignItems: 'center',
  },
  direction: {
    appearance: 'none',
    display: 'flex',
    alignItems: 'center',
    columnGap: '4px',
    fontSize: '12px',
    fontWeight: 700,
    color: 'var(--accent-text)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
      ':focus-visible': 'var(--surface-hover)',
    },
    borderWidth: 0,
    borderRadius: 'var(--radius-sm)',
    paddingBlock: '3px',
    paddingInline: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    opacity: {
      default: 1,
      ':disabled': 0.45,
    },
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    zIndex: 30,
    minWidth: '260px',
    maxWidth: '320px',
    maxHeight: 'min(360px, 60vh)',
    overflowY: 'auto',
    backgroundColor: 'var(--surface)',
    color: 'var(--text-faint)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-sm)',
    paddingBlock: '4px',
    paddingInline: '4px',
  },
  menuHeading: {
    fontSize: '10px',
    fontWeight: 800,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    paddingBlockStart: '6px',
    paddingBlockEnd: '2px',
    paddingInline: '8px',
  },
  menuItem: {
    appearance: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: '12px',
    width: '100%',
    textAlign: 'left',
    fontSize: '12px',
    color: 'inherit',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
      ':focus-visible': 'var(--surface-hover)',
    },
    borderWidth: 0,
    borderRadius: 'var(--radius-sm)',
    paddingBlock: '5px',
    paddingInline: '8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  menuLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  menuMeta: {
    flexShrink: 0,
    fontSize: '11px',
  },
  menuCheck: {
    flexShrink: 0,
    fontWeight: 800,
  },
  menuSeparator: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--border)',
    marginBlock: '4px',
    marginInline: 0,
  },
  menuNote: {
    fontSize: '11px',
    paddingBlock: '4px',
    paddingInline: '8px',
  },
  levelRow: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '4px',
    fontSize: '12px',
    paddingBlock: '5px',
    paddingInline: '8px',
  },
  levelActions: {
    display: 'flex',
    flexWrap: 'wrap',
    rowGap: '4px',
    columnGap: '4px',
  },
  levelButton: {
    appearance: 'none',
    fontSize: '11px',
    fontWeight: 700,
    color: 'inherit',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
      ':focus-visible': 'var(--surface-hover)',
    },
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-sm)',
    paddingBlock: '2px',
    paddingInline: '6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    opacity: {
      default: 1,
      ':disabled': 0.45,
    },
  },
});
