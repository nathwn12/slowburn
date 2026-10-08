import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';

import SettingsAPI from '../api/SettingsAPI';
import ConfigBridge from '../lib/bridge-config';
import { SYSTEM_THEME_ID } from '../lib/themes';
import { isDev, preventNativeDefault } from '../lib/utils-events';

/**
 * Runtime OS theme change: only repaint when the stored choice is `__system`.
 * A picked flavour wins and must survive an OS light/dark flip mid-session.
 */
export async function handleSystemThemeChange(osTheme: string): Promise<void> {
  const stored = await ConfigBridge.get('theme').catch(() => SYSTEM_THEME_ID);

  if (stored !== SYSTEM_THEME_ID) return;

  SettingsAPI.applyThemeToUI(osTheme);
}

function onSystemThemeChange({ payload }: { payload: string }) {
  void handleSystemThemeChange(payload);
}

/**
 * Handle app-level IPC Events init and cleanup
 */
function AppEvents() {
  useEffect(() => {
    // Prevent drop events on the window
    window.addEventListener('dragover', preventNativeDefault, false);
    window.addEventListener('drop', preventNativeDefault, false);

    // Disable the default context menu on production builds
    if (!isDev()) {
      window.addEventListener('contextmenu', preventNativeDefault);
    }

    const unlistenSystemThemeChange = getCurrentWindow().listen(
      'tauri://theme-changed',
      onSystemThemeChange,
    );

    return function cleanup() {
      window.removeEventListener('dragover', preventNativeDefault, false);
      window.removeEventListener('drop', preventNativeDefault, false);

      if (!isDev()) {
        window.removeEventListener('contextmenu', preventNativeDefault);
      }

      void unlistenSystemThemeChange.then((unlisten) => unlisten());
    };
  }, []);

  return null;
}

export default AppEvents;
