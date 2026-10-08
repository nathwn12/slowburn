import type { OsType } from '@tauri-apps/plugin-os';

/**
 * Whether the app draws its own frameless title bar (`TitleBar.tsx`)
 * instead of the OS chrome. Windows-only: `main.rs` sets
 * `decorations(false)` on Windows, while macOS keeps its overlay traffic
 * lights and Linux keeps the native frame.
 */
export function shouldShowCustomTitleBar(platform: OsType): boolean {
  return platform === 'windows';
}
