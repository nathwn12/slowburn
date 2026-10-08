import type { Config } from '../generated/typings';

/**
 * Native window geometry for the Mini / Full modes.
 *
 * Mini is an AIMP-style compact footprint that stays freely resizable down
 * to its own small floor; leaving Mini restores the exact pre-Mini size and
 * the Full-mode floor. The DOM stack in `__root.tsx` only rearranges content
 * - without this, the native window neither shrinks nor can shrink (the Rust
 * default floor is 900x600, see `main.rs`).
 */

/** Compact AIMP-like Mini footprint (logical px). */
export const MINI_WINDOW_SIZE = { width: 420, height: 660 } as const;

/** Mini stays freely resizable down to this floor (logical px). */
export const MINI_WINDOW_MIN_SIZE = { width: 320, height: 420 } as const;

/** Full-mode footprint, matching the native default in `main.rs`. */
export const FULL_WINDOW_SIZE = { width: 960, height: 600 } as const;

/** Full-mode floor, matching the native default in `main.rs`. */
export const FULL_WINDOW_MIN_SIZE = { width: 900, height: 600 } as const;

export type WindowGeometry = {
  size: { width: number; height: number };
  minSize: { width: number; height: number };
};

/**
 * Pure mode -> geometry mapping (unit-tested). `minimal` keeps Full geometry:
 * it is a content-density choice, not a window footprint.
 */
export function windowGeometryForMode(mode: Config['ui_mode']): WindowGeometry {
  if (mode === 'mini') {
    return { size: MINI_WINDOW_SIZE, minSize: MINI_WINDOW_MIN_SIZE };
  }
  return { size: FULL_WINDOW_SIZE, minSize: FULL_WINDOW_MIN_SIZE };
}

/**
 * Pre-Mini outer size in physical px, kept in module state so leaving Mini
 * restores exactly what entering Mini replaced.
 */
let savedFullOuterSize: { width: number; height: number } | null = null;

/** Test seam: inspect the pending restore size. */
export function __getSavedFullOuterSizeForTests(): {
  width: number;
  height: number;
} | null {
  return savedFullOuterSize;
}

/** Test seam: drop any pending restore size. */
export function __resetMiniWindowStateForTests(): void {
  savedFullOuterSize = null;
}

/**
 * Shrink the native window to the compact Mini footprint. The floor is
 * lowered *before* the resize (otherwise the 900px Full floor clamps it),
 * and the window is left resizable so Mini can be freely resized like AIMP.
 * The current size is saved once - a repeated entry (e.g. a StrictMode
 * double-effect) must not overwrite the real Full size with the Mini one.
 */
export async function enterMiniWindow(): Promise<void> {
  try {
    const { getCurrentWindow, LogicalSize } =
      await import('@tauri-apps/api/window');
    const win = getCurrentWindow();

    if (savedFullOuterSize == null) {
      try {
        const current = await win.outerSize();
        if (
          current != null &&
          Number.isFinite(current.width) &&
          Number.isFinite(current.height)
        ) {
          savedFullOuterSize = {
            width: current.width,
            height: current.height,
          };
        }
      } catch {
        // Reading the size failed (or there is no Tauri backend); the
        // resize below is still attempted.
      }
    }

    const mini = windowGeometryForMode('mini');
    await win.setMinSize(
      new LogicalSize(mini.minSize.width, mini.minSize.height),
    );
    await win.setResizable(true);
    await win.setSize(new LogicalSize(mini.size.width, mini.size.height));
  } catch {
    // No Tauri backend (browser tests) or the window backend refused: Mini
    // still works as a DOM layout, just without the native shrink.
  }
}

/**
 * Restore the Full-mode floor and resizability, then restore the exact
 * pre-Mini size when one was saved. With nothing saved (a fresh Full boot)
 * this is a harmless no-op that just re-asserts the built-in defaults.
 */
export async function exitMiniWindow(): Promise<void> {
  try {
    const { getCurrentWindow, LogicalSize, PhysicalSize } =
      await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const full = windowGeometryForMode('full');

    await win.setMinSize(
      new LogicalSize(full.minSize.width, full.minSize.height),
    );
    await win.setResizable(true);

    if (savedFullOuterSize != null) {
      const restore = savedFullOuterSize;
      savedFullOuterSize = null;
      await win.setSize(new PhysicalSize(restore.width, restore.height));
    }
  } catch {
    // No Tauri backend (browser tests) or the window backend refused; the
    // DOM layout already reflects the mode switch.
  }
}
