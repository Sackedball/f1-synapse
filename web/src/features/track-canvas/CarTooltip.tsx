import React from 'react';
import { DriverTooltipData } from '@/render/TrackRenderer';

interface CarTooltipProps {
  data: DriverTooltipData | null;
  position: { x: number; y: number } | null;
}

export const CarTooltip: React.FC<CarTooltipProps> = ({ data, position }) => {
  if (!data || !position) return null;

  return (
    <div
      className="absolute pointer-events-none z-30 transition-transform duration-75 ease-out select-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -125%)',
      }}
    >
      <div className="flex flex-col gap-1 p-2 bg-[var(--surface-2)] border border-[var(--border-hi)] rounded-[var(--r-md)] shadow-2xl text-xs min-w-[130px]">
        {/* Header: Team color indicator, Code, Full Name, Pos */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-1">
          <div className="flex items-center gap-1.5 font-bold">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block border border-black/40"
              style={{ backgroundColor: data.color }}
            />
            <span className="font-display tracking-wider text-[var(--text-1)]">{data.code}</span>
          </div>
          <span className="font-mono text-[10px] text-[var(--text-3)]">P{data.position}</span>
        </div>

        {/* Driver Full Name & Team */}
        <div className="text-[11px] text-[var(--text-2)] truncate">{data.name}</div>
        <div className="text-[10px] text-[var(--text-3)] truncate -mt-0.5">{data.team}</div>

        {/* Telemetry Stats: Speed, Gear, DRS */}
        <div className="flex items-center justify-between pt-1 border-t border-[var(--border)] font-mono text-[10px]">
          <div>
            <span className="text-[var(--text-3)]">SPD </span>
            <span className="font-bold text-[var(--text-1)]">{data.speed}</span>
            <span className="text-[9px] text-[var(--text-3)]"> km/h</span>
          </div>
          <div>
            <span className="text-[var(--text-3)]">G </span>
            <span className="font-bold text-[var(--text-1)]">{data.gear}</span>
          </div>
          {data.drs === 2 ? (
            <span className="text-[var(--success)] font-bold">DRS</span>
          ) : (
            <span className="text-[var(--text-disabled)]">DRS</span>
          )}
        </div>
      </div>
    </div>
  );
};
