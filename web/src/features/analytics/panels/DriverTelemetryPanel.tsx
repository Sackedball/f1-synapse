import React, { useState, useMemo, useEffect } from 'react';
import { DriverInfo } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { FrameStore } from '@/engine/FrameStore';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { useSelectionStore } from '@/stores/selectionStore';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';
import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DriverTelemetryPanelProps {
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  store: FrameStore | null;
  clock: PlaybackClock | null;
  pinnedDriverCode?: string | null;
}

export const DriverTelemetryPanel: React.FC<DriverTelemetryPanelProps> = ({
  drivers,
  snapshot,
  store,
  clock,
  pinnedDriverCode: initialPin = null,
}) => {
  const { selectedDriver } = useSelectionStore();
  const [pinnedDriver, setPinnedDriver] = useState<string | null>(initialPin);
  const [windowSec, setWindowSec] = useState<30 | 60>(30);

  // Active driver to inspect
  const activeCode = pinnedDriver || selectedDriver || drivers[0]?.code;
  const activeDriver = useMemo(() => {
    return drivers.find((d) => d.code === activeCode) || drivers[0];
  }, [drivers, activeCode]);

  const driverIndex = activeDriver?.index ?? drivers.indexOf(activeDriver);

  // Current values
  const currentSpeed = snapshot && driverIndex >= 0 ? Math.round(snapshot.speed[driverIndex] || 0) : 0;
  const rawThr = snapshot && driverIndex >= 0 ? snapshot.throttle[driverIndex] || 0 : 0;
  const currentThrottle = rawThr > 1.0 ? Math.round(Math.min(100, Math.max(0, rawThr))) : Math.round(Math.min(100, Math.max(0, rawThr * 100)));
  const rawBrk = snapshot && driverIndex >= 0 ? snapshot.brake[driverIndex] || 0 : 0;
  const currentBrake = rawBrk > 1.0 ? Math.round(Math.min(100, Math.max(0, rawBrk))) : Math.round(Math.min(100, Math.max(0, rawBrk * 100)));
  const currentGear = snapshot && driverIndex >= 0 ? snapshot.gear[driverIndex] ?? 0 : 0;
  const currentDrs = snapshot && driverIndex >= 0 ? snapshot.drs[driverIndex] || 0 : 0;

  // Generate chart data from FrameStore.getSeries (zero React per-frame allocations)
  const [chartData, setChartData] = useState<[number[], number[], number[], number[]]>([[], [], [], []]);

  useEffect(() => {
    if (!store || !clock || driverIndex < 0) return;

    const updateSeries = (t: number) => {
      const tEnd = t;
      const tStart = Math.max(0, tEnd - windowSec);
      const stepSec = 0.2; // 5 Hz resolution

      try {
        const speedArr = store.getSeries(driverIndex, 'speed', tStart, tEnd, stepSec);
        const throttleArr = store.getSeries(driverIndex, 'throttle', tStart, tEnd, stepSec);
        const brakeArr = store.getSeries(driverIndex, 'brake', tStart, tEnd, stepSec);

        const xVals: number[] = [];
        const ySpeed: number[] = [];
        const yThrottle: number[] = [];
        const yBrake: number[] = [];

        const count = speedArr.length;
        for (let i = 0; i < count; i++) {
          const sampleT = tStart + i * stepSec;
          xVals.push(sampleT);
          ySpeed.push(isNaN(speedArr[i]) ? 0 : speedArr[i]);
          const thr = throttleArr[i];
          yThrottle.push(isNaN(thr) ? 0 : thr > 1.0 ? Math.min(100, Math.max(0, thr)) : Math.min(100, Math.max(0, thr * 100)));
          const brk = brakeArr[i];
          yBrake.push(isNaN(brk) ? 0 : brk > 1.0 ? Math.min(100, Math.max(0, brk)) : Math.min(100, Math.max(0, brk * 100)));
        }

        setChartData([xVals, ySpeed, yThrottle, yBrake]);
      } catch {
        // ignore
      }
    };

    // Initial update
    updateSeries(clock.currentTime);

    // Throttled clock subscription at 5 Hz
    const unsub = clock.subscribeThrottled((t) => {
      updateSeries(t);
    }, 5);

    return unsub;
  }, [store, clock, driverIndex, windowSec]);

  if (!activeDriver) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[var(--text-3)]">
        No driver selected
      </div>
    );
  }

  const teamColor = activeDriver.color || 'var(--accent)';

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-1)] text-[var(--text-1)] select-none overflow-y-auto">
      {/* 1. Header Toolbar */}
      <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-1.5 h-6 rounded-xs"
            style={{ backgroundColor: teamColor }}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-bold text-sm text-[var(--text-1)]">
                {activeDriver.code}
              </span>
              <select
                value={activeDriver.code}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith('POS_')) {
                    const targetPos = parseInt(val.replace('POS_', ''), 10);
                    const orderIdx = snapshot?.orderByPosition ? snapshot.orderByPosition[targetPos - 1] : targetPos - 1;
                    const d = drivers[orderIdx];
                    if (d) {
                      setPinnedDriver(d.code);
                      useSelectionStore.getState().setSelectedDriver(d.code);
                    }
                  } else {
                    setPinnedDriver(val);
                    useSelectionStore.getState().setSelectedDriver(val);
                  }
                }}
                className="text-xs font-mono font-bold bg-[var(--surface-3)] text-[var(--text-1)] border border-[var(--border)] rounded-xs px-1.5 py-0.5 cursor-pointer focus:outline-none focus:border-[var(--accent)]"
                title="Select Driver or Race Leader"
              >
                <optgroup label="Race Positions">
                  <option value="POS_1">P1 - Race Leader</option>
                  <option value="POS_2">P2 - Second Place</option>
                  <option value="POS_3">P3 - Third Place</option>
                </optgroup>
                <optgroup label="All Drivers">
                  {drivers.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} #{d.number} - {d.fullName}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="text-[10px] text-[var(--text-3)] truncate max-w-[140px] mt-0.5">
              {activeDriver.team}
            </div>
          </div>
        </div>

        {/* Readout Badges */}
        <div className="flex items-center gap-2">
          {/* Speed & Gear */}
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-base font-bold text-[var(--text-1)]">{currentSpeed}</span>
            <span className="text-[10px] text-[var(--text-3)]">km/h</span>
          </div>
          <div className="px-1.5 py-0.5 rounded-xs bg-[var(--surface-3)] border border-[var(--border)] font-mono text-xs font-bold">
            G{currentGear === 0 ? 'N' : currentGear}
          </div>
          <div
            className={cn(
              'px-1.5 py-0.5 rounded-xs font-mono text-[9px] font-bold',
              currentDrs === 2
                ? 'bg-[var(--success)] text-neutral-900 animate-pulse'
                : 'bg-[var(--surface-3)] text-[var(--text-disabled)]',
            )}
          >
            DRS
          </div>

          {/* Pin Button */}
          <button
            type="button"
            onClick={() => setPinnedDriver(pinnedDriver ? null : activeDriver.code)}
            title={pinnedDriver ? 'Unpin (Follow Global Selection)' : 'Pin to this Driver'}
            className={cn(
              'p-1.5 rounded-xs border transition-colors cursor-pointer',
              pinnedDriver
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                : 'bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)]',
            )}
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Window duration selector */}
      <div className="px-3 py-1 bg-[var(--surface-1)] border-b border-[var(--border)] flex items-center justify-between text-[10px] font-mono text-[var(--text-3)]">
        <span>TELEMETRY STRIP ({windowSec}s WINDOW)</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWindowSec(30)}
            className={cn(
              'px-1.5 py-0.5 rounded-xs cursor-pointer',
              windowSec === 30
                ? 'bg-[var(--surface-3)] text-[var(--text-1)] font-bold'
                : 'hover:text-[var(--text-1)]',
            )}
          >
            30s
          </button>
          <button
            type="button"
            onClick={() => setWindowSec(60)}
            className={cn(
              'px-1.5 py-0.5 rounded-xs cursor-pointer',
              windowSec === 60
                ? 'bg-[var(--surface-3)] text-[var(--text-1)] font-bold'
                : 'hover:text-[var(--text-1)]',
            )}
          >
            60s
          </button>
        </div>
      </div>

      {/* 3. Charts Stack */}
      <div className="flex-1 p-2 space-y-3">
        {/* Speed Chart */}
        <div className="rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] p-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1 px-1">
            <span className="font-bold text-[var(--text-2)]">SPEED TRACE</span>
            <span>0 - 360 km/h</span>
          </div>
          <TimeSeriesChart
            data={[chartData[0], chartData[1]]}
            series={[{ label: 'Speed', color: teamColor, unit: ' km/h', width: 2 }]}
            clock={clock}
            yMin={0}
            yMax={360}
            yUnit=" km/h"
            height={130}
          />
        </div>

        {/* Throttle & Brake Chart */}
        <div className="rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] p-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1 px-1">
            <span className="font-bold text-[var(--text-2)]">PEDALS (THROTTLE / BRAKE)</span>
            <div className="flex items-center gap-2">
              <span className="text-[var(--success)]">THR {currentThrottle}%</span>
              <span className="text-[var(--danger)]">BRK {currentBrake}%</span>
            </div>
          </div>
          <TimeSeriesChart
            data={[chartData[0], chartData[2], chartData[3]]}
            series={[
              { label: 'Throttle', color: 'var(--success)', unit: '%', width: 1.5 },
              { label: 'Brake', color: 'var(--danger)', unit: '%', width: 1.5 },
            ]}
            clock={clock}
            yMin={0}
            yMax={100}
            yUnit="%"
            height={100}
          />
        </div>
      </div>
    </div>
  );
};
