import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vite-plus/test';

import {
  __getSavedFullOuterSizeForTests,
  __resetMiniWindowStateForTests,
  enterMiniWindow,
  exitMiniWindow,
  FULL_WINDOW_MIN_SIZE,
  FULL_WINDOW_SIZE,
  MINI_WINDOW_MIN_SIZE,
  MINI_WINDOW_SIZE,
  windowGeometryForMode,
} from '../mini-window';

type MockSize = { width: number; height: number };
type MockCall = { name: string; size?: MockSize };

function createMockWindow(outerSize: MockSize = { width: 1280, height: 800 }) {
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

function sizesFor(win: MockWindow, name: string): Array<MockSize> {
  return win.calls
    .filter((call) => call.name === name)
    .map((call) => call.size as MockSize);
}

describe('windowGeometryForMode', () => {
  test('mini maps to the compact footprint with the small floor', () => {
    expect(windowGeometryForMode('mini')).toEqual({
      size: { width: 420, height: 660 },
      minSize: { width: 320, height: 420 },
    });
  });

  test('full maps to the default footprint with the full floor', () => {
    expect(windowGeometryForMode('full')).toEqual({
      size: { width: 960, height: 600 },
      minSize: { width: 900, height: 600 },
    });
  });

  test('minimal keeps full geometry (density, not a footprint)', () => {
    expect(windowGeometryForMode('minimal')).toEqual(
      windowGeometryForMode('full'),
    );
  });

  test('floors fit inside their footprints, and mini is smaller than full', () => {
    expect(MINI_WINDOW_MIN_SIZE.width).toBeLessThanOrEqual(
      MINI_WINDOW_SIZE.width,
    );
    expect(MINI_WINDOW_MIN_SIZE.height).toBeLessThanOrEqual(
      MINI_WINDOW_SIZE.height,
    );
    expect(FULL_WINDOW_MIN_SIZE.width).toBeLessThanOrEqual(
      FULL_WINDOW_SIZE.width,
    );
    expect(FULL_WINDOW_MIN_SIZE.height).toBeLessThanOrEqual(
      FULL_WINDOW_SIZE.height,
    );
    expect(MINI_WINDOW_SIZE.width).toBeLessThan(FULL_WINDOW_SIZE.width);
    // The mini floor must clear the 900px full floor that blocks the shrink.
    expect(MINI_WINDOW_MIN_SIZE.width).toBeLessThan(FULL_WINDOW_MIN_SIZE.width);
  });

  test('no restore is pending on a fresh boot', () => {
    __resetMiniWindowStateForTests();
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
  });
});

describe('ordered floor transitions (mocked window)', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetMiniWindowStateForTests();
    tauriWindowHarness.win = null;
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test('enter applies the mini floor before resizing', async () => {
    const win = createMockWindow({ width: 1280, height: 800 });
    tauriWindowHarness.win = win;

    await enterMiniWindow();

    expect(callNames(win)).toEqual([
      'outerSize',
      'setMinSize',
      'setResizable',
      'setSize',
    ]);
    // The floor is exactly the mini target: never lower, never the full one.
    expect(sizesFor(win, 'setMinSize')).toEqual([{ width: 320, height: 420 }]);
    expect(sizesFor(win, 'setSize')).toEqual([{ width: 420, height: 660 }]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('exit raises the full floor before restoring the saved size', async () => {
    const win = createMockWindow({ width: 1280, height: 800 });
    tauriWindowHarness.win = win;
    await enterMiniWindow();
    win.calls.length = 0;

    await exitMiniWindow();

    expect(callNames(win)).toEqual(['setMinSize', 'setResizable', 'setSize']);
    expect(sizesFor(win, 'setMinSize')).toEqual([{ width: 900, height: 600 }]);
    expect(sizesFor(win, 'setSize')).toEqual([{ width: 1280, height: 800 }]);
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('a refused floor write is retried once, then the resize runs', async () => {
    const win = createMockWindow();
    win.state.setMinSizeFailures = 1;
    tauriWindowHarness.win = win;

    await enterMiniWindow();

    const floors = sizesFor(win, 'setMinSize');
    expect(floors).toEqual([
      { width: 320, height: 420 },
      { width: 320, height: 420 },
    ]);
    expect(callNames(win).at(-1)).toBe('setSize');
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('a twice-refused floor write aborts loudly without resizing', async () => {
    const win = createMockWindow({ width: 1280, height: 800 });
    win.state.setMinSizeFailures = 2;
    tauriWindowHarness.win = win;

    await enterMiniWindow();

    expect(callNames(win)).toEqual(['outerSize', 'setMinSize', 'setMinSize']);
    expect(consoleError).toHaveBeenCalledTimes(1);
    // The saved size is kept, so a retried entry can still restore it.
    expect(__getSavedFullOuterSizeForTests()).toEqual({
      width: 1280,
      height: 800,
    });
  });

  test('a failed exit keeps the restore pending until a retry lands it', async () => {
    const win = createMockWindow({ width: 1280, height: 800 });
    tauriWindowHarness.win = win;
    await enterMiniWindow();
    win.calls.length = 0;

    win.state.setMinSizeFailures = 2;
    await exitMiniWindow();

    expect(callNames(win)).toEqual(['setMinSize', 'setMinSize']);
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(__getSavedFullOuterSizeForTests()).toEqual({
      width: 1280,
      height: 800,
    });

    win.calls.length = 0;
    await exitMiniWindow();

    expect(callNames(win)).toEqual(['setMinSize', 'setResizable', 'setSize']);
    expect(sizesFor(win, 'setMinSize')).toEqual([{ width: 900, height: 600 }]);
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
  });

  test('entering twice keeps the original full size', async () => {
    const win = createMockWindow({ width: 1280, height: 800 });
    tauriWindowHarness.win = win;

    await enterMiniWindow();
    await enterMiniWindow();

    expect(__getSavedFullOuterSizeForTests()).toEqual({
      width: 1280,
      height: 800,
    });
    expect(callNames(win).filter((name) => name === 'outerSize')).toHaveLength(
      1,
    );
  });

  test('exit with nothing saved lands at the full default footprint', async () => {
    const win = createMockWindow({ width: 420, height: 660 });
    tauriWindowHarness.win = win;
    __resetMiniWindowStateForTests();

    await exitMiniWindow();

    expect(callNames(win)).toEqual(['setMinSize', 'setResizable', 'setSize']);
    expect(sizesFor(win, 'setMinSize')).toEqual([{ width: 900, height: 600 }]);
    expect(sizesFor(win, 'setSize')).toEqual([{ width: 960, height: 600 }]);
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('exit with the boot-into-mini size lands at the full default footprint', async () => {
    const win = createMockWindow({ width: 420, height: 660 });
    tauriWindowHarness.win = win;
    await enterMiniWindow();
    win.calls.length = 0;

    await exitMiniWindow();

    expect(callNames(win)).toEqual(['setMinSize', 'setResizable', 'setSize']);
    expect(sizesFor(win, 'setMinSize')).toEqual([{ width: 900, height: 600 }]);
    expect(sizesFor(win, 'setSize')).toEqual([{ width: 960, height: 600 }]);
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('exit ignores a saved size below the full floor', async () => {
    const win = createMockWindow({ width: 400, height: 500 });
    tauriWindowHarness.win = win;
    await enterMiniWindow();
    win.calls.length = 0;

    await exitMiniWindow();

    expect(callNames(win)).toEqual(['setMinSize', 'setResizable', 'setSize']);
    expect(sizesFor(win, 'setMinSize')).toEqual([{ width: 900, height: 600 }]);
    expect(sizesFor(win, 'setSize')).toEqual([{ width: 960, height: 600 }]);
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  test('exit ignores a saved size below the floor in one dimension', async () => {
    const win = createMockWindow({ width: 1280, height: 500 });
    tauriWindowHarness.win = win;
    await enterMiniWindow();
    win.calls.length = 0;

    await exitMiniWindow();

    expect(callNames(win)).toEqual(['setMinSize', 'setResizable', 'setSize']);
    expect(sizesFor(win, 'setMinSize')).toEqual([{ width: 900, height: 600 }]);
    expect(sizesFor(win, 'setSize')).toEqual([{ width: 960, height: 600 }]);
    expect(__getSavedFullOuterSizeForTests()).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
