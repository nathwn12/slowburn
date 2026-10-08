import { defineConfig } from '@lingui/cli';

import { DEFAULT_LANGUAGE } from './src/translations/languages';

/**
 * Lingui Config - https://lingui.dev/ref/conf
 */
export default defineConfig({
  sourceLocale: DEFAULT_LANGUAGE.code,
  fallbackLocales: {
    default: DEFAULT_LANGUAGE.code,
  },
  locales: [DEFAULT_LANGUAGE.code],
  catalogs: [
    {
      name: 'main',
      path: '<rootDir>/src/translations/{locale}',
      include: ['src'],
      exclude: ['src/**/__screenshots__/**'],
    },
  ],
  orderBy: 'origin',
});
