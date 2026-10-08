import { open } from '@tauri-apps/plugin-dialog';

import LibraryAPI from '../api/LibraryAPI';
import { logAndNotifyError } from './utils';

/**
 * Ctrl+O / File > Import folders: pick folders and import them, the same
 * path the dropzone takes. Shared by the global keybinding and the menu bar
 * so both stay the same effect.
 */
export default async function importFoldersFromDialog(
  invalidate: () => Promise<unknown>,
): Promise<void> {
  try {
    const selection = await open({ directory: true, multiple: true });
    if (selection == null) return;
    const folders = Array.isArray(selection) ? selection : [selection];
    if (folders.length === 0) return;
    await LibraryAPI.addLibraryFolders(folders);
    await LibraryAPI.scan();
    await invalidate();
  } catch (error) {
    logAndNotifyError(error);
  }
}
