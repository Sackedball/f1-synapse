import React, { useRef, useCallback } from 'react';
import { RaceEvent } from '@/api/types';
import { getEventColor } from './TimelineMarker';

interface FlagSegment {
  t0: number;
  t1: number;
  color: string;
}

interface TimelineMinimapProps {
  durationSec: number;
  zoomStart: number; // 0..1
  zoomEnd: number; // 0..1
  onZoomChange: (start: number, end: number) => void;
  events?: RaceEvent[];
  flagSegments?: FlagSegment[];
  playheadTime?: number;
}

export const TimelineMinimap: React.FC<TimelineMinimapProps> = ({
  durationSec,
  zoomStart,
  zoomEnd,
  onZoomChange,
  events = [],
  flagSegments = [],
  playheadTime = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<'pan' | 'left' | 'right' | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartWindowRef = useRef({ start: zoomStart, end: zoomEnd });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, mode: 'pan' | 'left' | 'right') => {
      e.stopPropagation();
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      isDraggingRef.current = mode;
      dragStartXRef.current = e.clientX;
      dragStartWindowRef.current = { start: zoomStart, end: zoomEnd };
    },
    [zoomStart, zoomEnd],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartXRef.current;
      const deltaPct = deltaX / rect.width;

      const { start: initStart, end: initEnd } = dragStartWindowRef.current;
      const windowWidth = initEnd - initStart;

      if (isDraggingRef.current === 'pan') {
        let newStart = initStart + deltaPct;
        let newEnd = initEnd + deltaPct;
        if (newStart < 0) {
          newStart = 0;
          newEnd = windowWidth;
        }
        if (newEnd > 1) {
          newEnd = 1;
          newStart = 1 - windowWidth;
        }
        onZoomChange(Math.max(0, newStart), Math.min(1, newEnd));
      } else if (isDraggingRef.current === 'left') {
        const minWindow = 0.05;
        const newStart = Math.min(initEnd - minWindow, Math.max(0, initStart + deltaPct));
        onZoomChange(newStart, initEnd);
      } else if (isDraggingRef.current === 'right') {
        const minWindow = 0.05;
        const newEnd = Math.max(initStart + minWindow, Math.min(1, initEnd + deltaPct));
        onZoomChange(initStart, newEnd);
      }
    },
    [onZoomChange],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      isDraggingRef.current = null;
    }
  }, []);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickPct = (e.clientX - rect.left) / rect.width;
    const windowWidth = zoomEnd - zoomStart;
    let newStart = clickPct - windowWidth / 2;
    let newEnd = clickPct + windowWidth / 2;
    if (newStart < 0) {
      newStart = 0;
      newEnd = windowWidth;
    }
    if (newEnd > 1) {
      newEnd = 1;
      newStart = 1 - windowWidth;
    }
    onZoomChange(Math.max(0, newStart), Math.min(1, newEnd));
  };

  const playheadPct = durationSec > 0 ? (playheadTime / durationSec) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onClick={handleTrackClick}
      className="relative w-full h-3.5 bg-[var(--surface-0)] border-b border-[var(--border)] select-none cursor-pointer overflow-hidden"
      title="Race Minimap (Drag lens to pan, edges to zoom)"
    >
      {/* 1. Flag & Caution Bands */}
      {flagSegments.map((seg, i) => {
        if (durationSec <= 0) return null;
        const left = (seg.t0 / durationSec) * 100;
        const width = ((seg.t1 - seg.t0) / durationSec) * 100;
        return (
          <div
            key={i}
            className="absolute top-0 bottom-0 opacity-40"
            style={{
              left: `${left}%`,
              width: `${Math.max(0.5, width)}%`,
              backgroundColor: seg.color,
            }}
          />
        );
      })}

      {/* 2. Event Dots */}
      {events.map((ev) => {
        if (durationSec <= 0) return null;
        const left = (ev.t / durationSec) * 100;
        const color = getEventColor(ev.type, ev.severity);
        return (
          <div
            key={ev.id}
            className="absolute top-1 w-1 h-1 rounded-full pointer-events-none"
            style={{
              left: `${left}%`,
              backgroundColor: color,
            }}
          />
        );
      })}

      {/* 3. Global Playhead Pip */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-[var(--accent)] z-10 pointer-events-none"
        style={{ left: `${playheadPct}%` }}
      />

      {/* 4. Draggable Zoom Lens Window */}
      <div
        className="absolute top-0 bottom-0 border-y border-[var(--accent)] bg-[rgba(225,6,0,0.15)] z-20 cursor-grab active:cursor-grabbing flex items-center justify-between"
        style={{
          left: `${zoomStart * 100}%`,
          width: `${(zoomEnd - zoomStart) * 100}%`,
        }}
        onPointerDown={(e) => handlePointerDown(e, 'pan')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Left Resize Handle */}
        <div
          className="w-1.5 h-full bg-[var(--accent)] hover:w-2 cursor-ew-resize opacity-80"
          onPointerDown={(e) => handlePointerDown(e, 'left')}
        />
        {/* Right Resize Handle */}
        <div
          className="w-1.5 h-full bg-[var(--accent)] hover:w-2 cursor-ew-resize opacity-80"
          onPointerDown={(e) => handlePointerDown(e, 'right')}
        />
      </div>
    </div>
  );
};
