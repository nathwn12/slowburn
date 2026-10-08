import { create } from 'zustand';

import type { TrackListStatusInfo } from '../types/museeks';

type LibraryState = {
  search: string;
  refreshing: boolean;
  refresh: {
    current: number;
    total: number;
  };
  /**
   * Files the last scan could not read (`track_failures`). Recorded for
   * every scan, silent or not, so Settings -> Library can surface it after
   * the automatic startup scan stays quiet.
   */
  lastScanFailures: number;
  tracksStatus: TrackListStatusInfo | null;
};

const useLibraryStore = create<LibraryState>()(() => ({
  search: '',
  refreshing: false,
  refresh: {
    current: 0,
    total: 0,
  },
  lastScanFailures: 0,
  tracksStatus: null,
}));

export default useLibraryStore;
