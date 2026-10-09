import React from 'react';
import {
  Maximize2,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Compass,
  Target,
  Zap,
  Tag,
  Activity,
} from 'lucide-react';
import { useUiStore, useSelectionStore } from '@/stores';
import { Camera } from '@/render/camera';

interface CameraToolbarProps {
  camera: Camera | null;
}

export const CameraToolbar: React.FC<CameraToolbarProps> = ({ camera }) => {
  const {
    cameraMode,
    setCameraMode,
    northUp,
    toggleNorthUp,
    focusMode,
    toggleFocusMode,
    showDrsZones,
    toggleDrsZones,
    showLabels,
    labelMode,
    toggleLabels,
    toggleLabelMode,
    showFps,
    toggleFps,
  } = useUiStore();

  const { selectedDriver } = useSelectionStore();

  const handleResetFit = () => {
    camera?.resetToFit();
    setCameraMode('fit');
  };

  const handleZoomIn = () => {
    camera?.zoomIn();
    setCameraMode('free');
  };

  const handleZoomOut = () => {
    camera?.zoomOut();
    setCameraMode('free');
  };

  const handleToggleFollow = () => {
    if (cameraMode === 'follow') {
      setCameraMode('free');
    } else {
      setCameraMode('follow');
    }
  };

  return (
    <div
      className="absolute top-4 right-4 z-20 flex items-center gap-1 p-1 bg-[var(--surface-2)] border border-[var(--border-hi)] rounded-[var(--r-md)] shadow-xl select-none"
      role="toolbar"
      aria-label="Camera and Track Controls"
    >
      {/* Fit to View */}
      <button
        type="button"
        title="Reset View to Full Track"
        aria-label="Reset View"
        onClick={handleResetFit}
        className={`p-1.5 rounded-[var(--r-sm)] transition-colors ${
          cameraMode === 'fit'
            ? 'bg-[var(--surface-4)] text-[var(--text-1)] border border-[var(--border-strong)]'
            : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
        }`}
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      {/* Follow Driver */}
      <button
        type="button"
        title={selectedDriver ? `Follow ${selectedDriver}` : 'Select a driver to follow'}
        aria-label="Follow Selected Driver"
        onClick={handleToggleFollow}
        disabled={!selectedDriver}
        className={`p-1.5 rounded-[var(--r-sm)] transition-colors ${
          cameraMode === 'follow'
            ? 'bg-[var(--accent)] text-white'
            : selectedDriver
              ? 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
              : 'text-[var(--text-disabled)] cursor-not-allowed opacity-40'
        }`}
      >
        <Crosshair className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-4 bg-[var(--border)] mx-0.5" />

      {/* Zoom In */}
      <button
        type="button"
        title="Zoom In (+)"
        aria-label="Zoom In"
        onClick={handleZoomIn}
        className="p-1.5 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] rounded-[var(--r-sm)] transition-colors"
      >
        <ZoomIn className="w-4 h-4" />
      </button>

      {/* Zoom Out */}
      <button
        type="button"
        title="Zoom Out (-)"
        aria-label="Zoom Out"
        onClick={handleZoomOut}
        className="p-1.5 text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] rounded-[var(--r-sm)] transition-colors"
      >
        <ZoomOut className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-4 bg-[var(--border)] mx-0.5" />

      {/* North-Up Orientation */}
      <button
        type="button"
        title={northUp ? 'North-Up (Click for Broadcast Angle)' : 'Broadcast Angle (Click for North-Up)'}
        aria-label="Toggle North-Up"
        onClick={toggleNorthUp}
        className={`p-1.5 rounded-[var(--r-sm)] transition-colors ${
          northUp
            ? 'bg-[var(--surface-4)] text-[var(--insight)] border border-[var(--insight)]/40'
            : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
        }`}
      >
        <Compass className="w-4 h-4" />
      </button>

      {/* Focus Mode */}
      <button
        type="button"
        title={focusMode ? 'Focus Mode Active' : 'Toggle Focus Mode'}
        aria-label="Toggle Focus Mode"
        onClick={toggleFocusMode}
        className={`p-1.5 rounded-[var(--r-sm)] transition-colors ${
          focusMode
            ? 'bg-[var(--accent)] text-white'
            : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
        }`}
      >
        <Target className="w-4 h-4" />
      </button>

      {/* DRS Zones */}
      <button
        type="button"
        title="Toggle DRS Zones (D)"
        aria-label="Toggle DRS Zones"
        onClick={toggleDrsZones}
        className={`p-1.5 rounded-[var(--r-sm)] transition-colors ${
          showDrsZones
            ? 'bg-[var(--success)]/20 text-[var(--success)] border border-[var(--success)]/40'
            : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
        }`}
      >
        <Zap className="w-4 h-4" />
      </button>

      {/* Driver Labels */}
      <button
        type="button"
        title={
          showLabels
            ? `Driver Labels: ${labelMode.toUpperCase()} (Click to toggle, Shift+Click for Code/Number)`
            : 'Toggle Driver Labels (L)'
        }
        aria-label="Toggle Driver Labels"
        onClick={(e) => {
          if (e.shiftKey) {
            toggleLabelMode();
          } else {
            toggleLabels();
          }
        }}
        className={`p-1.5 rounded-[var(--r-sm)] transition-colors flex items-center gap-1 ${
          showLabels
            ? 'bg-[var(--surface-4)] text-[var(--text-1)] border border-[var(--border-strong)]'
            : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
        }`}
      >
        <Tag className="w-4 h-4" />
        {showLabels && (
          <span className="text-[9px] font-mono font-bold uppercase text-[var(--text-2)]">
            {labelMode}
          </span>
        )}
      </button>

      {/* FPS Overlay Toggle */}
      <button
        type="button"
        title="Toggle FPS Debug Overlay (`)"
        aria-label="Toggle FPS Overlay"
        onClick={toggleFps}
        className={`p-1.5 rounded-[var(--r-sm)] transition-colors ${
          showFps
            ? 'bg-[var(--surface-4)] text-[var(--warning)] border border-[var(--warning)]/40'
            : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
        }`}
      >
        <Activity className="w-4 h-4" />
      </button>
    </div>
  );
};
