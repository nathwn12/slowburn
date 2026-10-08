import type { Theme } from '../types/museeks';
import { logAndNotifyError } from './utils';

// Every `src/themes/*.json` file is a theme; adding a file ships a theme with
// no code change. The frontend has no runtime fs access, so the scan happens
// at build time through Vite's eager glob.
const themeModules = import.meta.glob<{ default: Theme }>('../themes/*.json', {
  eager: true,
});

export const themes: Record<string, Theme> = {};

for (const mod of Object.values(themeModules)) {
  const theme = mod.default;
  themes[theme._id] = theme;
}

const DEFAULT_THEME = themes.light;

if (DEFAULT_THEME === undefined) {
  throw new Error('Default "light" theme is missing from src/themes');
}

/**
 * Explicit "follow the OS" choice. It is not a flavor in `themes`: it is
 * stored verbatim in the config and resolved to the OS theme on boot.
 */
export const SYSTEM_THEME_ID = '__system';

/**
 * Resolve the persisted theme id to a flavor that can actually be painted.
 * A stored flavor round-trips verbatim, `__system` resolves to the OS theme,
 * and an unknown id falls back to the default WITHOUT touching storage, so
 * a corrupt value can never destroy a valid stored choice.
 */
export function resolveBootThemeId(
  storedThemeID: string,
  osTheme: string,
): string {
  if (storedThemeID === SYSTEM_THEME_ID) return osTheme;

  if (themes[storedThemeID] !== undefined) return storedThemeID;

  return DEFAULT_THEME._id;
}

/**
 * Given a theme ID, return the corresponding theme variables
 */
export function getTheme(themeID: string): Theme {
  const theme = themes[themeID];

  if (theme === undefined) {
    logAndNotifyError(`Unknown theme "${themeID}", defaulting to "light"`);
    return DEFAULT_THEME;
  }

  return theme;
}
