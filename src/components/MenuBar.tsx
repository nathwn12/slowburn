import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate, type LinkProps } from '@tanstack/react-router';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import LibraryAPI from '../api/LibraryAPI';
import SettingsAPI from '../api/SettingsAPI';
import useInvalidate from '../hooks/useInvalidate';
import { usePlayerState } from '../hooks/usePlayer';
import importFoldersFromDialog from '../lib/import-folders';
import player from '../lib/player';
import { configQuery } from '../lib/queries';
import { goToPlayingTrack } from '../lib/queue-origin';
import { shouldShowCustomTitleBar } from '../lib/title-bar';
import { logAndNotifyError } from '../lib/utils';
import { useShortcuts } from './shortcuts';

const TOP_LEVEL = ['file', 'playback', 'view', 'tools', 'help'] as const;
type TopLevel = (typeof TOP_LEVEL)[number];

/**
 * The in-app menu bar (File / Playback / View / Tools / Help): the visible
 * half of the `menu_bar_visible` toggle on frameless windows, where the
 * native Tauri menu has no frame to attach to. The TitleBar menu button and
 * the Alt keybinding flip the same flag the native menu uses, so there is
 * one show/hide path; every entry below reuses the exact effect its
 * shortcut (or header control) already performs.
 *
 * Windows-only, like the custom TitleBar: macOS keeps its global native
 * menu. Hidden until toggled, exactly like the native bar it stands in for.
 */
export default function MenuBar() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const config = useSuspenseQuery(configQuery).data;
  const queueOrigin = usePlayerState((state) => state.queueOrigin);
  const shuffle = usePlayerState((state) => state.shuffle);
  const repeat = usePlayerState((state) => state.repeat);
  const shortcutsToggle = useShortcuts((state) => state.toggle);

  const [openMenu, setOpenMenu] = useState<TopLevel | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpenMenu(null);
  }, []);

  // Focus the first item when a menu opens, so arrows/Enter work at once.
  useEffect(() => {
    if (openMenu == null) return;
    const first = barRef.current?.querySelector(
      '[role="menu"] [role^="menuitem"]',
    );
    if (first instanceof HTMLElement) {
      first.focus();
    }
  }, [openMenu]);

  const labels: Record<TopLevel, string> = {
    file: t`File`,
    playback: t`Playback`,
    view: t`View`,
    tools: t`Tools`,
    help: t`Help`,
  };

  if (!shouldShowCustomTitleBar(window.__MUSEEKS_PLATFORM)) {
    return null;
  }

  if (config.menu_bar_visible !== true) {
    return null;
  }

  const run = (fn: () => void | Promise<unknown>) => () => {
    try {
      const result = fn();
      if (result instanceof Promise) {
        result.catch(logAndNotifyError);
      }
    } catch (error) {
      logAndNotifyError(error);
    }
    close();
  };

  const doImportFolders = run(() => importFoldersFromDialog(invalidate));
  const doRescan = run(async () => {
    await LibraryAPI.scan();
    await invalidate();
  });
  const doExit = run(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  });

  const doPlayPause = run(() => player.playPause());
  const doStop = run(() => {
    player.stop();
  });
  const doPrevious = run(() => player.previous());
  const doNext = run(() => player.next());
  const doShuffle = run(() => player.toggleShuffle());
  const doRepeat = run(() => player.toggleRepeat());

  const doLibrary = run(() => navigate({ to: '/library' }));
  const doPlaylists = run(() => navigate({ to: '/playlists' }));
  const doJump = run(() => goToPlayingTrack(queueOrigin, navigate));
  const doMini = run(() =>
    SettingsAPI.setUIMode(config.ui_mode === 'mini' ? 'full' : 'mini').then(
      invalidate,
    ),
  );

  const doSettings = run(() => navigate({ to: '/settings/library' }));
  const doShortcuts = run(() => {
    shortcutsToggle();
  });

  const doAbout = run(() => navigate({ to: '/settings/about' }));
  const doIssue = run(() =>
    openUrl('https://github.com/martpie/museeks/issues'),
  );

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label={t`Application menu bar`}
      {...stylex.props(styles.bar)}
    >
      {TOP_LEVEL.map((menu) => (
        <MenuSlot
          key={menu}
          label={labels[menu]}
          open={openMenu === menu}
          onToggle={() => {
            setOpenMenu(openMenu === menu ? null : menu);
          }}
          onHover={() => {
            if (openMenu != null && openMenu !== menu) {
              setOpenMenu(menu);
            }
          }}
          onTopKey={(event) => {
            onTopLevelKeyDown(event, menu, openMenu, setOpenMenu, barRef);
          }}
          onMenuKey={(event) => {
            onMenuKeyDown(event, menu, setOpenMenu, barRef);
          }}
        >
          {menu === 'file' && (
            <>
              <Item
                label={t`Import folders...`}
                hint="Ctrl+O"
                onSelect={doImportFolders}
              />
              <Item label={t`Rescan library`} onSelect={doRescan} />
              <Separator />
              <Item label={t`Exit`} onSelect={doExit} />
            </>
          )}
          {menu === 'playback' && (
            <>
              <Item
                label={t`Play / Pause`}
                hint="Space"
                onSelect={doPlayPause}
              />
              <Item label={t`Stop`} onSelect={doStop} />
              <Item label={t`Previous track`} onSelect={doPrevious} />
              <Item label={t`Next track`} onSelect={doNext} />
              <Separator />
              <CheckItem
                label={t`Shuffle`}
                checked={shuffle}
                onSelect={doShuffle}
              />
              <CheckItem
                label={t`Repeat`}
                checked={repeat !== 'None'}
                onSelect={doRepeat}
              />
            </>
          )}
          {menu === 'view' && (
            <>
              <Item
                label={t`Go to library`}
                hint="Ctrl+L"
                onSelect={doLibrary}
              />
              <Item
                label={t`Go to playlists`}
                hint="Ctrl+P"
                onSelect={doPlaylists}
              />
              <Item
                label={t`Jump to playing track`}
                hint="Ctrl+T"
                onSelect={doJump}
              />
              <Separator />
              <CheckItem
                label={t`Mini mode`}
                hint="Ctrl+M"
                checked={config.ui_mode === 'mini'}
                onSelect={doMini}
              />
            </>
          )}
          {menu === 'tools' && (
            <>
              <Item label={t`Settings`} hint="Ctrl+," onSelect={doSettings} />
              <Item
                label={t`Keyboard shortcuts`}
                hint="?"
                onSelect={doShortcuts}
              />
            </>
          )}
          {menu === 'help' && (
            <>
              <Item label={t`About Slowburn`} onSelect={doAbout} />
              <Item label={t`Report an issue`} onSelect={doIssue} />
            </>
          )}
        </MenuSlot>
      ))}
    </div>
  );
}

