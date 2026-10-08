import { getCurrentWindow } from '@tauri-apps/api/window';
import { info } from '@tauri-apps/plugin-log';

import type { Config } from '../generated/typings';
import ConfigBridge from '../lib/bridge-config';
import SettingsBridge from '../lib/bridge-settings';
import { getCover, sampleCoverAccent } from '../lib/cover';
import player from '../lib/player';
import { getTheme, resolveBootThemeId, SYSTEM_THEME_ID } from '../lib/themes';
import { logAndNotifyError } from '../lib/utils';
import LibraryAPI from './LibraryAPI';

export const DEFAULT_MAIN_COLOR = '#459ce7';

/**
 * THIS WHOLE MODULE IS DEPRECATED as it has organically grown into something weird
 * and should be merged somehow with BridgeSettings + a way to listen and react
 * to config changes and react to them.
 */

// Manual prevention of a useEffect being called twice (to avoid refreshing the
// library twice on startup in dev mode).
// Also, we useInvalidate, SettingsAPI.init would infinitely loop. It means
// something is fishy and need to be fixed "somewhere".
let did_init = false;

/**
 * Init all settings, then show the app
 */
async function init(then: () => void): Promise<void> {
  if (did_init) return;

  did_init = true;

  // Blocking (the window should not be shown until it's done)
  const [storedTheme, osTheme, color] = await Promise.all([
    ConfigBridge.get('theme').catch(() => SYSTEM_THEME_ID),
    getCurrentWindow()
      .theme()
      .then((maybeTheme) => maybeTheme ?? 'light'),
    ConfigBridge.get('ui_accent_color').then((c) => c ?? DEFAULT_MAIN_COLOR),
  ]);

  await applyBootTheme(storedTheme, osTheme);
  applyUIMainColorToUI(color);

  // Keep the art-tinted accent in sync when the track changes
  player.on('trackChange', () => {
    refreshArtTint().catch(logAndNotifyError);
  });

  // Show the app and apply persisted menu bar visibility
  await SettingsBridge.showWindow();
  info('UI is ready!');

  // Non-blocking, these can be done later
  checkForLibraryRefresh().catch(logAndNotifyError);

  // Check if we should start a queue (maybe put that somewhere else)
  const initialQueue = window.__MUSEEKS_INITIAL_QUEUE;
  if (initialQueue !== null && initialQueue.length > 0) {
    info(
      `Starting queue from file associations (${initialQueue.length} tracks)`,
    );
    await player.start(initialQueue, initialQueue[0].id, {
      type: 'file_associations',
    });
  }

  then();
}

const setTheme = async (themeID: string): Promise<void> => {
  await ConfigBridge.set('theme', themeID);

  switch (themeID) {
    case SYSTEM_THEME_ID: {
      await getCurrentWindow().setTheme(null);
      break;
    }
    case 'light': {
      await getCurrentWindow().setTheme('light');
      break;
    }
    case 'dark': {
      await getCurrentWindow().setTheme('dark');
      break;
    }
    default: {
      // Any other theme id: pick an explicit native chrome from the theme's own
      // source instead of leaving the window with whatever it had.
      await getCurrentWindow().setTheme(getTheme(themeID).themeSource);
      break;
    }
  }

  const theme = (await getCurrentWindow().theme()) ?? 'light';

  if (themeID === SYSTEM_THEME_ID) {
    applyThemeToUI(theme);
  } else {
    // A picked flavor paints its own variables; the window theme above only
    // drives the native chrome (and the __system case).
    applyThemeToUI(themeID);
  }
};

/**
 * Paint the persisted theme on boot: a stored flavor round-trips verbatim,
 * `__system` resolves to the OS theme, and an unknown id falls back safely
 * without writing anything back (the stored value is left intact).
 */
export async function applyBootTheme(
  storedThemeID: string,
  osTheme: string,
): Promise<void> {
  if (storedThemeID === SYSTEM_THEME_ID) {
    await getCurrentWindow().setTheme(null);
    applyThemeToUI(osTheme);
    return;
  }

  const resolved = resolveBootThemeId(storedThemeID, osTheme);
  await getCurrentWindow().setTheme(getTheme(resolved).themeSource);
  applyThemeToUI(resolved);
}

