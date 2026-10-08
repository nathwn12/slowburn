import { useLingui } from '@lingui/react/macro';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';

import { version } from '../../package.json';
import logoUrl from '../assets/logos/slowburn-48.png';
import ConfigBridge from '../lib/bridge-config';
import SettingsBridge from '../lib/bridge-settings';
import { shouldShowCustomTitleBar } from '../lib/title-bar';
import { logAndNotifyError } from '../lib/utils';

/**
 * Frameless window chrome (Windows-only, `null` elsewhere): a 32px bar with
 * the app mark/title, the menu affordance, and minimize / maximize-restore /
 * close wired to the Tauri window API. The whole bar is a drag region; the
 * buttons stay clickable inside it (Tauri's standard custom-titlebar
 * pattern). Mounted above the Header in `__root.tsx`, in full and mini
 * modes alike - mini keeps its own compact footprint via `mini-window.ts`,
 * which this bar never touches.
 */
export default function TitleBar() {
  const { t } = useLingui();
  const [isMaximized, setIsMaximized] = useState(false);

  // The restore glyph tracks live state, not just our own toggle: the user
  // can also maximize via Win+Up / Aero snap, so re-read on every resize.
  useEffect(() => {
    if (!shouldShowCustomTitleBar(window.__MUSEEKS_PLATFORM)) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        const refresh = async () => {
          try {
            const maximized = await win.isMaximized();
            if (!cancelled) {
              setIsMaximized(maximized === true);
            }
          } catch {
            // No Tauri backend (browser tests): keep the default glyph.
          }
        };

        await refresh();

        try {
          unlisten = await win.onResized(() => {
            void refresh();
          });
        } catch {
          // No Tauri backend (browser tests): the toggle still re-reads.
        }
      } catch {
        // No Tauri backend (browser tests): static bar, clicks no-op below.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  if (!shouldShowCustomTitleBar(window.__MUSEEKS_PLATFORM)) {
    return null;
  }

  return (
    <div
      role="toolbar"
      aria-label={t`Window title bar`}
      {...stylex.props(styles.bar)}
      data-tauri-drag-region
    >
      <img
        src={logoUrl}
        alt=""
        width={14}
        height={14}
        draggable={false}
        {...stylex.props(styles.logo)}
      />
      <div {...stylex.props(styles.title)}>
        {t`Slowburn`}
        <small {...stylex.props(styles.titleVersion)}>v{version}</small>
      </div>

      <div {...stylex.props(styles.controls)}>
        <button
          type="button"
          aria-label={t`Application menu`}
          title={t`Application menu (Alt)`}
          onClick={() => {
            void toggleMenu();
          }}
          {...stylex.props(styles.button, styles.menuButton)}
        >
          <span {...stylex.props(styles.menuGlyph)} aria-hidden="true">
            <span {...stylex.props(styles.menuBar)} />
            <span {...stylex.props(styles.menuBar)} />
            <span {...stylex.props(styles.menuBar)} />
          </span>
        </button>
        <button
          type="button"
          aria-label={t`Minimize`}
          title={t`Minimize`}
          onClick={() => {
            void minimizeWindow();
          }}
          {...stylex.props(styles.button, styles.captionButton)}
        >
          <span {...stylex.props(styles.minimizeGlyph)} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={isMaximized ? t`Restore` : t`Maximize`}
          title={isMaximized ? t`Restore` : t`Maximize`}
          onClick={() => {
            void toggleMaximize(setIsMaximized);
          }}
          {...stylex.props(styles.button, styles.captionButton)}
        >
          {isMaximized ? (
            <span {...stylex.props(styles.restoreGlyph)} aria-hidden="true">
              <span {...stylex.props(styles.restoreBack)} />
              <span {...stylex.props(styles.restoreFront)} />
            </span>
          ) : (
            <span {...stylex.props(styles.maximizeGlyph)} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          aria-label={t`Close`}
          title={t`Close`}
          onClick={() => {
            void closeWindow();
          }}
          {...stylex.props(
            styles.button,
            styles.captionButton,
            styles.closeButton,
          )}
        >
          <span {...stylex.props(styles.closeGlyph)} aria-hidden="true">
            <span {...stylex.props(styles.closeBar, styles.closeBarLeft)} />
            <span {...stylex.props(styles.closeBar, styles.closeBarRight)} />
          </span>
        </button>
      </div>
    </div>
  );
}

/** Same toggle as the Alt keybinding (`GlobalKeyBindings`), as a button. */
async function toggleMenu(): Promise<void> {
  try {
    const menuVisible = await ConfigBridge.get('menu_bar_visible');
    if (menuVisible) {
      await SettingsBridge.hideMenu();
    } else {
      await SettingsBridge.showMenu();
    }
  } catch (error) {
    logAndNotifyError(error);
  }
}

async function minimizeWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  } catch (error) {
    logAndNotifyError(error);
  }
}

async function toggleMaximize(
  setIsMaximized: (value: boolean) => void,
): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.toggleMaximize();
    setIsMaximized((await win.isMaximized()) === true);
  } catch (error) {
    logAndNotifyError(error);
  }
}

