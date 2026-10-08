/**
 * Scan-failure toast intent: the automatic startup scan stays silent while a
 * user-initiated scan still warns, and the failure count stays visible in
 * Settings -> Library either way.
 *
 * Black-box: toasts via their rendered text, settings via the status line.
 * `LibraryAPI` is imported lazily so the e2e bridge mocks are in place first.
 */
import { afterEach, expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import { beforeEachSetup, getMainNavigation } from './e2e-helpers';

beforeEachSetup();

afterEach(async () => {
  delete (globalThis as { __MUSEEKS_MOCK_SCAN_FAILURES?: unknown })
    .__MUSEEKS_MOCK_SCAN_FAILURES;
  const { default: useLibraryStore } = await import('../lib/store');
  useLibraryStore.setState({ lastScanFailures: 0 });
});

async function gotoLibrarySettings(): Promise<void> {
  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await expect
    .element(page.getByRole('button', { name: 'Add folder' }))
    .toBeVisible();
}

test('an automatic scan does NOT raise the warning toast', async () => {
  (
    globalThis as { __MUSEEKS_MOCK_SCAN_FAILURES?: number }
  ).__MUSEEKS_MOCK_SCAN_FAILURES = 1;

  // The startup/autorefresh path: silent scan, same as SettingsAPI issues.
  const { default: LibraryAPI } = await import('../api/LibraryAPI');
  await LibraryAPI.scan(false, true);

  // No warning toast for the one unreadable file ...
  await expect
    .element(page.getByText(/could not be read and were skipped/))
    .not.toBeInTheDocument();

  // ... but the count is still recorded where the owner looks.
  await gotoLibrarySettings();
  await expect
    .element(page.getByText(/1 file\(s\) could not be read/))
    .toBeVisible();
});

test('a user-initiated scan DOES raise the warning toast', async () => {
  (
    globalThis as { __MUSEEKS_MOCK_SCAN_FAILURES?: number }
  ).__MUSEEKS_MOCK_SCAN_FAILURES = 1;

  await gotoLibrarySettings();
  await page.getByRole('button', { name: 'Rescan all' }).click();

  // The owner asked, so they get the feedback ...
  await expect
    .element(page.getByText(/could not be read and were skipped/))
    .toBeVisible();

  // ... and the count is rendered in the settings status area too.
  await expect
    .element(page.getByText(/1 file\(s\) could not be read/))
    .toBeVisible();
});
