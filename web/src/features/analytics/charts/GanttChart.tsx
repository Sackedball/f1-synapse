import React from 'react';
import { DriverInfo, Stint } from '@/api/types';
import { cn } from '@/lib/utils';

export interface GanttChartProps {
  drivers: DriverInfo[];
  stints: Stint[];
  totalLaps: number;
  currentLap: number;
  selectedDriver?: string | null;
  onSelectDriver?: (code: string) => void;
  className?: string;
}

export function getCompoundColor(compound?: string | null): string {
  if (!compound) return 'var(--text-3)';
  const c = compound.toUpperCase();
  if (c.startsWith('S') || c.includes('SOFT')) return '#E10600';
  if (c.startsWith('M') || c.includes('MEDIUM')) return '#FFE600';
  if (c.startsWith('H') || c.includes('HARD')) return '#FFFFFF';
  if (c.startsWith('I') || c.includes('INTER')) return '#39B54A';
  if (c.startsWith('W') || c.includes('WET')) return '#00A0DE';
  return 'var(--text-2)';
}

export function getCompoundLetter(compound?: string | null): string {
  if (!compound) return '?';
  const c = compound.toUpperCase();
  if (c.startsWith('S') || c.includes('SOFT')) return 'S';
  if (c.startsWith('M') || c.includes('MEDIUM')) return 'M';
  if (c.startsWith('H') || c.includes('HARD')) return 'H';
  if (c.startsWith('I') || c.includes('INTER')) return 'I';
  if (c.startsWith('W') || c.includes('WET')) return 'W';
  return c[0] || '?';
}

export const GanttChart: React.FC<GanttChartProps> = ({
  drivers,
  stints,
  totalLaps = 53,
  currentLap = 1,
  selectedDriver,
  onSelectDriver,
  className,
}) => {
  // Group stints by driver
  const stintsByDriver: Record<string, Stint[]> = {};
  for (const s of stints) {
    if (!stintsByDriver[s.driver]) {
      stintsByDriver[s.driver] = [];
    }
    stintsByDriver[s.driver].push(s);
  }

  // Sort stints for each driver by lap
  for (const code of Object.keys(stintsByDriver)) {
    stintsByDriver[code].sort((a, b) => a.lap - b.lap);
  }

  const currentLapPct = Math.max(0, Math.min(100, (currentLap / totalLaps) * 100));

  return (
    <div className={cn('w-full flex flex-col select-none overflow-x-auto', className)}>
      {/* 1. Header Lap Numbers */}
      <div className="flex items-center text-[10px] font-mono text-[var(--text-3)] border-b border-[var(--border)] pb-1 mb-1 pl-20 pr-4">
        <div className="flex-1 relative h-4">
          {[0, 10, 20, 30, 40, 50, totalLaps].map((lap) => {
            if (lap > totalLaps) return null;
            const leftPct = (lap / totalLaps) * 100;
            return (
              <span
                key={lap}
                className="absolute top-0 -translate-x-1/2"
                style={{ left: `${leftPct}%` }}
              >
                L{lap}
              </span>
            );
          })}
        </div>
      </div>

      {/* 2. Driver Stints Rows */}
      <div className="space-y-1 relative pr-4">
        {/* Current Lap Needle Indicator */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-[var(--accent)] z-20 pointer-events-none shadow-[0_0_8px_var(--accent)]"
          style={{ left: `calc(5rem + ${currentLapPct * (1 - 5 / 60)}%)` }}
        >
          <div className="absolute -top-1 -translate-x-1/2 left-1/2 w-2 h-2 rounded-full bg-[var(--accent)]" />
        </div>

        {drivers.map((d) => {
          const isSelected = selectedDriver === d.code;
          const driverStints = stintsByDriver[d.code] || [];
          const pitCount = Math.max(0, driverStints.length - 1);

          return (
            <div
              key={d.code}
              onClick={() => onSelectDriver?.(d.code)}
              className={cn(
                'flex items-center h-6 rounded-xs transition-colors cursor-pointer group',
                isSelected ? 'bg-[var(--surface-3)]' : 'hover:bg-[var(--surface-2)]',
              )}
            >
              {/* Driver code column */}
              <div className="w-20 shrink-0 flex items-center gap-1.5 px-2">
                <span
                  className="w-1 h-3.5 rounded-xs"
                  style={{ backgroundColor: d.color || 'var(--accent)' }}
                />
                <span className="font-display font-bold text-xs text-[var(--text-1)]">
                  {d.code}
                </span>
                <span className="text-[9px] font-mono text-[var(--text-3)] ml-auto">
                  {pitCount}P
                </span>
              </div>

              {/* Stint Bars container */}
              <div className="flex-1 h-3.5 relative bg-[var(--surface-0)] rounded-xs overflow-hidden border border-[var(--border)]">
                {driverStints.length === 0 ? (
                  // Fallback: 1 single stint on medium compound
                  <div
                    className="absolute top-0 bottom-0 left-0 right-0 flex items-center px-1 font-mono font-bold text-[9px] text-neutral-900"
                    style={{ backgroundColor: getCompoundColor('M') }}
                  >
                    M
                  </div>
                ) : (
                  driverStints.map((stint, idx) => {
                    const startLap = stint.lap || 1;
                    const nextStint = driverStints[idx + 1];
                    const endLap = nextStint ? nextStint.lap - 1 : totalLaps;
                    const stintLaps = Math.max(1, endLap - startLap + 1);

                    const leftPct = ((startLap - 1) / totalLaps) * 100;
                    const widthPct = (stintLaps / totalLaps) * 100;

                    const color = getCompoundColor(stint.compound);
                    const letter = getCompoundLetter(stint.compound);

                    return (
                      <div
                        key={idx}
                        className="absolute top-0 bottom-0 border-r border-neutral-900/50 flex items-center justify-center font-mono font-bold text-[9px] text-neutral-950 transition-opacity hover:opacity-90"
                        style={{
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          backgroundColor: color,
                        }}
                        title={`${d.code} Stint ${idx + 1}: ${stint.compound || 'Unknown'} (L${startLap} - L${endLap}, ${stintLaps} laps)`}
                      >
                        {widthPct > 5 && letter}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
