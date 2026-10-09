/**
 * Global setup: release the StyleX dev-CSS poller so the runner can exit.
 *
 * `@stylexjs/unplugin` starts a 150ms `setInterval` in `configureServer`
 * (dev CSS-update poller) and only clears it on `server.httpServer 'close'`.
 * Under `vitest run` the server never emits that event, so the interval keeps
 * the main-process event loop alive forever and every run ends with
 * "close timed out after 10000ms - something prevents ... from exiting".
 *
 * This module is imported by `vitest.config.ts` (so the patch is installed
 * before any project server is created) and listed as a `globalSetup` (so
 * the teardown below runs before Vitest closes the projects). The patch
 * tracks - and unrefs, so the loop can always drain - only intervals whose
 * creation stack passes through the StyleX unplugin module. Transform
 * behaviour is untouched: the plugin still compiles every test run.
 */
type PatchState = {
  installed: boolean;
  tracked: Set<NodeJS.Timeout>;
};

function state(): PatchState {
  const g = globalThis as unknown as Record<string, PatchState | undefined>;
  let s = g.__stylexTeardown;
  if (s == null) {
    s = { installed: false, tracked: new Set() };
    g.__stylexTeardown = s;
  }
  return s;
}

function install(): void {
  const s = state();
  if (s.installed) return;
  s.installed = true;
  const realSetInterval = globalThis.setInterval.bind(globalThis);
  globalThis.setInterval = ((
    handler: (...args: unknown[]) => void,
    timeout?: number,
    ...args: unknown[]
  ): NodeJS.Timeout => {
    const id = realSetInterval(handler, timeout, ...args);
    const stack = new Error().stack ?? '';
    if (stack.includes('@stylexjs/unplugin')) {
      s.tracked.add(id);
      id.unref?.();
    }
    return id;
  }) as unknown as typeof setInterval;
}

install();

export default function setup(): () => void {
  return function teardown(): void {
    const s = state();
    for (const id of s.tracked) clearInterval(id);
    s.tracked.clear();
  };
}
