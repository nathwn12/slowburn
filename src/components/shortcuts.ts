import { create } from 'zustand';

type State = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useShortcuts = create<State>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
