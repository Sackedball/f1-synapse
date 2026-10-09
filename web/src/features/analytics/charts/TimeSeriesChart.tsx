import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { chartColors, defaultAxisFont } from './chartTheme';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { RaceEvent } from '@/api/types';

export interface SeriesConfig {
  label: string;
  color: string;
  width?: number;
  unit?: string;
  scale?: string;
}

export interface TimeSeriesChartProps {
  data: [number[], ...number[][]]; // [x (timeSec), y1, y2, ...]
  series: SeriesConfig[];
  clock?: PlaybackClock | null;
  events?: RaceEvent[];
  title?: string;
  syncGroup?: string;
  yMin?: number;
  yMax?: number;
  yUnit?: string;
  height?: number;
  className?: string;
}

// Global sync cursor cache across charts
const syncStore: Record<string, ReturnType<typeof uPlot.sync>> = {};

function getSync(groupName?: string) {
  if (!groupName) return undefined;
  if (!syncStore[groupName]) {
    syncStore[groupName] = uPlot.sync(groupName);
  }
  return syncStore[groupName];
}

export const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({
  data,
  series,
  clock,
  events = [],
  title,
  syncGroup = 'analytics-sync',
  yMin,
  yMax,
  yUnit = '',
  height = 200,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const currentTimeRef = useRef<number>(clock ? clock.currentTime : 0);

  // Keep track of current time via clock subscription
  useEffect(() => {
    if (!clock) return;
    const unsub = clock.subscribeThrottled((t) => {
      currentTimeRef.current = t;
      if (chartRef.current) {
        chartRef.current.redraw(false, false);
      }
    }, 10);
    return unsub;
  }, [clock]);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || 400;

    const opts: uPlot.Options = {
      width,
      height,
      title: title || undefined,
      cursor: {
        sync: getSync(syncGroup),
        drag: { x: true, y: false },
        points: { size: 6 },
      },
      scales: {
        x: {
          time: false,
        },
        y: {
          auto: yMin === undefined || yMax === undefined,
          range:
            yMin !== undefined && yMax !== undefined
              ? [yMin, yMax]
              : undefined,
        },
      },
      axes: [
        {
          scale: 'x',
          font: defaultAxisFont,
          stroke: chartColors.text,
          grid: { stroke: chartColors.grid, width: 1 },
          ticks: { stroke: chartColors.border, width: 1 },
          values: (_u, vals) => vals.map((v) => `${Math.round(v)}s`),
        },
        {
          scale: 'y',
          font: defaultAxisFont,
          stroke: chartColors.text,
          grid: { stroke: chartColors.grid, width: 1 },
          ticks: { stroke: chartColors.border, width: 1 },
          values: (_u, vals) => vals.map((v) => `${Math.round(v)}${yUnit}`),
        },
      ],
      series: [
        {
          label: 'Time',
          value: (_u, v) => (v != null ? `${v.toFixed(2)}s` : '-'),
        },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color,
          width: s.width || 1.5,
          value: (_u: uPlot, v: number | null) =>
            v != null ? `${v.toFixed(1)}${s.unit || yUnit}` : '-',
        })),
      ],
      hooks: {
        drawClear: [
          (u) => {
            // Draw flag/SC background bands
            const ctx = u.ctx;
            for (const ev of events) {
              if (ev.type === 'safety_car' || ev.type === 'vsc' || ev.type === 'flag') {
                const t0 = ev.t;
                const t1 = ev.tEnd && ev.tEnd > ev.t ? ev.tEnd : ev.t + 30;
                const x0 = u.valToPos(t0, 'x', true);
                const x1 = u.valToPos(t1, 'x', true);
                if (x1 < u.bbox.left || x0 > u.bbox.left + u.bbox.width) continue;

                const clampX0 = Math.max(u.bbox.left, x0);
                const clampW = Math.max(1, Math.min(u.bbox.left + u.bbox.width, x1) - clampX0);

                ctx.save();
                ctx.fillStyle =
                  ev.type === 'safety_car'
                    ? 'rgba(255, 135, 0, 0.12)'
                    : ev.type === 'vsc'
                      ? 'rgba(255, 184, 0, 0.10)'
                      : 'rgba(235, 10, 30, 0.12)';
                ctx.fillRect(clampX0, u.bbox.top, clampW, u.bbox.height);
                ctx.restore();
              }
            }
          },
        ],
        draw: [
          (u) => {
            // Draw vertical playhead line
            const curT = currentTimeRef.current;
            if (curT !== undefined && curT >= 0) {
              const xPos = u.valToPos(curT, 'x', true);
              if (xPos >= u.bbox.left && xPos <= u.bbox.left + u.bbox.width) {
                const ctx = u.ctx;
                ctx.save();
                ctx.strokeStyle = chartColors.accent;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(xPos, u.bbox.top);
                ctx.lineTo(xPos, u.bbox.top + u.bbox.height);
                ctx.stroke();
                ctx.restore();
              }
            }
          },
        ],
      },
    };

    // Fallback safe data if data is empty on initial render
    const hasData = data && data[0] && data[0].length > 0;
    const initialData = hasData ? data : [[0], ...series.map(() => [0])];

    // Instantiate uPlot
    const u = new uPlot(opts, initialData as uPlot.AlignedData, containerRef.current);
    chartRef.current = u;

    // Click to seek handler
    const handleClick = (e: MouseEvent) => {
      if (!chartRef.current || !clock) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const xPx = e.clientX - rect.left;
      const val = chartRef.current.posToVal(xPx, 'x');
      if (val !== undefined && !isNaN(val)) {
        clock.seek(Math.max(0, val));
      }
    };

    const containerEl = containerRef.current;
    containerEl.addEventListener('click', handleClick);

    // ResizeObserver
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && chartRef.current) {
            chartRef.current.setSize({
              width: entry.contentRect.width,
              height: height,
            });
          }
        }
      });
      ro.observe(containerEl);
    }

    return () => {
      containerEl.removeEventListener('click', handleClick);
      if (ro) ro.disconnect();
      u.destroy();
      chartRef.current = null;
    };
    // Data updates are handled dynamically by setData effect below to avoid recreating uPlot instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, events, title, syncGroup, yMin, yMax, yUnit, height, clock]);

  // Fast path: update chart data via setData without rebuilding DOM/uPlot instance
  useEffect(() => {
    if (chartRef.current && data && data[0] && data[0].length > 0) {
      chartRef.current.setData(data as uPlot.AlignedData);
    }
  }, [data]);

  return (
    <div
      ref={containerRef}
      className={`w-full overflow-hidden select-none cursor-crosshair ${className || ''}`}
      style={{ height }}
    />
  );
};
