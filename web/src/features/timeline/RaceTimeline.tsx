import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { PlaybackClock, PlaybackStatus } from '@/engine/PlaybackClock';
import { RaceEvent, DriverInfo, LapRow } from '@/api/types';
import { TimelineMinimap } from './TimelineMinimap';
import { TimelineMarker } from './TimelineMarker';
import {
  timeToPercent,
  percentToTime,
  clusterEvents,
  formatTimelineTime,
} from './timelineMath';
import { ZoomIn, ZoomOut, RotateCcw, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSelectionStore } from '@/stores/selectionStore';

export interface RaceTimelineProps {
  clock: PlaybackClock | null;
  durationSec: number;
  events?: RaceEvent[];
  drivers?: DriverInfo[];
  laps?: LapRow[];
  totalLaps?: number;
  playbackStatus?: PlaybackStatus;
  className?: string;
  onEventSelect?: (event: RaceEvent) => void;
}

export type EventFilterType =
  | 'all'
  | 'overtake'
  | 'pit'
  | 'safety_car'
  | 'battle'
  | 'incident'
  | 'driver';

export const RaceTimeline: React.FC<RaceTimelineProps> = ({
  clock,
  durationSec,
  events = [],
  drivers = [],
  laps = [],
  totalLaps = 53,
  playbackStatus = 'paused',
  className,
  onEventSelect,
}) => {
  const [zoomStart, setZoomStart] = useState(0); // 0..1
  const [zoomEnd, setZoomEnd] = useState(1); // 0..1
  const [activeFilter, setActiveFilter] = useState<EventFilterType>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Hover state
  const [hoverInfo, setHoverInfo] = useState<{
    xPct: number;
    t: number;
    lap: number;
    nearestLabel?: string;
  } | null>(null);

  // Direct DOM refs to avoid 60Hz React re-renders of playhead needle (AC7)
  const trackRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);
  const needleTooltipRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastSeekTimeRef = useRef(0);
  const playheadTimeRef = useRef(0);

  const { selectedDriver, selectMomentDrivers } = useSelectionStore();

  // Driver colors lookup map
  const driverColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of drivers) {
      if (d.code && d.color) {
        map[d.code] = d.color;
      }
    }
    return map;
  }, [drivers]);

  // Derived Lap Markers
  const lapTicks = useMemo(() => {
    if (durationSec <= 0) return [];

    // Calculate approximate lap start times from leader laps if available
    const leaderCode = drivers[0]?.code;
    const leaderLaps = leaderCode
      ? laps.filter((l) => l.driver === leaderCode).sort((a, b) => a.lap - b.lap)
      : [];

    const ticks: Array<{ lap: number; t: number; pct: number }> = [];
    if (leaderLaps.length > 1) {
      let cumulativeT = 0;
      for (const l of leaderLaps) {
        if (cumulativeT > durationSec) break;
        const pct = timeToPercent(cumulativeT, durationSec, zoomStart, zoomEnd);
        if (pct >= -5 && pct <= 105) {
          ticks.push({ lap: l.lap, t: cumulativeT, pct });
        }
        cumulativeT += l.timeSec || 90;
      }
    } else {
      // Fallback: estimate from totalLaps and durationSec
      const numLaps = Math.max(1, Math.min(totalLaps, Math.round(durationSec / 85)));
      const lapDuration = durationSec / numLaps;
      for (let i = 0; i <= numLaps; i++) {
        const t = i * lapDuration;
        const pct = timeToPercent(t, durationSec, zoomStart, zoomEnd);
        if (pct >= -5 && pct <= 105) {
          ticks.push({ lap: i + 1, t, pct });
        }
      }
    }
    return ticks;
  }, [durationSec, drivers, laps, totalLaps, zoomStart, zoomEnd]);

  // Flag and Safety Car segments
  const flagSegments = useMemo(() => {
    const segments: Array<{ t0: number; t1: number; color: string; label: string }> = [];
    for (const ev of events) {
      if (ev.type === 'safety_car' || ev.type === 'vsc' || ev.type === 'flag') {
        const t0 = ev.t;
        const t1 = ev.tEnd && ev.tEnd > ev.t ? ev.tEnd : ev.t + 30;
        let color = 'rgba(255, 135, 0, 0.18)'; // default safety car amber
        if (ev.type === 'vsc') color = 'rgba(255, 184, 0, 0.16)';
        if (ev.label.toLowerCase().includes('red')) color = 'rgba(235, 10, 30, 0.22)';
        if (ev.label.toLowerCase().includes('yellow')) color = 'rgba(255, 230, 0, 0.15)';
        if (ev.label.toLowerCase().includes('green')) color = 'rgba(0, 210, 106, 0.10)';

        segments.push({ t0, t1, color, label: ev.label });
      }
    }
    return segments;
  }, [events]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (activeFilter === 'driver') {
        if (!selectedDriver) return true;
        return ev.drivers && ev.drivers.includes(selectedDriver);
      }
      if (activeFilter === 'overtake') return ev.type === 'overtake';
      if (activeFilter === 'pit') return ev.type === 'pit_in' || ev.type === 'pit_out';
      if (activeFilter === 'safety_car') return ev.type === 'safety_car' || ev.type === 'vsc';
      if (activeFilter === 'battle') return ev.type === 'battle';
      if (activeFilter === 'incident')
        return ev.type === 'incident' || ev.type === 'penalty' || ev.type === 'retirement';
      return true;
    });
  }, [events, activeFilter, selectedDriver]);

  // Measure timeline track width for clustering
  const [trackWidth, setTrackWidth] = useState(1200);
  useEffect(() => {
    if (!trackRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setTrackWidth(entry.contentRect.width);
        }
      }
    });
    observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, []);

  // Clusters of markers
  const clusters = useMemo(() => {
    return clusterEvents(filteredEvents, durationSec, trackWidth, 26, zoomStart, zoomEnd);
  }, [filteredEvents, durationSec, trackWidth, zoomStart, zoomEnd]);

  // Playhead DOM Updater: Subscribe to clock (Direct DOM update - 0 React re-renders)
  const updateNeedleDOM = useCallback(
    (t: number) => {
      playheadTimeRef.current = t;
      const pct = timeToPercent(t, durationSec, zoomStart, zoomEnd);
      if (needleRef.current) {
        needleRef.current.style.left = `${pct}%`;
        // Hide needle if out of zoom window
        needleRef.current.style.display = pct < -1 || pct > 101 ? 'none' : 'block';
      }
      if (needleTooltipRef.current) {
        needleTooltipRef.current.textContent = formatTimelineTime(t);
      }
    },
    [durationSec, zoomStart, zoomEnd],
  );

  useEffect(() => {
    if (!clock) return;
    // Initial sync
    updateNeedleDOM(clock.currentTime);

    // Subscribe to clock updates
    const unsub = clock.subscribe((t) => {
      if (!isDraggingRef.current) {
        updateNeedleDOM(t);
      }
    });
    return unsub;
  }, [clock, updateNeedleDOM]);

  // Keep playhead needle synced when zoom window changes
  useEffect(() => {
    updateNeedleDOM(playheadTimeRef.current);
  }, [zoomStart, zoomEnd, updateNeedleDOM]);

  // Seeking & Dragging handlers
  const handleSeekAtClientX = useCallback(
    (clientX: number, isFinal = false) => {
      if (!trackRef.current || !clock || durationSec <= 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const targetT = percentToTime(clickPct, durationSec, zoomStart, zoomEnd);

      updateNeedleDOM(targetT);

      const now = performance.now();
      // Throttle scrubbing to ~30 Hz (33ms) unless final release
      if (isFinal || now - lastSeekTimeRef.current >= 33) {
        clock.seek(targetT);
        lastSeekTimeRef.current = now;
      }
    },
    [clock, durationSec, zoomStart, zoomEnd, updateNeedleDOM],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    handleSeekAtClientX(e.clientX, false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      handleSeekAtClientX(e.clientX, false);
    }

    // Hover tooltip calculations
    if (trackRef.current && durationSec > 0) {
      const rect = trackRef.current.getBoundingClientRect();
      const xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const t = percentToTime(xPct, durationSec, zoomStart, zoomEnd);

      // Find nearest event within 15px
      const nearest = clusters.find((c) => {
        const cPct = timeToPercent(c.t, durationSec, zoomStart, zoomEnd);
        const diffPx = Math.abs((cPct - xPct) * (rect.width / 100));
        return diffPx < 16;
      });

      // Approximate lap
      const avgLapTime = durationSec / Math.max(1, totalLaps);
      const estLap = Math.min(totalLaps, Math.floor(t / avgLapTime) + 1);

      setHoverInfo({
        xPct,
        t,
        lap: estLap,
        nearestLabel: nearest ? nearest.events[0]?.label : undefined,
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      isDraggingRef.current = false;
      handleSeekAtClientX(e.clientX, true);
    }
  };

  const handlePointerLeave = () => {
    if (!isDraggingRef.current) {
      setHoverInfo(null);
    }
  };

  // Zoom Helpers
  const handleZoom = (direction: 'in' | 'out') => {
    const currentSpan = zoomEnd - zoomStart;
    const factor = direction === 'in' ? 0.7 : 1.4;
    const newSpan = Math.min(1.0, Math.max(0.05, currentSpan * factor));

    // Keep playhead or center focused
    const center = (zoomStart + zoomEnd) / 2;
    let newStart = center - newSpan / 2;
    let newEnd = center + newSpan / 2;

    if (newStart < 0) {
      newStart = 0;
      newEnd = newSpan;
    }
    if (newEnd > 1) {
      newEnd = 1;
      newStart = 1 - newSpan;
    }
    setZoomStart(Math.max(0, newStart));
    setZoomEnd(Math.min(1, newEnd));
  };

  const handleResetZoom = () => {
    setZoomStart(0);
    setZoomEnd(1);
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.deltaY < 0) {
      handleZoom('in');
    } else {
      handleZoom('out');
    }
  };

  // Marker click selection
  const handleMarkerSelect = (ev: RaceEvent) => {
    if (clock) {
      clock.seek(Math.max(0, ev.t - 3));
    }
    if (ev.drivers && ev.drivers.length > 0) {
      selectMomentDrivers(ev.drivers, 4);
    }
    if (onEventSelect) {
      onEventSelect(ev);
    }
  };

  return (
    <div
      className={cn(
        'w-full bg-[var(--surface-1)] border-t border-[var(--border-hi)] flex flex-col select-none relative',
        className,
      )}
      onWheel={handleWheel}
    >
      {/* 1. Full-Race Minimap overview at top */}
      <TimelineMinimap
        durationSec={durationSec}
        zoomStart={zoomStart}
        zoomEnd={zoomEnd}
        onZoomChange={(s, e) => {
          setZoomStart(s);
          setZoomEnd(e);
        }}
        events={events}
        flagSegments={flagSegments}
        playheadTime={playheadTimeRef.current}
      />

      {/* 2. Timeline Controls Toolbar */}
      <div className="px-4 py-1 flex items-center justify-between text-xs border-b border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-3)]">
        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-2)] flex items-center gap-1 text-[11px] font-mono cursor-pointer"
            title="Toggle Event Filters"
          >
            <Filter className="w-3.5 h-3.5" />
            <span className="font-bold">FILTERS</span>
          </button>

          {(
            [
              { key: 'all', label: 'All' },
              { key: 'overtake', label: 'Overtakes' },
              { key: 'pit', label: 'Pits' },
              { key: 'safety_car', label: 'Safety Car' },
              { key: 'battle', label: 'Battles' },
              { key: 'incident', label: 'Incidents' },
              { key: 'driver', label: selectedDriver ? `${selectedDriver} Only` : 'Driver Only' },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={cn(
                'px-2 py-0.5 rounded-xs text-[10px] font-mono font-semibold transition-colors cursor-pointer',
                activeFilter === f.key
                  ? 'bg-[var(--surface-3)] text-[var(--text-1)] border border-[var(--border-hi)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleZoom('in')}
            className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-2)] cursor-pointer"
            title="Zoom In"
            aria-label="Zoom in timeline"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleZoom('out')}
            className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-2)] cursor-pointer"
            title="Zoom Out"
            aria-label="Zoom out timeline"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          {(zoomStart > 0 || zoomEnd < 1) && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-2)] cursor-pointer flex items-center gap-1 text-[10px] font-mono"
              title="Reset Zoom"
              aria-label="Reset zoom"
            >
              <RotateCcw className="w-3 h-3" />
              RESET
            </button>
          )}
        </div>
      </div>

      {/* 3. Main Interactive Scrubber Rail */}
      <div
        ref={trackRef}
        className="relative h-12 w-full bg-[var(--surface-1)] cursor-crosshair overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* Flag and Caution Background Bands */}
        {flagSegments.map((seg, i) => {
          const left = timeToPercent(seg.t0, durationSec, zoomStart, zoomEnd);
          const right = timeToPercent(seg.t1, durationSec, zoomStart, zoomEnd);
          if (right < 0 || left > 100) return null;
          const clampedLeft = Math.max(0, left);
          const clampedWidth = Math.max(0.5, Math.min(100, right) - clampedLeft);

          return (
            <div
              key={i}
              className="absolute top-0 bottom-0 pointer-events-none transition-opacity"
              style={{
                left: `${clampedLeft}%`,
                width: `${clampedWidth}%`,
                backgroundColor: seg.color,
              }}
              title={seg.label}
            />
          );
        })}

        {/* Lap Ticks and Labels */}
        {lapTicks.map((tick) => (
          <div
            key={tick.lap}
            className="absolute top-0 bottom-0 border-l border-[var(--border)] pointer-events-none select-none"
            style={{ left: `${tick.pct}%` }}
          >
            <span className="absolute top-1 left-1 text-[9px] font-mono font-bold text-[var(--text-3)] opacity-60">
              L{tick.lap}
            </span>
          </div>
        ))}

        {/* Event Markers Layer */}
        {clusters.map((cluster) => {
          const pct = timeToPercent(cluster.t, durationSec, zoomStart, zoomEnd);
          if (pct < -2 || pct > 102) return null;

          return (
            <TimelineMarker
              key={cluster.id}
              cluster={cluster}
              leftPct={pct}
              onSelect={handleMarkerSelect}
              driverColors={driverColors}
            />
          );
        })}

        {/* Hover Needle & Tooltip */}
        {hoverInfo && (
          <div
            className="absolute top-0 bottom-0 w-[1px] bg-[var(--text-2)] opacity-60 pointer-events-none z-30"
            style={{ left: `${hoverInfo.xPct}%` }}
          >
            <div
              className={cn(
                'absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded-xs text-[10px] font-mono font-bold',
                'bg-[var(--surface-3)] text-[var(--text-1)] border border-[var(--border-hi)] shadow-md whitespace-nowrap',
              )}
            >
              {formatTimelineTime(hoverInfo.t)} · L{hoverInfo.lap}
              {hoverInfo.nearestLabel && (
                <span className="text-[var(--accent)] ml-1 font-sans">
                  ({hoverInfo.nearestLabel})
                </span>
              )}
            </div>
          </div>
        )}

        {/* Primary Playhead Needle (Imperative direct DOM ref for 60Hz smoothness) */}
        <div
          ref={needleRef}
          className="absolute top-0 bottom-0 w-[2px] bg-[var(--accent)] z-40 pointer-events-none shadow-[0_0_8px_var(--accent)]"
          style={{ left: '0%' }}
        >
          {/* Top glowing round pip */}
          <div className="absolute -top-1 -translate-x-1/2 left-1/2 w-3 h-3 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)] border border-white/50" />

          {/* Current playhead time badge */}
          <div
            ref={needleTooltipRef}
            className="absolute bottom-1 -translate-x-1/2 left-1/2 px-1.5 py-0.5 rounded-xs bg-[var(--surface-3)] border border-[var(--accent)] text-[9px] font-mono font-bold text-[var(--text-1)] shadow-md pointer-events-none whitespace-nowrap"
          >
            00:00.000
          </div>
        </div>

        {/* Buffering Indicator Overlay */}
        {playbackStatus === 'buffering' && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50 pointer-events-none">
            <span className="text-xs font-mono font-bold text-[var(--warning)] animate-pulse tracking-wider">
              BUFFERING CHUNK...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
