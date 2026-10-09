import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TrackRenderer, DriverTooltipData } from '@/render/TrackRenderer';
import { CameraToolbar } from './CameraToolbar';
import { CarTooltip } from './CarTooltip';
import { ErrorState } from '@/components/ui/ErrorState';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { FrameStore } from '@/engine/FrameStore';
import { TrackGeometry, DriverInfo } from '@/api/types';

export interface TrackCanvasProps {
  clock: PlaybackClock | null;
  store: FrameStore | null;
  track: TrackGeometry | null;
  drivers: DriverInfo[];
  circuitName?: string;
  className?: string;
}

export const TrackCanvas: React.FC<TrackCanvasProps> = ({
  clock,
  store,
  track,
  drivers,
  circuitName,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TrackRenderer | null>(null);

  const [webglError, setWebglError] = useState<string | null>(null);
  const [hoverData, setHoverData] = useState<DriverTooltipData | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const handleHoverDriver = useCallback(
    (code: string | null, pos?: { x: number; y: number }, data?: DriverTooltipData) => {
      if (code && pos && data) {
        setHoverData(data);
        setHoverPos(pos);
      } else {
        setHoverData(null);
        setHoverPos(null);
      }
    },
    [],
  );

  const propsRef = useRef({ clock, store, track, drivers, handleHoverDriver });
  propsRef.current = { clock, store, track, drivers, handleHoverDriver };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isMounted = true;
    const { clock: initClock, store: initStore, track: initTrack, drivers: initDrivers } = propsRef.current;
    const renderer = new TrackRenderer({
      clock: initClock,
      store: initStore,
      track: initTrack,
      drivers: initDrivers,
      onHoverDriver: (code, pos, data) => {
        if (isMounted) {
          propsRef.current.handleHoverDriver(code, pos, data);
        }
      },
    });
    rendererRef.current = renderer;

    renderer.init(container).catch((err) => {
      console.error('Failed to initialize Pixi TrackRenderer:', err);
      if (isMounted) {
        setWebglError(
          'WebGL is not available in your browser. The track canvas requires WebGL to render. Please try Chrome or Edge.',
        );
      }
    });

    return () => {
      isMounted = false;
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []); // Run only on mount/unmount

  // Update dependencies when props change without re-creating the renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setDependencies(clock, store, track, drivers);
    }
  }, [clock, store, track, drivers]);

  return (
    <div
      ref={containerRef}
      className={className || 'relative w-full h-full overflow-hidden bg-[var(--surface-0)]'}
    >
      {/* Background Circuit Watermark */}
      {circuitName && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-none select-none z-0">
          <span className="font-display font-black text-6xl md:text-7xl tracking-widest text-[rgba(255,255,255,0.07)] uppercase">
            {circuitName}
          </span>
        </div>
      )}

      {/* Floating Camera Toolbar */}
      <CameraToolbar camera={rendererRef.current?.camera || null} />

      {/* WebGL Unavailability Error State */}
      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-6 bg-[var(--surface-0)]/90 z-40 backdrop-blur-xs">
          <ErrorState
            title="WebGL Unavailable"
            message={webglError}
            className="max-w-md shadow-2xl"
          />
        </div>
      )}

      {/* Hover Telemetry Tooltip */}
      <CarTooltip data={hoverData} position={hoverPos} />
    </div>
  );
};
