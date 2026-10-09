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
 * The single place that writes the native minimum size ("floor"). Both mode
 * transitions use it, so there is exactly one place that can be wrong.
 *
 * The Tauri JS API exposes `setMinSize` but no getter for the effective
 * minimum, so the floor cannot be read back and compared: instead the write
 * is awaited (a rejection IS the mismatch signal), retried once, and on a
 * second failure reported loudly via `console.error` and surfaced as `false`
 * so the caller aborts the resize that depends on it. The floor is always
 * set to exactly the target mode's floor - never `null` (which would remove
 * the constraint entirely) and never a foreign mode's value - so a transition
 * can never leave the floor lower than its target mode's floor.
 *
 * @returns `true` when the target floor is confirmed applied.
 */
async function applyModeFloor<SizeT>(
  win: { setMinSize: (size: SizeT) => Promise<void> },
  makeFloorSize: () => SizeT,
  modeLabel: Config['ui_mode'],
  floor: { width: number; height: number },
): Promise<boolean> {
  try {
    await win.setMinSize(makeFloorSize());
    return true;
  } catch (firstError) {
    try {
      await win.setMinSize(makeFloorSize());
      return true;
    } catch (retryError) {
      console.error(
        `[mini-window] failed to set the ${modeLabel}-mode window floor to ${floor.width}x${floor.height} after one retry; aborting the resize so the floor is never left below the target mode's floor.`,
        { firstError, retryError },
      );
      return false;
    }
  }
}

/**
 * Shrink the native window to the compact Mini footprint. The floor is
 * lowered *before* the resize (otherwise the 900px Full floor clamps it),
 * and the resize only runs after the lowered floor is confirmed applied
 * (retried once, loudly reported and aborted on failure) - never the other
 * way round. The window is left resizable so Mini can be freely resized like
 * AIMP. The current size is saved once - a repeated entry (e.g. a StrictMode
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
    const floorOk = await applyModeFloor(
      win,
      () => new LogicalSize(mini.minSize.width, mini.minSize.height),
      'mini',
      mini.minSize,
    );
    if (!floorOk) {
      return;
    }
    await win.setResizable(true);
    await win.setSize(new LogicalSize(mini.size.width, mini.size.height));
  } catch {
    // No Tauri backend (browser tests) or the window backend refused: Mini
    // still works as a DOM layout, just without the native shrink.
  }
}

/**
 * Restore the Full-mode floor and resizability, then always land at
 * Full-mode geometry: the exact pre-Mini size when the saved size is a
 * valid Full-mode size (at or above the Full-mode floor in both
 * dimensions), otherwise the Full-mode default footprint. A saved size
 * below the floor in either dimension is ignored entirely - e.g. the
 * 420x660 Mini footprint saved when the app boots straight into Mini -
 * so the window lands at the Full-mode normal size instead of a
 * per-dimension clamped mix. The raised floor is confirmed applied
 * before the resize runs (retried once, loudly reported and aborted on
 * failure, keeping the pending restore so a retried exit can still
 * restore it); the pending restore is cleared only after the restore
 * resize lands, so a failed restore stays retryable instead of losing
 * the pre-Mini size.
 */
export async function exitMiniWindow(): Promise<void> {
  try {
    const { getCurrentWindow, LogicalSize, PhysicalSize } =
      await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    const full = windowGeometryForMode('full');

    const floorOk = await applyModeFloor(
      win,
      () => new LogicalSize(full.minSize.width, full.minSize.height),
      'full',
      full.minSize,
    );
    if (!floorOk) {
      return;
    }
    await win.setResizable(true);

    if (
      savedFullOuterSize != null &&
      savedFullOuterSize.width >= full.minSize.width &&
      savedFullOuterSize.height >= full.minSize.height
    ) {
      const restore = savedFullOuterSize;
      await win.setSize(new PhysicalSize(restore.width, restore.height));
      savedFullOuterSize = null;
    } else {
      await win.setSize(new LogicalSize(full.size.width, full.size.height));
      savedFullOuterSize = null;
    }
  } catch {
    // No Tauri backend (browser tests) or the window backend refused; the
    // DOM layout already reflects the mode switch.
  }
}