/**
 * Apply theme colors to  the BrowserWindow
 */
function applyThemeToUI(themeID: string): void {
  const theme = getTheme(themeID);

  // TODO think about variables validity?
  // TODO: update the window theme dynamically
  const root = document.documentElement;
  Object.entries(theme.variables).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
}

async function setTracksDensity(
  density: Config['track_view_density'],
): Promise<void> {
  await ConfigBridge.set('track_view_density', density);
}

async function setUIMode(mode: Config['ui_mode']): Promise<void> {
  await ConfigBridge.set('ui_mode', mode);
}

const setUIMainColor = async (
  mainColor: Config['ui_accent_color'],
): Promise<void> => {
  await ConfigBridge.set('ui_accent_color', mainColor);
};

const applyUIMainColorToUI = (mainColor: Config['ui_accent_color']) => {
  document.documentElement.style.setProperty('--main-color', mainColor);
};

const setArtTint = async (enabled: Config['ui_art_tint']): Promise<void> => {
  await ConfigBridge.set('ui_art_tint', enabled);
  await refreshArtTint();
};

/**
 * Monotonic art-tint request id. Cover reads are unordered: a slow read for
 * an older track must not paint over a newer one, so only the newest
 * `refreshArtTint` call is allowed to apply.
 */
let artTintRequest = 0;

/**
 * Recompute `--main-color`: the sampled cover accent when art tint is on and
 * the current track has readable artwork, otherwise the persisted accent.
 */
async function refreshArtTint(): Promise<void> {
  const request = ++artTintRequest;
  const [tintEnabled, accent] = await Promise.all([
    ConfigBridge.get('ui_art_tint').catch(() => false),
    ConfigBridge.get('ui_accent_color').catch(() => null),
  ]);
  if (request !== artTintRequest) return;
  const fallback = accent ?? DEFAULT_MAIN_COLOR;

  if (!tintEnabled) {
    applyUIMainColorToUI(fallback);
    return;
  }

  const track = player.getTrack();

  if (track === null) {
    applyUIMainColorToUI(fallback);
    return;
  }

  const cover = await getCover(track.path).catch(() => null);
  if (request !== artTintRequest) return;

  if (cover === null) {
    applyUIMainColorToUI(fallback);
    return;
  }

  const sampled = await sampleCoverAccent(cover).catch(() => null);
  if (request !== artTintRequest) return;
  applyUIMainColorToUI(sampled ?? fallback);
}

/**
 * Toggle library refresh on startup
 */
async function toggleLibraryAutorefresh(value: boolean): Promise<void> {
  await ConfigBridge.set('library_autorefresh', value);
}

async function checkForLibraryRefresh(): Promise<void> {
  const autorefreshEnabled = ConfigBridge.getInitial('library_autorefresh');

  if (autorefreshEnabled) {
    // Automatic startup scan: silent, so a deterministically unreadable
    // file does not re-warn on every launch. The failure count is still
    // recorded on the store and surfaced in Settings -> Library.
    void LibraryAPI.scan(false, true);
  }
}

/**
 * Toggle native notifications display
 */
async function toggleDisplayNotifications(value: boolean): Promise<void> {
  await ConfigBridge.set('notifications', value);
}

/**
 * Toggle follow track on track change
 */
async function toggleFollowPlayingTrack(value: boolean): Promise<void> {
  await ConfigBridge.set('audio_follow_playing_track', value);
}

// Should we use something else to harmonize between zustand and non-store APIs?
const SettingsAPI = {
  init,
  setTheme,
  applyThemeToUI,
  setUIMainColor,
  applyUIMainColorToUI,
  setArtTint,
  refreshArtTint,
  setTracksDensity,
  setUIMode,
  toggleLibraryAutorefresh,
  toggleDisplayNotifications,
  toggleFollowPlayingTrack,
};

export default SettingsAPI;
