/**
 * Frameless window chrome: on Windows the app draws its own title bar (drag
 * region, mark/title, menu + minimize/maximize/close wired to the Tauri
 * window API); other platforms keep their native chrome and render no custom
 * bar. Clicks are asserted against the mocked Tauri invoke, so this never
 * touches a real window.
 */
import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser';

import { beforeEachSetup } from './e2e-helpers';

beforeEachSetup();

const PLATFORM = import.meta.env.PLATFORM as string;

const bar = () => page.getByRole('toolbar', { name: 'Window title bar' });

type TauriInternals = {
  invoke: { mock: { calls: Array<Array<unknown>> } };
};

function invokedCommands(): Array<unknown> {
  const internals = (
    window as unknown as { __TAURI_INTERNALS__: TauriInternals }
  ).__TAURI_INTERNALS__;
  return internals.invoke.mock.calls.map((call) => call[0]);
}

/** Poll the mocked invoke until every expected command landed (or timeout). */
async function waitForCommands(expected: Array<string>): Promise<void> {
  const start = performance.now();
  while (!expected.every((command) => invokedCommands().includes(command))) {
    if (performance.now() - start > 5000) {
      throw new Error(`waitForCommands timed out: ${expected.join(', ')}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test.runIf(PLATFORM === 'windows')(
  'windows draws the custom title bar with working controls',
  async () => {
    await expect.element(bar()).toBeVisible();
    await expect
      .element(bar().getByRole('button', { name: 'Application menu' }))
      .toBeVisible();
    await expect
      .element(bar().getByRole('button', { name: 'Minimize' }))
      .toBeVisible();
    await expect
      .element(bar().getByRole('button', { name: 'Maximize' }))
      .toBeVisible();
    await expect
      .element(bar().getByRole('button', { name: 'Close' }))
      .toBeVisible();

    await bar().getByRole('button', { name: 'Minimize' }).click();
    await bar().getByRole('button', { name: 'Maximize' }).click();
    await bar().getByRole('button', { name: 'Application menu' }).click();
    await bar().getByRole('button', { name: 'Close' }).click();

    // The clicks dispatch async Tauri invokes, and the last click's
    // microtasks may still be flushing when `click()` resolves - poll the
    // mock instead of asserting it synchronously.
    await waitForCommands([
      'plugin:window|minimize',
      'plugin:window|toggle_maximize',
      'plugin:app-menu|show',
      'plugin:window|close',
    ]);

    const commands = invokedCommands();
    expect(commands).toContain('plugin:window|minimize');
    expect(commands).toContain('plugin:window|toggle_maximize');
    expect(commands).toContain('plugin:app-menu|show');
    expect(commands).toContain('plugin:window|close');
  },
);

test.runIf(PLATFORM !== 'windows')(
  'other platforms keep their native chrome',
  async () => {
    expect(
      document.querySelector('[aria-label="Window title bar"]'),
    ).toBeNull();
  },
);
