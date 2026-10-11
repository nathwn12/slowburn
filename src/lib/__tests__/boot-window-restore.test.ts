import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import {
  __getSavedFullOuterSizeForTests,
  __resetMiniWindowStateForTests,
  enterMiniWindow,
  exitMiniWindow,
  shouldRunFullRestore,
} from '../mini-window';

type MockSize = { width: number; height: number };
type MockCall = { name: string; size?: MockSize };

function createMockWindow(outerSize: MockSize = { width: 1400, height: 900 }) {
  const calls: MockCall[] = [];
  const state = { setMinSizeFailures: 0 };
  return {
    calls,
    state,
    outerSize: async (): Promise<MockSize> => {
      calls.push({ name: 'outerSize' });
      return { ...outerSize };
    },
    setMinSize: async (size: MockSize): Promise<void> => {
      calls.push({
        name: 'setMinSize',
        size: { width: size.width, height: size.height },
      });
      if (state.setMinSizeFailures > 0) {
        state.setMinSizeFailures -= 1;
        throw new Error('setMinSize refused');
      }
    },
    setResizable: async (): Promise<void> => {
      calls.push({ name: 'setResizable' });
    },
    setSize: async (size: MockSize): Promise<void> => {
      calls.push({
        name: 'setSize',
        size: { width: size.width, height: size.height },
      });
    },
  };
}

type MockWindow = ReturnType<typeof createMockWindow>;

const tauriWindowHarness = vi.hoisted((): { win: MockWindow | null } => ({
  win: null,
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: (): MockWindow => {
    const win = tauriWindowHarness.win;
    if (win == null) {
      throw new Error('no mocked window');
    }
    return win;
  },
  LogicalSize: class {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },
  PhysicalSize: class {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  },
}));

function callNames(win: MockWindow): Array<string> {
  return win.calls.map((call) => call.name);
}

describe('shouldRunFullRestore (boot guard for the __root effect)', () => {
  test('a boot mount that was never mini does not restore', () => {
    // Full and minimal boots alike: the native side already restored the
    // saved size (or its boot fallback), so the frontend must not resize.
    expect(shouldRunFullRestore(false)).toBe(false);
  });

  test('a genuine leave-mini transition restores', () => {
    expect(shouldRunFullRestore(true)).toBe(true);
  });
});

describe('boot mount leaves the native window alone (mocked window)', () => {
  beforeEach(() => {
    __resetMiniWindowStateForTests();
    tauriWindowHarness.win = null;
  });

  test('boot in full with no remembered size makes no window calls', async () => {
    const win = createMockWindow({ width: 1400, height: 900 });
    tauriWindowHarness.win = win;

    // The fixed `__root.tsx` effect: skip the restore when the mount was
    // never mini, so the natively restored 1400x900 survives.
    if (shouldRunFullRestore(false)) {
      await exitMiniWindow();
    }

    expect(win.calls).toEqual([]);
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
  });

  test('leaving mini still restores the remembered full size', async () => {
    const win = createMockWindow({ width: 1400, height: 900 });
    tauriWindowHarness.win = win;
    await enterMiniWindow();
    win.calls.length = 0;

    // The fixed `__root.tsx` effect: a mount that was mini runs the restore.
    if (shouldRunFullRestore(true)) {
      await exitMiniWindow();
    }

    expect(callNames(win)).toEqual(['setMinSize', 'setResizable', 'setSize']);
    expect(win.calls.at(-1)?.size).toEqual({ width: 1400, height: 900 });
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
  });
});
