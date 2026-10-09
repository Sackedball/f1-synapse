import { create } from 'zustand';
export const useMotionStore = create<{ introDone: boolean; setIntroDone: () => void }>((set) => ({
  introDone: false,
  setIntroDone: () => set({ introDone: true }),
}));
