import os from 'node:os';

import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';

import { VITE_PLUGINS } from './vite.config';
import './vitest.global-setup';

// Vitest's default exclude matches the literal `node_modules` segment only, so a
// renamed dependency tree (`node_modules.pnpm-old`) is collected and walked on
// every run. Listing the defaults explicitly keeps them while closing that hole.
const COLLECTION_EXCLUDE = [
  '**/node_modules/**',
  '**/node_modules.*/**',
  '**/.git/**',
  '**/dist/**',
  '**/src-tauri/**',
];

export default defineConfig({
  test: {
    globalSetup: ['./vitest.global-setup.ts'],
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: COLLECTION_EXCLUDE,
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['**/*.test-e2e.ts', '**/*.test-e2e.tsx'],
          exclude: COLLECTION_EXCLUDE,
          includeTaskLocation: true,
          browser: {
            enabled: true,
            // Headless by default so the suite never throws a Chromium window
            // over the desktop; `HEADED=1 vp test run --project e2e` opts in.
            headless: process.env.HEADED == null,
            provider: playwright({
              launchOptions: {
                // Silent verification: never emit audible sound, and allow
                // autoplay so numeric currentTime samples are possible.
                args: [
                  '--mute-audio',
                  '--autoplay-policy=no-user-gesture-required',
                ],
              },
            }),
            viewport: {
              width: 900,
              height: 500,
            },

            // https://vitest.dev/guide/browser/playwright
            // ideally, 'webkit' or 'safari', but there are potential issues with the Audio API
            instances: [{ browser: 'chromium' }],
          },
          env: {
            PLATFORM: getTauriPlatform(),
          },
        },
        plugins: VITE_PLUGINS,
        publicDir: 'src/__tests__/assets',
      },
    ],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom/client',
      'react/jsx-dev-runtime',
      '@lingui/core',
      '@lingui/react',
      'vitest-browser-react',
    ],
  },
});

function getTauriPlatform() {
  switch (os.platform()) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      throw new Error(`Unsupported platform: ${os.platform()}`);
  }
}
