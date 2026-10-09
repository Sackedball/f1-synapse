import { create } from 'zustand';

export interface UiState {
  showLabels: boolean;
  labelMode: 'code' | 'number';
  showDrsZones: boolean;
  showProgressBar: boolean;
  density: 'comfortable' | 'compact';
  performanceMode: boolean;
  activeContextTab: 'telemetry' | 'stints' | 'weather' | 'ml';
  cameraMode: 'fit' | 'free' | 'follow';
  northUp: boolean;
  focusMode: boolean;
  trailsLength: number; // 0 to 6 seconds
  showFps: boolean;

  toggleLabels: () => void;
  setLabelMode: (mode: 'code' | 'number') => void;
  toggleLabelMode: () => void;
  toggleDrsZones: () => void;
  toggleProgressBar: () => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
  setPerformanceMode: (perf: boolean) => void;
  setActiveContextTab: (tab: 'telemetry' | 'stints' | 'weather' | 'ml') => void;
  setCameraMode: (mode: 'fit' | 'free' | 'follow') => void;
  toggleNorthUp: () => void;
  setNorthUp: (northUp: boolean) => void;
  toggleFocusMode: () => void;
  setFocusMode: (focus: boolean) => void;
  setTrailsLength: (len: number) => void;
  toggleFps: () => void;
  setShowFps: (show: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  showLabels: true,
  labelMode: 'code',
  showDrsZones: true,
  showProgressBar: true,
  density: 'comfortable',
  performanceMode: false,
  activeContextTab: 'telemetry',
  cameraMode: 'fit',
  northUp: false,
  focusMode: false,
  trailsLength: 3,
  showFps: false,

  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  setLabelMode: (labelMode) => set({ labelMode }),
  toggleLabelMode: () =>
    set((s) => ({ labelMode: s.labelMode === 'code' ? 'number' : 'code' })),
  toggleDrsZones: () => set((s) => ({ showDrsZones: !s.showDrsZones })),
  toggleProgressBar: () => set((s) => ({ showProgressBar: !s.showProgressBar })),

  setDensity: (density) => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-density', density);
    }
    set({ density });
  },

  setPerformanceMode: (performanceMode) => set({ performanceMode }),
  setActiveContextTab: (activeContextTab) => set({ activeContextTab }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  toggleNorthUp: () => set((s) => ({ northUp: !s.northUp })),
  setNorthUp: (northUp) => set({ northUp }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setFocusMode: (focusMode) => set({ focusMode }),
  setTrailsLength: (trailsLength) => set({ trailsLength }),
  toggleFps: () => set((s) => ({ showFps: !s.showFps })),
  setShowFps: (showFps) => set({ showFps }),
}));

