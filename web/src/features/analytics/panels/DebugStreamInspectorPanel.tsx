import React from 'react';
import { DriverInfo } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { FrameStore } from '@/engine/FrameStore';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { Terminal } from 'lucide-react';

export interface DebugStreamInspectorPanelProps {
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  store?: FrameStore | null;
  clock: PlaybackClock | null;
}

export const DebugStreamInspectorPanel: React.FC<DebugStreamInspectorPanelProps> = ({
  drivers,
  snapshot,
  store: _store,
  clock,
}) => {
  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-1)] text-[var(--text-1)] select-none overflow-hidden font-mono">
      {/* Header */}
      <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-bold text-[var(--text-1)]">
            STREAM INSPECTOR & SNAPSHOT BUFFER
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-[var(--text-3)]">
          <span>CLOCK: {clock ? `${clock.currentTime.toFixed(2)}s (${clock.status})` : 'DISCONNECTED'}</span>
          <span>RATE: {clock?.rate}×</span>
        </div>
      </div>

      {/* Snapshot Drivers Table */}
      <div className="flex-1 overflow-auto p-2">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border-hi)] text-[var(--text-3)] text-[10px]">
              <th className="py-1 px-1.5">IDX</th>
              <th className="py-1 px-1.5">DRV</th>
              <th className="py-1 px-1.5">POS</th>
              <th className="py-1 px-1.5">DIST (m)</th>
              <th className="py-1 px-1.5">SPEED</th>
              <th className="py-1 px-1.5">THR</th>
              <th className="py-1 px-1.5">BRK</th>
              <th className="py-1 px-1.5">GEAR</th>
              <th className="py-1 px-1.5">DRS</th>
              <th className="py-1 px-1.5">PIT</th>
              <th className="py-1 px-1.5">STATUS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {drivers.map((d, i) => {
              const idx = d.index ?? i;
              const pos = snapshot ? snapshot.position[idx] : '-';
              const dist = snapshot ? Math.round(snapshot.dist[idx] || 0) : '-';
              const speed = snapshot ? Math.round(snapshot.speed[idx] || 0) : '-';
              const rawThr = snapshot ? snapshot.throttle[idx] || 0 : 0;
              const thr = snapshot ? Math.round(rawThr > 1.0 ? rawThr : rawThr * 100) : '-';
              const rawBrk = snapshot ? snapshot.brake[idx] || 0 : 0;
              const brk = snapshot ? Math.round(rawBrk > 1.0 ? rawBrk : rawBrk * 100) : '-';
              const gear = snapshot ? snapshot.gear[idx] : '-';
              const drs = snapshot ? snapshot.drs[idx] : '-';
              const inPit = snapshot ? (snapshot.inPit[idx] === 1 ? 'YES' : 'NO') : '-';
              const status = snapshot ? (snapshot.status[idx] === 1 ? 'RET' : 'ACT') : '-';

              return (
                <tr key={d.code} className="hover:bg-[var(--surface-2)]">
                  <td className="py-1 px-1.5 text-[var(--text-3)]">{idx}</td>
                  <td className="py-1 px-1.5 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.code}
                  </td>
                  <td className="py-1 px-1.5 font-bold text-[var(--text-1)]">{pos}</td>
                  <td className="py-1 px-1.5">{dist}</td>
                  <td className="py-1 px-1.5">{speed}</td>
                  <td className="py-1 px-1.5">{thr}%</td>
                  <td className="py-1 px-1.5">{brk}%</td>
                  <td className="py-1 px-1.5">{gear}</td>
                  <td className="py-1 px-1.5">{drs}</td>
                  <td className="py-1 px-1.5 text-[var(--warning)]">{inPit}</td>
                  <td className="py-1 px-1.5">{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
