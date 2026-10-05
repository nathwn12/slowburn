import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

test('Double click on a track should play it and display its metadata', async () => {
  // By default, the player is paused
  await expect
    .element(page.getByRole('button', { name: 'Play' }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Pause' }))
    .not.toBeInTheDocument();

  await setupScannedLibrary();

  // Double-clicking on a track should start the player
  await getTrackByName(/Whiskey Blues/).dblClick();

  await expect
    .element(page.getByRole('button', { name: 'Play' }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Pause' }))
    .toBeInTheDocument();

  // Check the track info is on the now-playing surface (the header no longer
  // duplicates it).
  const nowPlaying = page.getByRole('region', { name: 'Now playing' });
  await expect.element(nowPlaying.getByText('Whiskey Blues')).toBeVisible();
  await expect.element(nowPlaying).toHaveTextContent('Captain_Sleepy');
  await expect.element(nowPlaying).toHaveTextContent('Another Album');

  // Click on another one
  await getTrackByName(/Romantic Blues/).dblClick();
  await expect
    .element(page.getByRole('button', { name: 'Play' }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Pause' }))
    .toBeInTheDocument();

  // Check the new track info is there
  await expect.element(nowPlaying.getByText('Romantic Blues')).toBeVisible();
  await expect.element(nowPlaying).toHaveTextContent('Jean-Paul-V');
  await expect.element(nowPlaying).toHaveTextContent('Pixabay');

  // Pause
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect
    .element(page.getByRole('button', { name: 'Play' }))
    .toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Pause' }))
    .not.toBeInTheDocument();
});
