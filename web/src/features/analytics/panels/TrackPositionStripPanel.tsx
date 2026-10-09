import React from 'react';
import { DriverInfo } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { PositionStrip } from '../charts/PositionStrip';
import { MapPin } from 'lucide-react';
import { useSelectionStore } from '@/stores/selectionStore';
import { useSessionStore } from '@/stores/sessionStore';

export interface TrackPositionStripPanelProps {
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  lapLengthMeters?: number;
}

export const TrackPositionStripPanel: React.FC<TrackPositionStripPanelProps> = ({
  drivers,
  snapshot,
  lapLengthMeters,
}) => {
  const { selectedDriver, setSelectedDriver } = useSelectionStore();
  const track = useSessionStore((state) => state.track);
  const effectiveLapLength = lapLengthMeters ?? track?.lengthM ?? 5807;

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-1)] text-[var(--text-1)] select-none p-3 overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <MapPin className="w-4 h-4 text-[var(--accent)]" />
        <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--text-2)]">
          LINEAR TRACK POSITION STRIP (0–100%)
        </span>
      </div>

      <div className="p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--r-md)]">
        <PositionStrip
          drivers={drivers}
          snapshot={snapshot}
          selectedDriver={selectedDriver}
          onSelectDriver={(code) => setSelectedDriver(code)}
          lapLengthMeters={effectiveLapLength}
        />
      </div>

      {/* Grid Clustering Breakdown */}
      <div className="mt-4 space-y-2">
        <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] block">
          INTERVALS & CAR ACCUMULATION
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {drivers.slice(0, 8).map((d) => {
            const idx = d.index ?? drivers.indexOf(d);
            const pos = snapshot && idx >= 0 ? snapshot.position[idx] || 1 : 1;
            const speed = snapshot && idx >= 0 ? Math.round(snapshot.speed[idx] || 0) : 0;

            return (
              <div
                key={d.code}
                onClick={() => setSelectedDriver(d.code)}
                className="p-2 rounded-xs bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between cursor-pointer hover:border-[var(--border-hi)]"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1 h-3.5 rounded-xs"
                    style={{ backgroundColor: d.color || 'var(--accent)' }}
                  />
                  <span className="font-mono font-bold text-xs">P{pos}</span>
                  <span className="font-display font-bold text-xs">{d.code}</span>
                </div>
                <div className="text-right font-mono text-[10px] text-[var(--text-3)]">
                  <span>{speed} km/h</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
