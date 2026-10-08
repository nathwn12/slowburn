/**
 * Narrow breadcrumb: icons instead of truncated words.
 *
 * The owner's mini header read "Li... ' All t..." - word labels collapsing
 * inside a tight row. At narrow widths each breadcrumb segment must render
 * its section icon instead of its word, while the label survives as the
 * accessible name (`aria-label`) and tooltip (`title`). The full layout
 * keeps its words and hides the icons.
 *
 * Black-box surface only (roles, titles, rects); never imports components.
 * The 420px viewport reproduces the mini footprint (`MINI_WINDOW_SIZE`).
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import {
  beforeEachSetup,
  getMainNavigation,
  setupScannedLibrary,
} from './e2e-helpers';

beforeEachSetup();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Two frames plus a beat: lets React and the media query settle. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await sleep(60);
}

function wordOf(crumb: Element): Element {
  const word = crumb.querySelector('span:not([aria-hidden="true"])');
  if (word == null) throw new Error('breadcrumb segment has no word span');
  return word;
}

function iconOf(crumb: Element): Element {
  const svg = crumb.querySelector('svg');
  if (svg == null) throw new Error('breadcrumb segment has no icon');
  return svg;
}

function widthOf(el: Element): number {
  return el.getBoundingClientRect().width;
}

test('full layout keeps word labels and hides crumb icons', async () => {
  await page.viewport(900, 500);
  await setupScannedLibrary();
  await settle();
  const nav = getMainNavigation();
  const navEl = nav.element();

  // Boot route is the library root, so the Library crumb points at the page
  // already shown: it renders as non-interactive text - never a link or
  // button - with its label intact, and it is not focusable.
  expect(navEl.querySelector('a[aria-label="Library"]')).toBeNull();
  expect(navEl.querySelector('button[aria-label="Library"]')).toBeNull();
  const home = navEl.querySelector('b[title="Library"]');
  if (home == null) throw new Error('breadcrumb has no Library crumb');
  expect(home.tagName).toBe('B');
  expect(home.textContent).toContain('Library');
  expect((home as HTMLElement).tabIndex).toBe(-1);
  // The word reads in full; the icon takes no space.
  expect(widthOf(wordOf(home))).toBeGreaterThan(20);
  expect(widthOf(iconOf(home))).toBe(0);

  // Off the library root the Library crumb IS a genuine link: it keeps its
  // accessible name, and activating it navigates back to the library root.
  await nav.getByRole('link', { name: 'Settings' }).click();
  await settle();
  expect(window.location.hash).toContain('#/settings');
  const link = nav.getByRole('link', { name: 'Library' });
  await expect.element(link).toBeVisible();
  expect(link.element().getAttribute('aria-label')).toBe('Library');
  await link.click();
  await settle();
  expect(window.location.hash).toContain('#/library');
});

test('narrow layout shows icon-only segments with the section names intact', async () => {
  await page.viewport(420, 660);
  await setupScannedLibrary();
  await settle();
  const nav = getMainNavigation();

  // Library: on the library root it points at the page already shown, so
  // it renders as non-interactive text - never a link or button - with the
  // section name intact as tooltip and text, the icon painting, no readable
  // word remaining, and no tab stop.
  const navEl = nav.element();
  expect(navEl.querySelector('a[aria-label="Library"]')).toBeNull();
  expect(navEl.querySelector('button[aria-label="Library"]')).toBeNull();
  const home = navEl.querySelector('b[title="Library"]');
  if (home == null) throw new Error('breadcrumb has no Library crumb');
  expect(home.tagName).toBe('B');
  expect(home.textContent).toContain('Library');
  expect((home as HTMLElement).tabIndex).toBe(-1);
  expect(home.getAttribute('title')).toBe('Library');
  expect(widthOf(iconOf(home))).toBeGreaterThanOrEqual(10);
  expect(widthOf(wordOf(home))).toBeLessThanOrEqual(2);

  // All tracks: the current crumb - tooltip intact, icon paints, and no
  // readable (or truncated) word remains. (Two `b[aria-current]` crumbs
  // share the row on the library root, so scope to the All tracks one.)
  const currents = Array.from(
    nav.element().querySelectorAll('b[aria-current="page"]'),
  );
  const current = currents.find(
    (el) => el.getAttribute('title') === 'All tracks',
  );
  if (current == null) throw new Error('breadcrumb has no current crumb');
  expect(current.getAttribute('title')).toBe('All tracks');
  expect(widthOf(iconOf(current))).toBeGreaterThanOrEqual(10);
  expect(widthOf(wordOf(current))).toBeLessThanOrEqual(2);

  // Off the library root the Library crumb IS a genuine link: it keeps its
  // accessible name and tooltip, the icon paints with no readable word, and
  // activating it navigates back to the library root.
  await nav.getByRole('button', { name: 'Switch view' }).click();
  await page.getByRole('menuitem', { name: 'Artists' }).click();
  await settle();
  expect(window.location.hash).toContain('#/artists');
  const link = nav.getByRole('link', { name: 'Library' });
  await expect.element(link).toBeVisible();
  const linkEl = link.element();
  expect(linkEl.getAttribute('aria-label')).toBe('Library');
  expect(linkEl.getAttribute('title')).toBe('Library');
  expect(widthOf(iconOf(linkEl))).toBeGreaterThanOrEqual(10);
  expect(widthOf(wordOf(linkEl))).toBeLessThanOrEqual(2);
  await link.click();
  await settle();
  expect(window.location.hash).toContain('#/library');

  // Restore the default viewport for whatever runs after this file.
  await page.viewport(900, 500);
});
