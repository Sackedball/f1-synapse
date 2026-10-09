import React, { useMemo } from 'react';
import { DriverInfo, Stint } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { GanttChart } from '../charts/GanttChart';
import { Disc3 } from 'lucide-react';
import { useSelectionStore } from '@/stores/selectionStore';

export interface TyreStrategyPanelProps {
  drivers: DriverInfo[];
  stints: Stint[];
  snapshot: Snapshot | null;
  totalLaps?: number;
}

export const TyreStrategyPanel: React.FC<TyreStrategyPanelProps> = ({
  drivers,
  stints = [],
  snapshot,
  totalLaps = 53,
}) => {
  const { selectedDriver, setSelectedDriver } = useSelectionStore();

  // Approximate current lap from snapshot
  const currentLap = useMemo(() => {
    if (!snapshot || snapshot.n === 0) return 1;
    // Max of current laps across drivers
    let maxLap = 1;
    for (let i = 0; i < snapshot.n; i++) {
      if (snapshot.lap && snapshot.lap[i] > maxLap) {
        maxLap = snapshot.lap[i];
      }
    }
    return maxLap;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, snapshot?.t]);

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-1)] text-[var(--text-1)] select-none overflow-y-auto">
      {/* 1. Header Toolbar */}
      <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Disc3 className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--text-2)]">
            TYRE STRATEGY & STINTS MATRIX
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] font-mono font-bold">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#E10600]" />
            <span>SOFT (S)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#FFE600] text-neutral-900" />
            <span>MED (M)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-white" />
            <span>HARD (H)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#39B54A]" />
            <span>INT (I)</span>
          </div>
        </div>
      </div>

      {/* 2. Strategy Matrix Overview */}
      <div className="p-3 flex-1 overflow-y-auto">
        <GanttChart
          drivers={drivers}
          stints={stints}
          totalLaps={totalLaps}
          currentLap={currentLap}
          selectedDriver={selectedDriver}
          onSelectDriver={(code) => setSelectedDriver(code)}
        />
      </div>
    </div>
  );
};
