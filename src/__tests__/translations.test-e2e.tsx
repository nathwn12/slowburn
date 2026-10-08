import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import { beforeEachSetup, getMainNavigation } from './e2e-helpers';

beforeEachSetup();

// English-only: the app ships a single locale, so the UI renders the English
// strings and no screen offers a language selector. This replaces the old
// French-switching test, whose subject (a second shipped locale) no longer
// exists; the pinned contract is now "English renders, no language offered".
test('The UI renders English with no language selector', async () => {
  const viewMessage = page.getByRole('status');

  await expect.element(viewMessage).toBeVisible();
  await expect
    .element(viewMessage)
    .toHaveTextContent(
      'There is no music in your libraryyou can add your music here',
    );

  await getMainNavigation().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Interface' }).click();

  // No screen offers a language the app does not ship ...
  await expect
    .element(page.getByRole('combobox', { name: 'Language' }))
    .not.toBeInTheDocument();

  // ... while the rest of the Interface screen stays intact.
  await expect
    .element(page.getByRole('combobox', { name: 'Mode' }))
    .toBeVisible();
});
