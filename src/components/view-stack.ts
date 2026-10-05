import { create } from 'zustand';

export type StackView = 'queue' | 'library' | 'playlists';

type State = {
  /**
   * The user's explicit choice from the breadcrumb. `null` means "not chosen":
   * the right column then defaults to the Queue when something is playing and
   * to the library when nothing is.
   */
  pinned: StackView | null;
  pin: (view: StackView | null) => void;
};

export const useViewStack = create<State>()((set) => ({
  pinned: null,
  pin: (pinned) => set({ pinned }),
}));