function MenuSlot({
  label,
  open,
  onToggle,
  onHover,
  onTopKey,
  onMenuKey,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onHover: () => void;
  onTopKey: (event: ReactKeyboardEvent) => void;
  onMenuKey: (event: ReactKeyboardEvent) => void;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.slot)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        onMouseEnter={onHover}
        onKeyDown={onTopKey}
        {...stylex.props(styles.topButton, open && styles.topButtonOpen)}
      >
        {label}
      </button>
      {open && (
        <>
          <div
            role="presentation"
            onClick={onToggle}
            {...stylex.props(styles.backdrop)}
          />
          <ChromeMenu label={label} onKeyDown={onMenuKey}>
            {children}
          </ChromeMenu>
        </>
      )}
    </div>
  );
}

function Separator() {
  return <div role="separator" {...stylex.props(styles.separator)} />;
}

function Item({
  label,
  hint,
  onSelect,
}: {
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onSelect}
      {...stylex.props(styles.chromeMenuItem)}
    >
      <span {...stylex.props(styles.chromeMenuLabel)}>{label}</span>
      {hint != null && <kbd {...stylex.props(styles.hint)}>{hint}</kbd>}
    </button>
  );
}

function CheckItem({
  label,
  hint,
  checked,
  onSelect,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={-1}
      onClick={onSelect}
      {...stylex.props(styles.chromeMenuItem)}
    >
      <span {...stylex.props(styles.check)} aria-hidden="true">
        {checked ? '✓' : ''}
      </span>
      <span {...stylex.props(styles.chromeMenuLabel)}>{label}</span>
      {hint != null && <kbd {...stylex.props(styles.hint)}>{hint}</kbd>}
    </button>
  );
}

/**
 * Shared chrome menu primitives: the single menu panel + items used by both
 * the in-app MenuBar and the header view switcher (`Navigation`), so the two
 * menus stop drifting apart. `ChromeMenuLink` is the `Link`-based item for
 * navigation menus; `Item`/`CheckItem` above are the button-based items.
 */
export function ChromeMenu({
  label,
  children,
  onClick,
  onKeyDown,
}: {
  label: string;
  children: ReactNode;
  onClick?: React.MouseEventHandler;
  onKeyDown?: React.KeyboardEventHandler;
}) {
  return (
    <div
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      {...stylex.props(styles.chromeMenu)}
    >
      {children}
    </div>
  );
}

export function ChromeMenuLink({
  to,
  label,
  onPick,
}: {
  to: LinkProps['to'];
  label: string;
  onPick: () => void;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      tabIndex={-1}
      draggable={false}
      onClick={onPick}
      {...stylex.props(styles.chromeMenuItem, styles.chromeMenuLink)}
    >
      <span {...stylex.props(styles.chromeMenuLabel)}>{label}</span>
    </Link>
  );
}

/** Move focus among the sibling top-level buttons, opening as we go. */
function topButtons(bar: HTMLDivElement | null): Array<HTMLButtonElement> {
  if (bar == null) return [];
  const found = bar.querySelectorAll(
    ':scope > div > button[aria-haspopup="menu"]',
  );
  return Array.from(found) as Array<HTMLButtonElement>;
}

