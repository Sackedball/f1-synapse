import React, { useEffect, useRef, useMemo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { chartColors, defaultAxisFont } from './chartTheme';
import { SeriesConfig } from './TimeSeriesChart';

export interface CornerMarker {
  number: number;
  distMeters: number;
  name?: string;
}

export interface DistanceChartProps {
  data: [number[], ...number[][]]; // [x (distance meters), y1, y2, ...]
  series: SeriesConfig[];
  corners?: CornerMarker[];
  title?: string;
  yMin?: number;
  yMax?: number;
  yUnit?: string;
  height?: number;
  currentDist?: number; // current distance marker
  className?: string;
}

export const DistanceChart: React.FC<DistanceChartProps> = ({
  data,
  series,
  corners = [],
  title,
  yMin,
  yMax,
  yUnit = '',
  height = 200,
  currentDist,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const needleRef = useRef<HTMLDivElement>(null);

  // Memoize stable keys to prevent destroying and recreating uPlot when parent re-renders
  const seriesKey = useMemo(() => {
    return series
      .map(
        (s) =>
          `${s.label}:${s.color || (s as any).stroke}:${s.width || 1.5}:${s.unit || ''}:${(s.dash || []).join(',')}`,
      )
      .join('|');
  }, [series]);

  const cornersKey = useMemo(() => {
    return corners.map((c) => `${c.number}:${c.distMeters}`).join('|');
  }, [corners]);

  // Position the playhead needle without redrawing or destroying canvas
  const updateNeedle = (dist: number | undefined) => {
    const needle = needleRef.current;
    const u = chartRef.current;
    if (!needle || !u) return;

    if (dist !== undefined && dist >= 0 && u.bbox) {
      const xPos = u.valToPos(dist, 'x', true);
      if (xPos >= u.bbox.left && xPos <= u.bbox.left + u.bbox.width) {
        needle.style.display = 'block';
        needle.style.left = `${xPos}px`;
        needle.style.top = `${u.bbox.top}px`;
        needle.style.height = `${u.bbox.height}px`;
        return;
      }
    }
    needle.style.display = 'none';
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || 400;

    const opts: uPlot.Options = {
      width,
      height,
      cursor: {
        points: { size: 6 },
      },
      scales: {
        x: { time: false },
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
          values: (_u, vals) => vals.map((v) => `${Math.round(v)}m`),
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
          label: 'Distance',
          value: (_u, v) => (v != null ? `${Math.round(v)}m` : '-'),
        },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.color || (s as any).stroke || chartColors.accent,
          width: s.width || 1.5,
          dash: s.dash,
          value: (_u: uPlot, v: number | null) =>
            v != null ? `${v.toFixed(1)}${s.unit || yUnit}` : '-',
        })),
      ],
      hooks: {
        draw: [
          (u) => {
            const ctx = u.ctx;
            // Draw corner markers
            for (const c of corners) {
              const xPos = u.valToPos(c.distMeters, 'x', true);
              if (xPos >= u.bbox.left && xPos <= u.bbox.left + u.bbox.width) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 2]);
                ctx.beginPath();
                ctx.moveTo(xPos, u.bbox.top);
                ctx.lineTo(xPos, u.bbox.top + u.bbox.height);
                ctx.stroke();

                // Corner label
                ctx.fillStyle = chartColors.text;
                ctx.font = '9px monospace';
                ctx.fillText(`T${c.number}`, xPos + 2, u.bbox.top + 10);
                ctx.restore();
              }
            }
          },
        ],
      },
    };

    // Fallback safe data if data is empty on initial render
    const hasData =
      data &&
      data[0] &&
      data[0].length >= 2 &&
      data.every((arr) => arr && arr.length === data[0].length);
    const initialData = hasData ? data : [[0, 100], ...series.map(() => [0, 0])];

    const u = new uPlot(opts, initialData as uPlot.AlignedData, containerRef.current);
    chartRef.current = u;

    // Initial needle update
    updateNeedle(currentDist);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && chartRef.current) {
            chartRef.current.setSize({
              width: entry.contentRect.width,
              height: height,
            });
            updateNeedle(currentDist);
          }
        }
      });
      ro.observe(containerRef.current);
    }

    return () => {
      if (ro) ro.disconnect();
      u.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey, cornersKey, title, yMin, yMax, yUnit, height]);

  // Fast path: update data via setData without rebuilding chart or canvas
  useEffect(() => {
    if (chartRef.current && data && data[0] && data[0].length >= 2) {
      const xLen = data[0].length;
      const allMatch = data.every((arr) => arr && arr.length === xLen);
      if (allMatch) {
        chartRef.current.setData(data as uPlot.AlignedData);
        updateNeedle(currentDist);
      }
    }
  }, [data]);

  // Smooth 60fps needle position update without canvas clearing
  useEffect(() => {
    updateNeedle(currentDist);
  }, [currentDist]);

  return (
    <div className={`flex flex-col w-full select-none ${className || ''}`}>
      {title && (
        <div className="flex justify-between items-center text-[11px] font-mono font-bold tracking-wider text-[var(--text-2)] mb-1 px-1">
          <span>{title}</span>
          {currentDist !== undefined && currentDist >= 0 && (
            <span className="text-[10px] text-[var(--text-3)] font-normal">
              @ {Math.round(currentDist)}m
            </span>
          )}
        </div>
      )}
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ height }}
      >
        <div
          ref={needleRef}
          className="absolute pointer-events-none w-[2px] z-10 hidden"
          style={{
            backgroundColor: chartColors.accent,
            boxShadow: `0 0 6px ${chartColors.accent}`,
            transition: 'none',
          }}
        />
      </div>
    </div>
  );
};
