import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SettingsState {
  units: 'metric' | 'imperial';
  volume: number;
  density: 'comfortable' | 'compact';
  trailsLength: number;
  performanceMode: boolean;
  reducedMotion: boolean;
  colorblindMode: boolean;
  cacheLocation: string;
  computedDataLocation: string;
  savedLayouts: Record<string, string>; // name -> JSON string
  activeLayout: string;
  showMlInsights: boolean;
  showTrackMlChips: boolean;

  setUnits: (units: 'metric' | 'imperial') => void;
  setVolume: (volume: number) => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
  setTrailsLength: (len: number) => void;
  setPerformanceMode: (perf: boolean) => void;
  setReducedMotion: (motion: boolean) => void;
  setColorblindMode: (cb: boolean) => void;
  setCacheLocation: (path: string) => void;
  setComputedDataLocation: (path: string) => void;
  setShowMlInsights: (show: boolean) => void;
  setShowTrackMlChips: (show: boolean) => void;
  saveLayout: (name: string, layoutJson: string) => void;
  deleteLayout: (name: string) => void;
  setActiveLayout: (name: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      units: 'metric',
      volume: 80,
      density: 'comfortable',
      trailsLength: 25,
      performanceMode: false,
      reducedMotion: false,
      colorblindMode: false,
      cacheLocation: '.fastf1-cache',
      computedDataLocation: 'computed_data',
      savedLayouts: {},
      activeLayout: 'Race Engineer',
      showMlInsights: true,
      showTrackMlChips: true,

      setUnits: (units) => set({ units }),
      setVolume: (volume) => set({ volume }),
      setDensity: (density) => set({ density }),
      setTrailsLength: (trailsLength) => set({ trailsLength }),
      setPerformanceMode: (performanceMode) => set({ performanceMode }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setColorblindMode: (colorblindMode) => set({ colorblindMode }),
      setCacheLocation: (cacheLocation) => set({ cacheLocation }),
      setComputedDataLocation: (computedDataLocation) => set({ computedDataLocation }),
      setShowMlInsights: (showMlInsights) => set({ showMlInsights }),
      setShowTrackMlChips: (showTrackMlChips) => set({ showTrackMlChips }),
      saveLayout: (name, layoutJson) =>
        set((state) => ({
          savedLayouts: { ...state.savedLayouts, [name]: layoutJson },
          activeLayout: name,
        })),
      deleteLayout: (name) =>
        set((state) => {
          const next = { ...state.savedLayouts };
          delete next[name];
          return {
            savedLayouts: next,
            activeLayout: state.activeLayout === name ? 'Race Engineer' : state.activeLayout,
          };
        }),
      setActiveLayout: (activeLayout) => set({ activeLayout }),
    }),
    {
      name: 'f1-synapse-settings',
    },
  ),
);