function onTopLevelKeyDown(
  event: ReactKeyboardEvent,
  menu: TopLevel,
  openMenu: TopLevel | null,
  setOpenMenu: (menu: TopLevel | null) => void,
  barRef: RefObject<HTMLDivElement | null>,
) {
  const buttons = topButtons(barRef.current);
  const index = TOP_LEVEL.indexOf(menu);

  switch (event.key) {
    case 'Enter':
    case ' ':
    case 'ArrowDown': {
      event.preventDefault();
      setOpenMenu(menu);
      break;
    }
    case 'ArrowRight': {
      event.preventDefault();
      const next = TOP_LEVEL[(index + 1) % TOP_LEVEL.length];
      if (openMenu != null) {
        setOpenMenu(next);
      }
      buttons[(index + 1) % buttons.length]?.focus();
      break;
    }
    case 'ArrowLeft': {
      event.preventDefault();
      const prev = TOP_LEVEL[(index + TOP_LEVEL.length - 1) % TOP_LEVEL.length];
      if (openMenu != null) {
        setOpenMenu(prev);
      }
      buttons[(index + buttons.length - 1) % buttons.length]?.focus();
      break;
    }
    case 'Escape': {
      if (openMenu != null) {
        event.preventDefault();
        setOpenMenu(null);
      }
      break;
    }
    default:
      break;
  }
}

function onMenuKeyDown(
  event: ReactKeyboardEvent,
  menu: TopLevel,
  setOpenMenu: (menu: TopLevel | null) => void,
  barRef: RefObject<HTMLDivElement | null>,
) {
  const bar = barRef.current;
  const target = event.target as HTMLElement | null;
  if (bar == null || target == null) return;

  const found = bar.querySelectorAll('[role="menu"] [role^="menuitem"]');
  const items = Array.from(found) as Array<HTMLElement>;
  const index = items.indexOf(target);

  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
      break;
    }
    case 'ArrowUp': {
      event.preventDefault();
      items[(index + items.length - 1) % items.length]?.focus();
      break;
    }
    case 'Home': {
      event.preventDefault();
      items[0]?.focus();
      break;
    }
    case 'End': {
      event.preventDefault();
      items[items.length - 1]?.focus();
      break;
    }
    case 'ArrowRight':
    case 'ArrowLeft': {
      event.preventDefault();
      const buttons = topButtons(bar);
      const current = TOP_LEVEL.indexOf(menu);
      const next =
        event.key === 'ArrowRight'
          ? (current + 1) % TOP_LEVEL.length
          : (current + TOP_LEVEL.length - 1) % TOP_LEVEL.length;
      setOpenMenu(TOP_LEVEL[next]);
      buttons[next]?.focus();
      // Focus lands on the button; the open effect moves it into the menu.
      break;
    }
    case 'Escape': {
      event.preventDefault();
      setOpenMenu(null);
      topButtons(bar)[TOP_LEVEL.indexOf(menu)]?.focus();
      break;
    }
    case 'Tab': {
      setOpenMenu(null);
      break;
    }
    default:
      break;
  }
}

const styles = stylex.create({
  bar: {
    display: 'flex',
    alignItems: 'stretch',
    columnGap: '2px',
    paddingBlock: '2px',
    paddingInline: '6px',
    backgroundColor: 'var(--surface)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    color: 'var(--text)',
    userSelect: 'none',
    flexGrow: 0,
    flexShrink: 0,
  },
  slot: {
    position: 'relative',
  },
  topButton: {
    paddingBlock: '4px',
    paddingInline: '10px',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'transparent',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    fontSize: '12px',
    cursor: 'default',
  },
  topButtonOpen: {
    backgroundColor: 'var(--surface-hover)',
    color: 'var(--text-bright)',
  },
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 900,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    cursor: 'default',
  },
  chromeMenu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 1000,
    minWidth: '220px',
    display: 'flex',
    flexDirection: 'column',
    rowGap: '1px',
    padding: '4px',
    backgroundColor: 'var(--surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-soft)',
    borderRadius: 'var(--radius)',
    boxShadow: '0 12px 32px rgba(0,0,0,.45)',
  },
  chromeMenuItem: {
    boxSizing: 'border-box',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    paddingBlock: '6px',
    paddingInline: '10px',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
      ':focus-visible': 'var(--surface-hover)',
    },
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
      ':focus-visible': 'var(--text-bright)',
    },
    fontSize: '12px',
    fontWeight: 600,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    cursor: 'default',
  },
  // Link-based items keep the native pointer cursor.
  chromeMenuLink: {
    textDecoration: 'none',
    cursor: 'pointer',
  },
  chromeMenuLabel: {
    flexGrow: 1,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  check: {
    width: '14px',
    flexShrink: 0,
    textAlign: 'center',
    color: 'var(--text-bright)',
  },
  hint: {
    fontFamily: 'var(--mono-font)',
    fontSize: '10px',
    color: 'var(--text-faint)',
    backgroundColor: 'transparent',
  },
  separator: {
    height: '1px',
    marginBlock: '4px',
    marginInline: '8px',
    backgroundColor: 'var(--border-soft)',
  },
});