async function closeWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  } catch (error) {
    logAndNotifyError(error);
  }
}

const GLYPH_STROKE = '1.5px';

const styles = stylex.create({
  bar: {
    boxSizing: 'border-box',
    height: '32px',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    display: 'flex',
    alignItems: 'center',
    columnGap: '8px',
    paddingBlock: 0,
    paddingLeft: '10px',
    paddingRight: 0,
    backgroundColor: 'var(--surface)',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--border)',
    color: 'var(--text)',
    userSelect: 'none',
  },
  logo: {
    width: '14px',
    height: '14px',
    display: 'block',
    flexShrink: 0,
  },
  title: {
    display: 'flex',
    alignItems: 'baseline',
    columnGap: '6px',
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '.02em',
    color: 'var(--text-dim)',
  },
  titleVersion: {
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '.08em',
    color: 'var(--text-faint)',
  },
  controls: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    flexShrink: 0,
  },
  button: {
    display: 'grid',
    placeItems: 'center',
    paddingBlock: 0,
    paddingInline: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-dim)',
    cursor: 'pointer',
  },
  menuButton: {
    width: '34px',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
  },
  captionButton: {
    width: '46px',
    color: {
      default: 'var(--text-dim)',
      ':hover': 'var(--text-bright)',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--surface-hover)',
    },
  },
  // Native signature: the close button hovers signal red with a white glyph
  // (same pairing as the Button danger variant: white on var(--danger)).
  closeButton: {
    color: {
      default: 'var(--text-dim)',
      ':hover': 'white',
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--danger)',
    },
  },
  menuGlyph: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    rowGap: '2.5px',
  },
  menuBar: {
    width: '12px',
    height: GLYPH_STROKE,
    backgroundColor: 'currentColor',
  },
  minimizeGlyph: {
    width: '10px',
    height: '10px',
    borderBottomWidth: GLYPH_STROKE,
    borderBottomStyle: 'solid',
    borderBottomColor: 'currentColor',
  },
  maximizeGlyph: {
    width: '9px',
    height: '9px',
    borderWidth: GLYPH_STROKE,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderRadius: '1px',
  },
  restoreGlyph: {
    position: 'relative',
    width: '11px',
    height: '11px',
  },
  restoreBack: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '7px',
    height: '7px',
    borderWidth: GLYPH_STROKE,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderRadius: '1px',
  },
  restoreFront: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '7px',
    height: '7px',
    borderWidth: GLYPH_STROKE,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderRadius: '1px',
    backgroundColor: 'var(--surface)',
  },
  closeGlyph: {
    position: 'relative',
    width: '12px',
    height: '12px',
  },
  closeBar: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '13px',
    height: GLYPH_STROKE,
    backgroundColor: 'currentColor',
  },
  closeBarLeft: {
    transform: 'translate(-50%, -50%) rotate(45deg)',
  },
  closeBarRight: {
    transform: 'translate(-50%, -50%) rotate(-45deg)',
  },
});
