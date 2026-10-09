import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import type React from 'react';
import { useCallback, useRef } from 'react';
import Keybinding from 'react-keybinding-component';

import LibraryAPI from '../api/LibraryAPI';
import useLibraryStore from '../lib/store';
import { isCtrlKey } from '../lib/utils-events';
import Icon from './Icon';

/**
 * Pill search field in the Dense header, with the Ctrl K affordance.
 */
export default function Search() {
  const search = useLibraryStore((state) => state.search);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useLingui();

  const onClear = useCallback(() => LibraryAPI.search(''), []);
  const onChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (event) => {
      LibraryAPI.search(event.currentTarget.value);
    },
    [],
  );

  // Select-all on keyboard focus only (Tab / Ctrl+K): mouse focus must keep
  // click-to-place-cursor, so never select there.
  const onFocus = useCallback<React.FocusEventHandler<HTMLInputElement>>(
    (e) => {
      if (e.currentTarget.matches(':focus-visible')) {
        e.currentTarget.select();
      }
    },
    [],
  );

  // Ctrl/Cmd+K shortcut (Ctrl+K is the label shown in the pill).
  const onKey = (e: KeyboardEvent) => {
    if (isCtrlKey(e) && e.key.toLowerCase() === 'k') {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  };

  return (
    <div {...stylex.props(styles.search)}>
      <span {...stylex.props(styles.searchIcon)} aria-hidden="true">
        <Icon name="search" size={12} />
      </span>
      <input
        type="text"
        placeholder={t`Search library`}
        value={search}
        onChange={onChange}
        onFocus={onFocus}
        spellCheck={false}
        ref={inputRef}
        aria-label={t`Search library`}
        {...stylex.props(styles.input)}
      />

      {search.length > 0 ? (
        <button
          type="button"
          {...stylex.props(styles.clear)}
          onClick={onClear}
          data-museeks-action
          aria-label={t`Clear search`}
        >
          <Icon name="close" size={12} />
        </button>
      ) : (
        <kbd {...stylex.props(styles.kbd)} aria-hidden="true">
          Ctrl K
        </kbd>
      )}

      <Keybinding preventInputConflict onKey={onKey} />
    </div>
  );
}

const styles = stylex.create({
  search: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '6px',
    height: '28px',
    width: '210px',
    flexShrink: 1,
    // Narrow windows (mini floor and tight full sizes): the pill yields
    // further so the breadcrumb icons, the Full/Mini button and the settings
    // gear keep their room instead of compressing. The Ctrl K hint hides
    // here - the input keeps its accessible name and placeholder.
    minWidth: '64px',
    paddingInline: '8px',
    backgroundColor: {
      default: 'var(--surface-2)',
      ':hover': 'var(--surface-hover)',
    },
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--border-soft)',
      ':focus-within': 'var(--accent)',
    },
    borderRadius: '9999px',
    color: {
      default: 'var(--text-faint)',
      ':focus-within': 'var(--text-dim)',
    },
    transitionProperty: 'border-color, background-color, color',
    transitionDuration: '.12s',
  },
  clear: {
    flexShrink: 0,
    width: '24px',
    height: '24px',
    display: 'grid',
    placeItems: 'center',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    cursor: 'pointer',
    borderStyle: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
    padding: 0,
  },
  // The clear control uses the real close glyph from the icon set.
  searchIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 0,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    outline: 'none',
    color: 'var(--text)',
    fontFamily: 'inherit',
    fontSize: '11px',
    padding: 0,
  },
  // A single, quiet inline hint - the two-keycap split read as two competing
  // boxes, and the filled `--bg` chip inverted across themes (loud white on
  // light, a black hole on AMOLED). One `--surface-3` key reads the same on
  // every flavour and matches the menu-hint convention.
  kbd: {
    flexShrink: 0,
    // Hidden at narrow widths (the mini footprint): inside a 64px pill the
    // hint crowds out the text itself. Same 640px breakpoint as the
    // breadcrumb icon collapse in Navigation.
    display: {
      default: 'inline-block',
      '@media (max-width: 640px)': 'none',
    },
    fontFamily: 'var(--mono-font)',
    fontSize: '9px',
    fontWeight: 600,
    lineHeight: 1,
    color: 'var(--text-faint)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: '3px',
    paddingBlock: '2px',
    paddingInline: '5px',
    backgroundColor: 'var(--surface-3)',
  },
});
