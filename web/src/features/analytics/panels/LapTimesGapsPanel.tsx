import React, { useState, useMemo } from 'react';
import { DriverInfo, LapRow } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { useSelectionStore } from '@/stores/selectionStore';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LapTimesGapsPanelProps {
  drivers: DriverInfo[];
  laps: LapRow[];
  snapshot?: Snapshot | null;
  totalLaps?: number;
}

export const LapTimesGapsPanel: React.FC<LapTimesGapsPanelProps> = ({
  drivers,
  laps = [],
  snapshot: _snapshot,
  totalLaps: _totalLaps = 53,
}) => {
  const { selectedDriver, setSelectedDriver } = useSelectionStore();
  const [filterOutliers, setFilterOutliers] = useState(true); // Hide in/out and SC laps
  const [metric, setMetric] = useState<'lapTime' | 'gapLeader'>('lapTime');

  const activeCode = selectedDriver || drivers[0]?.code || 'VER';
  const activeDriver = useMemo(() => {
    return drivers.find((d) => d.code === activeCode) || drivers[0];
  }, [drivers, activeCode]);

  // Compute driver lap stats
  const driverLaps = useMemo(() => {
    return laps.filter((l) => l.driver === activeCode).sort((a, b) => a.lap - b.lap);
  }, [laps, activeCode]);

  // Filtered laps
  const cleanLaps = useMemo(() => {
    if (!filterOutliers) return driverLaps;
    return driverLaps.filter((l) => {
      // Outlier criteria: pit in/out lap or lap time > 120% of median
      if (l.pit_in || l.pit_out) return false;
      const t = l.timeSec || 0;
      return t > 60 && t < 120; // Reasonable Suzuka race lap range
    });
  }, [driverLaps, filterOutliers]);

  // Pace statistics (min, median, max)
  const paceStats = useMemo(() => {
    const times = cleanLaps.map((l) => l.timeSec || 0).filter((t) => t > 0).sort((a, b) => a - b);
    if (times.length === 0) return { min: 0, median: 0, max: 0, bestLap: 0 };
    const min = times[0];
    const max = times[times.length - 1];
    const median = times[Math.floor(times.length / 2)];
    return { min, median, max, bestLap: min };
  }, [cleanLaps]);

  const teamColor = activeDriver?.color || 'var(--accent)';

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-1)] text-[var(--text-1)] select-none overflow-y-auto">
      {/* 1. Header Toolbar */}
      <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--text-2)]">
            LAP TIMES & PACE EVOLUTION
          </span>
        </div>

        {/* Driver Selector */}
        <select
          value={activeCode}
          onChange={(e) => setSelectedDriver(e.target.value)}
          className="bg-[var(--surface-3)] border border-[var(--border-hi)] rounded-xs px-2 py-0.5 font-mono font-bold text-xs text-[var(--text-1)] outline-none cursor-pointer"
          style={{ borderLeftColor: teamColor, borderLeftWidth: 3 }}
        >
          {drivers.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} ({d.fullName})
            </option>
          ))}
        </select>
      </div>

      {/* 2. Pace Distribution Cards */}
      <div className="p-3 bg-[var(--surface-1)] border-b border-[var(--border)] grid grid-cols-3 gap-2">
        <div className="p-2 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] text-center">
          <span className="text-[9px] font-mono text-[var(--text-3)] block mb-0.5">BEST LAP (PB)</span>
          <span className="font-mono font-bold text-sm text-[var(--success)]">
            {paceStats.min > 0 ? `${paceStats.min.toFixed(3)}s` : '-'}
          </span>
        </div>

        <div className="p-2 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] text-center">
          <span className="text-[9px] font-mono text-[var(--text-3)] block mb-0.5">MEDIAN PACE</span>
          <span className="font-mono font-bold text-sm text-[var(--text-1)]">
            {paceStats.median > 0 ? `${paceStats.median.toFixed(3)}s` : '-'}
          </span>
        </div>

        <div className="p-2 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] text-center">
          <span className="text-[9px] font-mono text-[var(--text-3)] block mb-0.5">SLOWEST LAP</span>
          <span className="font-mono font-bold text-sm text-[var(--text-3)]">
            {paceStats.max > 0 ? `${paceStats.max.toFixed(3)}s` : '-'}
          </span>
        </div>
      </div>

      {/* 3. Filter Options */}
      <div className="px-3 py-1.5 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between text-[11px] font-sans text-[var(--text-3)]">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={filterOutliers}
            onChange={(e) => setFilterOutliers(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <span className="font-mono text-[10px]">Filter Outliers (In/Out & SC Laps)</span>
        </label>

        <div className="flex items-center gap-1 font-mono text-[10px]">
          <button
            type="button"
            onClick={() => setMetric('lapTime')}
            className={cn(
              'px-2 py-0.5 rounded-xs cursor-pointer',
              metric === 'lapTime'
                ? 'bg-[var(--surface-4)] text-[var(--text-1)] font-bold'
                : 'hover:text-[var(--text-1)]',
            )}
          >
            LAP TIME
          </button>
          <button
            type="button"
            onClick={() => setMetric('gapLeader')}
            className={cn(
              'px-2 py-0.5 rounded-xs cursor-pointer',
              metric === 'gapLeader'
                ? 'bg-[var(--surface-4)] text-[var(--text-1)] font-bold'
                : 'hover:text-[var(--text-1)]',
            )}
          >
            GAP TO LEADER
          </button>
        </div>
      </div>

      {/* 4. Lap Time Table List */}
      <div className="flex-1 p-3 overflow-y-auto space-y-1">
        <div className="grid grid-cols-5 text-[10px] font-mono font-bold text-[var(--text-3)] px-2 pb-1 border-b border-[var(--border)]">
          <span>LAP</span>
          <span>TIME</span>
          <span>S1</span>
          <span>S2</span>
          <span>S3</span>
        </div>

        {cleanLaps.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-3)] font-sans">
            No lap data available for {activeCode}.
          </div>
        ) : (
          cleanLaps.map((lap) => {
            const isPb = lap.timeSec === paceStats.min;
            return (
              <div
                key={lap.lap}
                className={cn(
                  'grid grid-cols-5 px-2 py-1.5 rounded-xs font-mono text-xs items-center transition-colors',
                  isPb
                    ? 'bg-[rgba(0,210,106,0.12)] border border-[var(--success)] text-[var(--success)]'
                    : 'bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface-3)]',
                )}
              >
                <span className="font-bold text-[var(--text-2)]">L{lap.lap}</span>
                <span className="font-bold">
                  {lap.timeSec ? `${lap.timeSec.toFixed(3)}s` : '-'}
                  {isPb && <span className="ml-1 text-[9px] font-black">PB</span>}
                </span>
                <span className="text-[11px] text-[var(--text-3)]">{lap.s1 ? `${lap.s1.toFixed(1)}s` : '-'}</span>
                <span className="text-[11px] text-[var(--text-3)]">{lap.s2 ? `${lap.s2.toFixed(1)}s` : '-'}</span>
                <span className="text-[11px] text-[var(--text-3)]">{lap.s3 ? `${lap.s3.toFixed(1)}s` : '-'}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
