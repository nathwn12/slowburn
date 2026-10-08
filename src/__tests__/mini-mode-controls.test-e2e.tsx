/**
 * Mini-mode left-region controls: no dead buttons, aligned boxes, live switcher.
 *
 * Owner report: in mini mode the left region rendered three button-looking
 * controls, only one of which did anything (the view switcher), and they
 * looked misaligned. At the mini footprint (420px) the breadcrumb collapses
 * to icon-only segments, so the row reads as three icon buttons: the Library
 * link, the current-location label, and the Switch view button.
 *
 * Black-box surface only (roles, names, rects, navigation); never imports
 * components. The 420px viewport reproduces the mini footprint
 * (`MINI_WINDOW_SIZE`).
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import type { Config } from '../generated/typings';
import { beforeEachSetup, getMainNavigation } from './e2e-helpers';

beforeEachSetup();

async function appBridge(): Promise<{ config: Config }> {
  const mod = (await import('../lib/bridge-config')) as unknown as {
    default: { config: Config };
  };
  return mod.default;
}

async function invalidateConfig(): Promise<void> {
  const { default: queryClient } = await import('../lib/query-client');
  const { configQuery } = await import('../lib/queries');
  await queryClient.invalidateQueries({ queryKey: configQuery.queryKey });
}

async function setMode(mode: string): Promise<void> {
  const bridge = await appBridge();
  bridge.config = {
    ...bridge.config,
    ui_mode: mode as unknown as Config['ui_mode'],
  };
  await invalidateConfig();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Two frames plus a beat: lets React and the media query settle. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  await sleep(120);
}

async function enterMiniNarrow(): Promise<void> {
  await page.viewport(420, 660);
  await setMode('mini');
  await settle();
  await expect.element(getMainNavigation()).toBeVisible();
}

/**
 * The left region: the breadcrumb cluster (crumbs + view switcher), i.e. the
 * switcher button's grandparent. Everything left of the search box.
 */
function leftRegion(): HTMLElement {
  const switcher = getMainNavigation().getByRole('button', {
    name: 'Switch view',
  });
  const region = switcher.element().parentElement?.parentElement;
  if (region == null) throw new Error('left region not found');
  return region as HTMLElement;
}

function rectOf(el: Element): { height: number; centerY: number } {
  const rect = el.getBoundingClientRect();
  return { height: rect.height, centerY: rect.y + rect.height / 2 };
}

test('mini left region has no interactive element without an action', async () => {
  await enterMiniNarrow();
  const region = leftRegion();
  const nav = getMainNavigation();

  // Boot route is the library root, so the Library crumb points at the page
  // already shown: it must render as non-interactive text - never a link or
  // button - with its label intact, and it must not be focusable.
  expect(region.querySelector('a[aria-label="Library"]')).toBeNull();
  expect(region.querySelector('button[aria-label="Library"]')).toBeNull();
  const libraryHome = region.querySelector('b[title="Library"]');
  if (libraryHome == null)
    throw new Error('breadcrumb has no Library crumb on the library route');
  expect(libraryHome.tagName).toBe('B');
  expect(libraryHome.textContent).toContain('Library');
  expect((libraryHome as HTMLElement).tabIndex).toBe(-1);
  expect(getComputedStyle(libraryHome).cursor).toBe('default');

  // The only button in the left region is the view switcher: anything else
  // presenting as a button here is the bug.
  const buttons = Array.from(region.querySelectorAll('button')).map(
    (el) => el.getAttribute('aria-label') ?? (el.textContent ?? '').trim(),
  );
  expect(buttons).toEqual(['Switch view']);
  expect(region.querySelector('[role="button"]')).toBeNull();

  // The switcher button acts: it opens the Views menu.
  await nav.getByRole('button', { name: 'Switch view' }).click();
  const menu = page.getByRole('menu', { name: 'Views' });
  await expect.element(menu).toBeVisible();

  // Each menu item navigates somewhere real; pick Artists so the Library
  // crumb below has somewhere to navigate back from.
  await page.getByRole('menuitem', { name: 'Artists' }).click();
  await settle();
  expect(window.location.hash).toContain('#/artists');

  // Off the library root the Library crumb IS a genuine link: it keeps its
  // accessible name and the pointer cursor of a real control, and activating
  // it navigates back to the library root, an observable change.
  const library = nav.getByRole('link', { name: 'Library' });
  await expect.element(library).toBeVisible();
  expect(library.element().getAttribute('aria-label')).toBe('Library');
  expect(getComputedStyle(library.element() as HTMLElement).cursor).toBe(
    'pointer',
  );
  await library.click();
  await settle();
  expect(window.location.hash).toContain('#/library');
  // The mini queue surface survives the round trip.
  await expect
    .element(page.getByRole('heading', { name: 'QUEUE' }))
    .toBeVisible();

  // The current-location segment is a label, not a control: non-interactive
  // markup (`b`, never `button`/`a`/`[role=button]`), unreachable by Tab,
  // and without the pointer cursor that promises a click.
  const currents = Array.from(
    region.querySelectorAll('b[aria-current="page"]'),
  );
  const current = currents.find(
    (el) => el.getAttribute('title') === 'All tracks',
  );
  if (current == null) throw new Error('breadcrumb has no current crumb');
  expect(current.tagName).toBe('B');
  expect(current.getAttribute('role')).toBeNull();
  expect((current as HTMLElement).tabIndex).toBe(-1);
  expect(getComputedStyle(current).cursor).toBe('default');
  expect(current.getAttribute('title')).toBe('All tracks');

  await page.viewport(900, 500);
});

test('mini left-region controls share one height and one vertical centre', async () => {
  await enterMiniNarrow();
  const nav = getMainNavigation();

  // Measure from a non-library route, where the row holds both markup kinds:
  // the Library link beside the current-location label and the switcher.
  // (On the library root the Library crumb is non-interactive text, so the
  // link query below would find nothing there.)
  await nav.getByRole('button', { name: 'Switch view' }).click();
  await page.getByRole('menuitem', { name: 'Artists' }).click();
  await settle();
  expect(window.location.hash).toContain('#/artists');

  const region = leftRegion();

  const link = region.querySelector('a[aria-label="Library"]');
  const current = region.querySelector('b[aria-current="page"]');
  const switcher = region.querySelector('button[aria-label="Switch view"]');
  if (link == null || current == null || switcher == null) {
    throw new Error('left region is missing a control');
  }

  const boxes = [link, current, switcher].map(rectOf);
  for (const box of boxes) {
    // The header's 28px one-control-height system (see ux-chrome).
    expect(box.height).toBeGreaterThanOrEqual(27);
    expect(box.height).toBeLessThanOrEqual(29);
  }
  const centres = boxes.map((box) => box.centerY);
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThanOrEqual(2);

  await page.viewport(900, 500);
});

test('the mini view switcher still cycles queue, all tracks, artists, playlists', async () => {
  await enterMiniNarrow();
  const nav = getMainNavigation();

  const picks = [
    { item: 'Queue', hash: '#/queue' },
    { item: 'All tracks', hash: '#/library' },
    { item: 'Artists', hash: '#/artists' },
    { item: 'Playlists', hash: '#/playlists' },
  ] as const;

  for (const pick of picks) {
    await nav.getByRole('button', { name: 'Switch view' }).click();
    await page.getByRole('menuitem', { name: pick.item }).click();
    await settle();
    expect(window.location.hash).toContain(pick.hash);
    // Mini keeps the queue surface under every switcher view.
    await expect
      .element(page.getByRole('heading', { name: 'QUEUE' }))
      .toBeVisible();
  }

  await page.viewport(900, 500);
});
