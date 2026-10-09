import { create } from 'zustand';

export interface SelectionState {
  selectedDriver: string | null;
  hoveredDriver: string | null;
  compareDrivers: string[];
  lastMomentPulseDriver: string | null;
  lastMomentPulseTime: number;

  setSelectedDriver: (code: string | null) => void;
  setHoveredDriver: (code: string | null) => void;
  toggleCompareDriver: (code: string) => void;
  setCompareDrivers: (codes: string[]) => void;
  clearSelection: () => void;
  triggerMomentPulse: (driver: string) => void;
  selectMomentDrivers: (driverCodes: string[], highlightDurationSec?: number) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedDriver: null,
  hoveredDriver: null,
  compareDrivers: [],
  lastMomentPulseDriver: null,
  lastMomentPulseTime: 0,

  setSelectedDriver: (code) =>
    set((state) => ({
      selectedDriver: state.selectedDriver === code ? null : code,
    })),

  setHoveredDriver: (code) => set({ hoveredDriver: code }),

  setCompareDrivers: (codes) => set({ compareDrivers: codes }),

  toggleCompareDriver: (code) =>
    set((state) => {
      let current = [...state.compareDrivers];
      if (current.length === 0 && state.selectedDriver && state.selectedDriver !== code) {
        current = [state.selectedDriver];
      }
      const exists = current.includes(code);
      if (exists) {
        return { compareDrivers: current.filter((c) => c !== code) };
      }
      return { compareDrivers: [...current, code] };
    }),

  clearSelection: () =>
    set({
      selectedDriver: null,
      hoveredDriver: null,
      compareDrivers: [],
    }),

  triggerMomentPulse: (driver: string) =>
    set({
      lastMomentPulseDriver: driver,
      lastMomentPulseTime: performance.now(),
    }),

  selectMomentDrivers: (driverCodes: string[], highlightDurationSec = 4) => {
    if (!driverCodes || driverCodes.length === 0) return;
    const [primary, ...rest] = driverCodes;
    set({
      selectedDriver: primary,
      compareDrivers: rest,
      lastMomentPulseDriver: primary,
      lastMomentPulseTime: performance.now(),
    });

    if (rest.length > 0 && highlightDurationSec > 0) {
      setTimeout(() => {
        // Reset compareDrivers after highlight duration if still matching
        set((state) => {
          if (state.selectedDriver === primary) {
            return { compareDrivers: [] };
          }
          return {};
        });
      }, highlightDurationSec * 1000);
    }
  },
}));
