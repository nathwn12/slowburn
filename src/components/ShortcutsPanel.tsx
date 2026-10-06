import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useEffect } from 'react';

import { useShortcuts } from './shortcuts';

type Binding = { keys: string[]; label: string };
type Group = { title: string; bindings: Binding[] };

/**
 * The `?` overlay: every keyboard binding the app actually implements, in
 * groups. Discoverability for ~10 bindings that were otherwise invisible.
 */
export default function ShortcutsPanel() {
  const open = useShortcuts((state) => state.open);
  const setOpen = useShortcuts((state) => state.setOpen);
  const { t } = useLingui();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const groups: Group[] = [
    {
      title: t`Playback`,
      bindings: [{ keys: ['Space'], label: t`Play / Pause` }],
    },
    {
      title: t`A–B loop`,
      bindings: [
        { keys: ['['], label: t`Set loop point A` },
        { keys: [']'], label: t`Set loop point B` },
        { keys: ['\\'], label: t`Clear the loop` },
      ],
    },
    {
      title: t`Seek`,
      bindings: [
        { keys: ['←', '→'], label: t`Seek 10 seconds` },
        { keys: ['Shift', '←/→'], label: t`Seek 1 second` },
      ],
    },
    {
      title: t`Library`,
      bindings: [
        { keys: ['Ctrl', 'K'], label: t`Focus search` },
        { keys: ['Ctrl', 'O'], label: t`Import folder or files` },
      ],
    },
    {
      title: t`Window`,
      bindings: [{ keys: ['Alt'], label: t`Toggle the menu bar` }],
    },
  ];

  return (
    <div
      {...stylex.props(styles.backdrop)}
      role="presentation"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t`Keyboard shortcuts`}
        onClick={(event) => event.stopPropagation()}
        {...stylex.props(styles.panel)}
      >
        <div {...stylex.props(styles.head)}>
          <h2 {...stylex.props(styles.title)}>{t`Keyboard shortcuts`}</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t`Close`}
            {...stylex.props(styles.close)}
          >
            &times;
          </button>
        </div>

        <div {...stylex.props(styles.grid)}>
          {groups.map((group) => (
            <div key={group.title} {...stylex.props(styles.group)}>
              <div {...stylex.props(styles.groupTitle)}>{group.title}</div>
              {group.bindings.map((binding) => (
                <div key={binding.label} {...stylex.props(styles.row)}>
                  <span {...stylex.props(styles.action)}>{binding.label}</span>
                  <span {...stylex.props(styles.keys)}>
                    {binding.keys.map((key) => (
                      <kbd key={key} {...stylex.props(styles.kbd)}>
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          {...stylex.props(styles.hint)}
        >{t`Press ? any time to reopen`}</div>
      </div>
    </div>
  );
}

const styles = stylex.create({
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    display: 'grid',
    placeItems: 'center',
    backgroundColor: 'rgba(0,0,0,.55)',
  },
  panel: {
    width: '520px',
    maxWidth: '92vw',
    maxHeight: '86vh',
    overflowY: 'auto',
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 24px 70px rgba(0,0,0,.65)',
    paddingBlock: '16px',
    paddingInline: '18px',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  title: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '.06em',
    color: 'var(--text-bright)',
  },
  close: {
    width: '22px',
    height: '22px',
    display: 'grid',
    placeItems: 'center',
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: {
      default: 'var(--text-faint)',
      ':hover': 'var(--text-bright)',
    },
    borderRadius: 'var(--radius-sm)',
    fontSize: '15px',
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (max-width: 560px)': '1fr',
    },
    columnGap: '22px',
    rowGap: '14px',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    rowGap: '6px',
  },
  groupTitle: {
    fontSize: '9.5px',
    fontWeight: 800,
    letterSpacing: '.11em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
    marginBottom: '2px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: '10px',
    fontSize: '11.5px',
    color: 'var(--text-dim)',
  },
  action: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  keys: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '3px',
    flexShrink: 0,
  },
  kbd: {
    fontFamily: 'var(--mono-font)',
    fontSize: '9.5px',
    fontWeight: 700,
    lineHeight: 1,
    color: 'var(--text-dim)',
    backgroundColor: 'var(--surface-2)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--control-border)',
    borderRadius: '3px',
    paddingBlock: '3px',
    paddingInline: '5px',
  },
  hint: {
    marginTop: '14px',
    fontSize: '10px',
    color: 'var(--text-faint)',
    textAlign: 'center',
  },
});
