import { open } from '@tauri-apps/plugin-dialog';
import { useCallback } from 'react';
import Keybinding from 'react-keybinding-component';

import LibraryAPI from '../api/LibraryAPI';
import useInvalidate from '../hooks/useInvalidate';
import ConfigBridge from '../lib/bridge-config';
import SettingsBridge from '../lib/bridge-settings';
import { resolveSetA, resolveSetB } from '../lib/dense-ab';
import player from '../lib/player';
import { logAndNotifyError } from '../lib/utils';
import { isCtrlKey } from '../lib/utils-events';

/** Seconds the plain arrow keys seek; Shift makes it fine (design §6). */
const SEEK_STEP = 10;
const FINE_SEEK_STEP = 1;

/** Focus the header search field (Ctrl+K). The header Search has no id, so we
 *  reach it through the banner element that owns it. */
function focusSearch(): void {
  const input = document.querySelector<HTMLInputElement>('header input');
  input?.focus();
  input?.select();
}

/** Ctrl+O: pick folders and import them, the same path the dropzone takes. */
async function importFolders(
  invalidate: () => Promise<unknown>,
): Promise<void> {
  try {
    const selection = await open({ directory: true, multiple: true });
    if (selection == null) return;
    const folders = Array.isArray(selection) ? selection : [selection];
    if (folders.length === 0) return;
    await LibraryAPI.addLibraryFolders(folders);
    await LibraryAPI.scan();
    await invalidate();
  } catch (error) {
    logAndNotifyError(error);
  }
}

/**
 * App-level keyboard: transport, A-B loop editing, fine seek, search focus
 * and import. (Global shortcuts via the native shortcut API are avoided to
 * keep the app a good citizen with other applications.)
 */
function GlobalKeyBindings() {
  const invalidate = useInvalidate();

  const onKey = useCallback(
    async (e: KeyboardEvent) => {
      // A focused A-B handle owns the arrow/Home/End keys.
      const target = e.target as HTMLElement | null;
      const onAbHandle =
        target != null &&
        typeof target.closest === 'function' &&
        target.closest('[data-ab-handle]') != null;
      if (
        onAbHandle &&
        (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')
      ) {
        return;
      }

      if (isCtrlKey(e)) {
        if (e.key.toLowerCase() === 'k') {
          e.preventDefault();
          e.stopPropagation();
          focusSearch();
          return;
        }
        if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          e.stopPropagation();
          await importFolders(invalidate);
          return;
        }
      }

      // Never let the global transport/seek keys hijack a focused control:
      // Space on a button must activate only the button, a focused grip must
      // only drag, etc. Modifier shortcuts above still work.
      const interactive =
        target != null &&
        typeof target.closest === 'function' &&
        target.closest(
          'button, a, input, select, textarea, [contenteditable="true"], [role="button"], [role="slider"], [role="option"], [role="menuitem"], [data-museeks-action]',
        ) != null;
      if (interactive) return;

      const duration = player.getTrack()?.duration ?? 0;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          await player.playPause();
          break;
        case '[': {
          e.preventDefault();
          e.stopPropagation();
          const current = player.getAbLoop();
          const next = resolveSetA(
            player.getCurrentTime(),
            current.endSeconds,
            duration,
          );
          await player.setAbPoint('A', next.a);
          if (next.b != null && next.b !== current.endSeconds) {
            await player.setAbPoint('B', next.b);
          }
          break;
        }
        case ']': {
          e.preventDefault();
          e.stopPropagation();
          const current = player.getAbLoop();
          const next = resolveSetB(
            current.startSeconds,
            player.getCurrentTime(),
            duration,
          );
          if (next.a != null && next.a !== current.startSeconds) {
            await player.setAbPoint('A', next.a);
          }
          await player.setAbPoint('B', next.b);
          break;
        }
        case '\\':
          e.preventDefault();
          e.stopPropagation();
          await player.clearAbLoop();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.stopPropagation();
          player.setCurrentTime(
            player.getCurrentTime() - (e.shiftKey ? FINE_SEEK_STEP : SEEK_STEP),
          );
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopPropagation();
          player.setCurrentTime(
            player.getCurrentTime() + (e.shiftKey ? FINE_SEEK_STEP : SEEK_STEP),
          );
          break;
        case 'Alt': {
          const menuVisible = await ConfigBridge.get('menu_bar_visible');
          if (menuVisible) {
            await SettingsBridge.hideMenu();
          } else {
            await SettingsBridge.showMenu();
          }
          break;
        }
        default:
          break;
      }
    },
    [invalidate],
  );

  return <Keybinding onKey={onKey} preventInputConflict />;
}

export default GlobalKeyBindings;
