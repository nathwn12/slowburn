import { useEffect } from 'react';
import { create } from 'zustand';

import BridgeDatabase from '../lib/bridge-database';
import player from '../lib/player';

/**
 * Client-side knowledge of which tracks have a saved A-B section loop.
 *
 * The database bridge has no "list all saved loops" call (only per-track
 * get/set/clear), and this Wave may not touch `bridge-database.ts`. So the pin
 * is kept honest by:
 *
 *   1. `useSavedLoopsSync` mirrors the player's live A-B state, and
 *   2. each *rendered* row asks for its own track once (`probe`).
 *
 * Probes are memoised per id AND pumped one-at-a-time, so a library or queue
 * view can never issue a burst of `getAbLoop` calls (an earlier eager
 * full-queue probe produced 781 DB calls in ~10s and climbing latency).
 */
type State = {
  ids: Set<string>;
  probed: Set<string>;
  mark: (id: string, hasLoop: boolean) => void;
  probe: (id: string) => void;
};

export const useSavedLoopsStore = create<State>()((set, get) => {
  const pending: string[] = [];
  let pumping = false;

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    while (pending.length > 0) {
      const id = pending.shift()!;
      try {
        const loop = await BridgeDatabase.getAbLoop(id);
        get().mark(
          id,
          loop != null &&
            (loop.start_seconds != null || loop.end_seconds != null),
        );
      } catch {
        // The pin is a nicety: a failed probe just leaves it off.
      }
    }
    pumping = false;
  };

  return {
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
      pending.push(id);
      void pump();
    },
  };
});

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
