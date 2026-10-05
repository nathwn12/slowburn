import { useEffect } from 'react';
import { create } from 'zustand';

import BridgeDatabase from '../lib/bridge-database';
import player from '../lib/player';

/**
 * Client-side knowledge of which tracks have a saved A-B section loop.
 *
 * The database bridge has no "list all saved loops" call (only per-track
 * get/set/clear), and this Wave may not touch `bridge-database.ts` (a second
 * lane owns it). So the pin is kept honest in two ways:
 *
 *   1. `useSavedLoopsSync` mirrors the player's live A-B state: whenever the
 *      engine arms, edits or clears a region, the current track is marked.
 *   2. Each row lazily probes its own track once (`probe`), so loops saved in
 *      an earlier session show their pin too.
 */
type State = {
  ids: Set<string>;
  probed: Set<string>;
  mark: (id: string, hasLoop: boolean) => void;
  probe: (id: string) => void;
};

export const useSavedLoopsStore = create<State>()((set, get) => ({
  ids: new Set<string>(),
  probed: new Set<string>(),
  mark: (id, hasLoop) => {
    set((state) => {
      const ids = new Set(state.ids);
      if (hasLoop) {
        ids.add(id);
      } else {
        ids.delete(id);
      }
      return { ids };
    });
  },
  probe: (id) => {
    if (get().probed.has(id)) return;
    set((state) => ({ probed: new Set(state.probed).add(id) }));
    BridgeDatabase.getAbLoop(id)
      .then((loop) => {
        const hasLoop =
          loop != null &&
          (loop.start_seconds != null || loop.end_seconds != null);
        get().mark(id, hasLoop);
      })
      .catch(() => {
        // The pin is a nicety: a failed probe just leaves it off.
      });
  },
}));

/** Whether the given track currently has a saved A-B loop (and probe it once). */
export function useIsSavedLoop(trackID: string | null | undefined): boolean {
  const hasLoop = useSavedLoopsStore((state) =>
    trackID != null ? state.ids.has(trackID) : false,
  );
  const probe = useSavedLoopsStore((state) => state.probe);

  useEffect(() => {
    if (trackID != null) probe(trackID);
  }, [trackID, probe]);

  return hasLoop;
}

/** Mirror the live player A-B state into the store. Mounted once at the root. */
export function useSavedLoopsSync(): void {
  useEffect(() => {
    const update = () => {
      const loop = player.getAbLoop();
      if (loop.trackId != null) {
        useSavedLoopsStore
          .getState()
          .mark(
            loop.trackId,
            loop.startSeconds != null || loop.endSeconds != null,
          );
      }
    };

    update();
    player.on('stateChange', update);
    return () => {
      player.off('stateChange', update);
    };
  }, []);
}
