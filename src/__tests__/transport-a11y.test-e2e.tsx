/**
 * S6 gate: transport consistency plus keyboard plus screen-reader baseline.
 *
 * Black-box only: role/name selectors against the live shell, no component
 * imports. The transport (Previous / Play|Pause / Next / Stop /
 * Stop-after-current menuitem / Shuffle / Repeat / Mute strip) must expose
 * accessible names, expose pressed state on the mode toggles, stay fully
 * keyboard operable with a visible focus indicator, and exist exactly once
 * in the tree.
 */
import { expect, test } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';

import { beforeEachSetup } from './e2e-helpers';

beforeEachSetup();

test('every transport control exposes an accessible name', async () => {
  await expect
    .element(page.getByRole('button', { name: 'Previous' }))
    .toBeVisible();
  // Paused by default, so the play/pause toggle reads "Play" on fresh load.
  await expect
    .element(page.getByRole('button', { name: 'Play' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Next' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Stop' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitem', { name: /Stop after current/i }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Shuffle' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Repeat' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: /Mute|Unmute/ }))
    .toBeVisible();
});

test('shuffle and repeat expose pressed state and toggle it', async () => {
  const shuffle = page.getByRole('button', { name: 'Shuffle' });
  const repeat = page.getByRole('button', { name: 'Repeat' });

  // Both toggles must carry an explicit pressed state for screen readers.
  await expect.element(shuffle).toHaveAttribute('aria-pressed');
  await expect.element(repeat).toHaveAttribute('aria-pressed');

  // Shuffle is a plain boolean toggle: one click flips, two restore.
  const shuffleBefore = shuffle.element().getAttribute('aria-pressed');
  await shuffle.click();
  await expect
    .element(shuffle)
    .toHaveAttribute(
      'aria-pressed',
      shuffleBefore === 'true' ? 'false' : 'true',
    );
  await shuffle.click();
  await expect
    .element(shuffle)
    .toHaveAttribute('aria-pressed', shuffleBefore ?? '');

  // Repeat cycles None -> All -> One -> None, so from the fresh disengaged
  // state the first click engages (pressed true) and two further clicks
  // complete the cycle back to disengaged.
  await expect.element(repeat).toHaveAttribute('aria-pressed', 'false');
  await repeat.click();
  await expect.element(repeat).toHaveAttribute('aria-pressed', 'true');
  await repeat.click();
  await repeat.click();
  await expect.element(repeat).toHaveAttribute('aria-pressed', 'false');
});

test('transport is keyboard-focusable in order with a visible indicator', async () => {
  await expect
    .element(page.getByRole('button', { name: 'Previous' }))
    .toBeVisible();
  page.getByRole('button', { name: 'Previous' }).element().focus();

  // Tab order through the transport: Play|Pause, Next, Stop,
  // Stop-after-current menuitem, Shuffle, Repeat, then the Mute/Unmute strip.
  const names: Array<string | null> = [];
  for (let i = 0; i < 7; i += 1) {
    await userEvent.tab();
    const active = document.activeElement as HTMLElement | null;
    names.push(active?.getAttribute('aria-label') ?? null);

    // A keyboard-focused control must match :focus-visible ...
    expect(active?.matches(':focus-visible')).toBe(true);
    // ... and actually paint a focus indicator (never outline: none).
    const style = getComputedStyle(active as Element);
    expect(style.outlineStyle).not.toBe('none');
    expect(style.outlineWidth).not.toBe('0px');
  }

  expect(names[0]).toMatch(/^(Play|Pause)$/);
  expect(names[1]).toBe('Next');
  expect(names[2]).toBe('Stop');
  expect(names[3]).toMatch(/Stop after current/i);
  expect(names.slice(4, 6)).toEqual(['Shuffle', 'Repeat']);
  expect(names[6]).toMatch(/^(Mute|Unmute)$/);
});

test('a shuffle toggle activates from the keyboard', async () => {
  const shuffle = page.getByRole('button', { name: 'Shuffle' });
  const before = shuffle.element().getAttribute('aria-pressed');
  shuffle.element().focus();
  await userEvent.keyboard('{Enter}');
  await expect
    .element(shuffle)
    .toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
});

test('a stop-after-current menuitem activates from the keyboard', async () => {
  const item = page.getByRole('menuitem', { name: /Stop after current/i });
  await expect.element(item).toBeVisible();
  const before = item.element().getAttribute('data-on');
  item.element().focus();
  await userEvent.keyboard('{Enter}');
  await expect
    .element(item)
    .toHaveAttribute('data-on', before === 'true' ? 'false' : 'true');
  // Restore the fresh disarmed state for later tests in this file.
  item.element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(item).toHaveAttribute('data-on', before ?? '');
});

test('exactly one transport instance is mounted', async () => {
  // One of each control, never a duplicated header + column pair.
  for (const name of [
    'Previous',
    'Next',
    'Stop',
    'Shuffle',
    'Repeat',
  ] as const) {
    const control = page.getByRole('button', { name });
    await expect.element(control.nth(0)).toBeVisible();
    await expect.element(control.nth(1)).not.toBeInTheDocument();
  }

  // The play/pause toggle is a single button that swaps its name, so on
  // fresh load (paused) exactly one "Play" is present and no "Pause".
  await expect
    .element(page.getByRole('button', { name: 'Play' }))
    .toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Pause' }))
    .not.toBeInTheDocument();

  // The mute strip is a single role=button too.
  const mute = page.getByRole('button', { name: /Mute|Unmute/ });
  await expect.element(mute.nth(0)).toBeVisible();
  await expect.element(mute.nth(1)).not.toBeInTheDocument();

  // The stop-after-current action is a single named menuitem.
  const stopAfter = page.getByRole('menuitem', {
    name: /Stop after current/i,
  });
  await expect.element(stopAfter.nth(0)).toBeVisible();
  await expect.element(stopAfter.nth(1)).not.toBeInTheDocument();
});
