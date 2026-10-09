import React, { useState, useMemo } from 'react';
import { DriverInfo } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { cn } from '@/lib/utils';

export interface PositionStripProps {
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  selectedDriver?: string | null;
  onSelectDriver?: (code: string) => void;
  lapLengthMeters?: number;
  className?: string;
}

export const PositionStrip: React.FC<PositionStripProps> = ({
  drivers,
  snapshot,
  selectedDriver,
  onSelectDriver,
  lapLengthMeters = 5807, // Suzuka default
  className,
}) => {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  // Compute position percentage for each driver
  const carPositions = useMemo(() => {
    if (!snapshot || snapshot.n === 0) return [];

    const list: Array<{
      driver: DriverInfo;
      pct: number;
      pos: number;
      speed: number;
      inPit: boolean;
      status: number;
    }> = [];

    for (let i = 0; i < Math.min(snapshot.n, drivers.length); i++) {
      const d = drivers[i];
      if (!d) continue;

      const dist = snapshot.dist[i] || 0;
      const normalizedLapDist = Math.max(0, dist % lapLengthMeters);
      const pct = (normalizedLapDist / lapLengthMeters) * 100;
      const pos = snapshot.position[i] || i + 1;
      const speed = Math.round(snapshot.speed[i] || 0);
      const inPit = snapshot.inPit[i] === 1;
      const status = snapshot.status[i];

      list.push({ driver: d, pct, pos, speed, inPit, status });
    }

    return list.sort((a, b) => a.pct - b.pct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, snapshot?.t, drivers, lapLengthMeters]);

  return (
    <div className={cn('w-full flex flex-col select-none py-2', className)}>
      {/* 1. Track Bar Header with Sector Dividers */}
      <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[var(--text-3)] mb-1 px-1">
        <span>START / FINISH (0%)</span>
        <span className="text-[var(--text-2)]">SECTOR 1</span>
        <span className="text-[var(--text-2)]">SECTOR 2</span>
        <span>SECTOR 3 (100%)</span>
      </div>

      {/* 2. Linear Ribbon Container */}
      <div className="relative h-14 bg-[var(--surface-1)] border border-[var(--border-hi)] rounded-[var(--r-md)] overflow-hidden flex items-center px-4">
        {/* Asphalt Track Surface Centerline */}
        <div className="w-full h-2 bg-[var(--surface-2)] rounded-full border border-[var(--border)] relative">
          {/* Sector 1 divider */}
          <div className="absolute top-0 bottom-0 left-[33%] w-[2px] bg-[var(--border-hi)]" />
          {/* Sector 2 divider */}
          <div className="absolute top-0 bottom-0 left-[66%] w-[2px] bg-[var(--border-hi)]" />
        </div>

        {/* Cars on the Strip */}
        {carPositions.map(({ driver, pct, pos, speed, inPit, status }) => {
          if (status === 1) return null; // Skip retired cars

          const isSelected = selectedDriver === driver.code;
          const isHovered = hoveredCode === driver.code;
          const teamColor = driver.color || 'var(--accent)';

          return (
            <div
              key={driver.code}
              className="absolute -translate-x-1/2 z-20 transition-all duration-75 cursor-pointer"
              style={{ left: `calc(1rem + ${pct * 0.95}%)` }}
              onMouseEnter={() => setHoveredCode(driver.code)}
              onMouseLeave={() => setHoveredCode(null)}
              onClick={() => onSelectDriver?.(driver.code)}
            >
              {/* Car Marker Pill */}
              <div
                className={cn(
                  'px-1.5 py-0.5 rounded-xs flex items-center gap-1 shadow-md transition-transform',
                  'bg-[var(--surface-2)] border text-[10px] font-mono font-bold',
                  isSelected
                    ? 'border-white scale-125 z-30 shadow-[0_0_10px_white]'
                    : isHovered
                      ? 'border-[var(--border-strong)] scale-110 z-20'
                      : 'border-[var(--border)]',
                  inPit && 'opacity-60',
                )}
                style={{
                  borderLeftColor: teamColor,
                  borderLeftWidth: 3,
                }}
              >
                <span className="text-[var(--text-3)] text-[9px]">P{pos}</span>
                <span className="text-[var(--text-1)]">{driver.code}</span>
              </div>

              {/* Hover Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full mb-2 -translate-x-1/2 left-1/2 px-2 py-1 rounded-[var(--r-sm)] bg-[var(--surface-3)] border border-[var(--border-hi)] text-[10px] font-mono shadow-xl whitespace-nowrap z-40">
                  <div className="font-bold text-[var(--text-1)]">
                    {driver.fullName} (P{pos})
                  </div>
                  <div className="text-[var(--text-3)]">
                    {speed} km/h · {Math.round(pct)}% lap {inPit && '· IN PIT'}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
