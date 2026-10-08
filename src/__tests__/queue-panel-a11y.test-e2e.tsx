/**
 * Queue panel tab strip + virtualized list position metadata (a11y repair).
 *
 * Black-box only: role/name selectors against the live shell, no component
 * imports. The Queue|Library tab strip must keep exactly one tab in the
 * normal tab order (roving tabindex), move selection with Left/Right/Home/End
 * (WAI-APG automatic activation), and wire every tab to the tabpanel; every
 * virtualized track row must expose aria-posinset/aria-setsize.
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getTrackByName,
  getTrackList,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

function tablist() {
  return page.getByRole('tablist', { name: 'Panel source' });
}

function pressKey(element: Element, key: string): void {
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
  );
}

function tabElements() {
  return tablist().getByRole('tab').elements();
}

test('panel tabs keep exactly one tabbable tab with tabpanel wiring', async () => {
  window.location.hash = '#/queue';
  await expect.element(tablist()).toBeVisible();

  const tabs = tablist().getByRole('tab');
  // No playlist origin on fresh load: exactly Queue + Library.
  await expect.element(tabs.nth(0)).toBeVisible();
  await expect.element(tabs.nth(1)).toBeVisible();
  await expect.element(tabs.nth(2)).not.toBeInTheDocument();

  // Roving tabindex: exactly one tab in the normal tab order.
  const tabbables = tabElements().filter(
    (element) => element.getAttribute('tabindex') === '0',
  );
  expect(tabbables).toHaveLength(1);

  // Every tab points at the single tabpanel.
  for (const element of tabElements()) {
    expect(element.getAttribute('aria-controls')).toBe('queue-tabpanel');
  }
  const panel = page.getByRole('tabpanel');
  await expect.element(panel).toBeVisible();
  const selected = tabElements().find(
    (element) => element.getAttribute('aria-selected') === 'true',
  );
  expect(selected?.getAttribute('id')).toBe(
    panel.element().getAttribute('aria-labelledby'),
  );
});

test('ArrowRight moves tab selection and focus with the roving tabindex', async () => {
  window.location.hash = '#/queue';
  await expect.element(tablist()).toBeVisible();

  // Empty queue: Library starts selected and is the only tabbable tab.
  const queueTab = tablist().getByRole('tab', { name: 'Queue' });
  const libraryTab = tablist().getByRole('tab', { name: 'Library' });
  await expect.element(libraryTab).toHaveAttribute('aria-selected', 'true');
  await expect.element(libraryTab).toHaveAttribute('tabindex', '0');
  await expect.element(queueTab).toHaveAttribute('tabindex', '-1');

  // ArrowRight on Library wraps to Queue: selection, tabindex, and focus move.
  libraryTab.element().focus();
  pressKey(libraryTab.element(), 'ArrowRight');
  await expect.element(queueTab).toHaveAttribute('aria-selected', 'true');
  await expect.element(queueTab).toHaveAttribute('tabindex', '0');
  await expect.element(libraryTab).toHaveAttribute('tabindex', '-1');
  expect(document.activeElement).toBe(queueTab.element());
  await expect
    .element(page.getByRole('tabpanel'))
    .toHaveAttribute('aria-labelledby', 'queue-tab-queue');

  // ArrowLeft returns to Library.
  pressKey(queueTab.element(), 'ArrowLeft');
  await expect.element(libraryTab).toHaveAttribute('aria-selected', 'true');
  expect(document.activeElement).toBe(libraryTab.element());

  // Home/End jump to the ends.
  pressKey(libraryTab.element(), 'Home');
  await expect.element(queueTab).toHaveAttribute('aria-selected', 'true');
  pressKey(queueTab.element(), 'End');
  await expect.element(libraryTab).toHaveAttribute('aria-selected', 'true');

  // Still exactly one tabbable tab after all the moves.
  expect(
    tabElements().filter((element) => element.getAttribute('tabindex') === '0'),
  ).toHaveLength(1);
});

test('panel header tools are visible labelled buttons, not hover-only glyphs', async () => {
  window.location.hash = '#/queue';
  const shuffle = page.getByRole('button', { name: 'Shuffle queue' });
  const clear = page.getByRole('button', { name: 'Clear queue' });

  // Both controls render as visible buttons at rest with an accessible name
  // that needs no hover (aria-label) plus the pointer tooltip (title).
  await expect.element(shuffle).toBeVisible();
  await expect.element(clear).toBeVisible();
  await expect.element(shuffle).toHaveAttribute('aria-pressed', 'false');
  expect(shuffle.element().getAttribute('title')).toBe('Shuffle queue');
  expect(clear.element().getAttribute('title')).toBe('Clear queue');
});

test('queue sort state is a clickable control naming the active order', async () => {
  // Seed a queue through the same path as the queue-explicit suite: scan,
  // then double-click a library row to start playback.
  await setupScannedLibrary();
  await getTrackByName(/Whiskey Blues/).dblClick();

  window.location.hash = '#/queue';
  const trigger = page.getByRole('button', { name: 'Sort: Manual' });
  await expect.element(trigger).toBeVisible();

  // The old static readout is gone: no `sorted: ...` text anywhere.
  await expect
    .element(page.getByText('sorted: manual'))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByText('sorted: most played'))
    .not.toBeInTheDocument();

  // The control is clickable: it opens the two queue orders and the choice
  // is announced through the trigger's accessible name.
  await trigger.click();
  const menu = page.getByRole('menu', { name: 'Queue sort options' });
  await expect.element(menu).toBeVisible();
  await expect
    .element(menu.getByRole('menuitemradio', { name: 'Manual' }))
    .toHaveAttribute('aria-checked', 'true');
  await menu.getByRole('menuitemradio', { name: 'Most played' }).click();
  await expect.element(menu).not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Sort: Most played' }))
    .toBeVisible();
});

test('virtualized track rows expose position metadata', async () => {
  await setupScannedLibrary();

  const first = getTrackList().getByRole('option').nth(0);
  await expect.element(first).toBeVisible();
  await expect.element(first).toHaveAttribute('aria-posinset', '1');

  const setSize = first.element().getAttribute('aria-setsize');
  expect(Number(setSize)).toBeGreaterThan(1);

  // Every rendered row agrees on the set size and carries a sane position.
  const rows = getTrackList().getByRole('option').elements();
  expect(rows.length).toBeGreaterThan(1);
  for (const row of rows) {
    expect(row.getAttribute('aria-setsize')).toBe(setSize);
    const position = Number(row.getAttribute('aria-posinset'));
    expect(position).toBeGreaterThanOrEqual(1);
    expect(position).toBeLessThanOrEqual(Number(setSize));
  }
});
