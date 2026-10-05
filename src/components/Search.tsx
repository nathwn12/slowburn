import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import type React from 'react';
import { useCallback, useRef } from 'react';
import Keybinding from 'react-keybinding-component';

import LibraryAPI from '../api/LibraryAPI';
import useLibraryStore from '../lib/store';
import { isCtrlKey } from '../lib/utils-events';

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

  const onFocus = useCallback<React.FocusEventHandler<HTMLInputElement>>(
    (e) => e.currentTarget.select(),
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
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        {...stylex.props(styles.icon)}
      >
        <circle
          cx="11"
          cy="11"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M16.5 16.5 21 21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      <input
        type="text"
        placeholder={t`Search title, artist, album…`}
        value={search}
        onChange={onChange}
        onFocus={onFocus}
        onMouseUp={(e) => e.preventDefault()}
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
          &times;
        </button>
      ) : (
        <span {...stylex.props(styles.kbdGroup)} aria-hidden="true">
          <kbd {...stylex.props(styles.kbd)}>Ctrl</kbd>
          <kbd {...stylex.props(styles.kbd)}>K</kbd>
        </span>
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
    height: '24px',
    width: '210px',
    flexShrink: 1,
    minWidth: '90px',
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
  icon: {
    flexShrink: 0,
    color: 'var(--text-faint)',
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
  clear: {
    flexShrink: 0,
    fontSize: '14px',
    lineHeight: 1,
    color: 'var(--text-dim)',
    cursor: 'pointer',
    borderStyle: 'none',
    backgroundColor: 'transparent',
    padding: 0,
    width: '16px',
    textAlign: 'center',
    fontFamily: 'Arial, sans-serif',
  },
  kbdGroup: {
    display: 'flex',
    alignItems: 'center',
    columnGap: '3px',
    flexShrink: 0,
  },
  kbd: {
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
    paddingInline: '4px',
    backgroundColor: 'var(--bg)',
  },
});
