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
