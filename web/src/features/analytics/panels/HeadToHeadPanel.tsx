import React, { useState, useMemo, useEffect } from 'react';
import { DriverInfo } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { FrameStore } from '@/engine/FrameStore';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { useSelectionStore } from '@/stores/selectionStore';
import { useSessionStore } from '@/stores/sessionStore';
import { DistanceChart, CornerMarker } from '../charts/DistanceChart';
import { SeriesConfig } from '../charts/TimeSeriesChart';
import { computeCumulativeDelta, computeMiniSectorWinners } from '../math/deltaMath';
import { Swords } from 'lucide-react';

export interface HeadToHeadPanelProps {
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  store: FrameStore | null;
  clock: PlaybackClock | null;
  corners?: CornerMarker[];
}

// Suzuka Default Corner Landmarks
const DEFAULT_SUZUKA_CORNERS: CornerMarker[] = [
  { number: 1, distMeters: 550, name: 'First Curve' },
  { number: 2, distMeters: 800, name: 'Second Curve' },
  { number: 3, distMeters: 1200, name: 'S Curves' },
  { number: 7, distMeters: 2200, name: 'Dunlop' },
  { number: 8, distMeters: 2700, name: 'Degner 1' },
  { number: 9, distMeters: 3000, name: 'Degner 2' },
  { number: 11, distMeters: 3600, name: 'Hairpin' },
  { number: 13, distMeters: 4400, name: 'Spoon' },
  { number: 15, distMeters: 5200, name: '130R' },
  { number: 16, distMeters: 5600, name: 'Casio Triangle' },
];

/**
 * Extracts a continuous, monotonic lap speed curve across distGrid.
 * Prioritizes the current lap for distances driven so far, and seamlessly
 * falls back to the previous completed lap for distances ahead of the car.
 */
function extractLapSpeed(
  store: FrameStore,
  driverIdx: number,
  lapLength: number,
  tStart: number,
  tEnd: number,
  stepSec: number,
  distGrid: number[],
): number[] {
  if (driverIdx < 0) return new Array(distGrid.length).fill(0);

  const speedSeries = store.getSeries(driverIdx, 'speed', tStart, tEnd, stepSec);
  const distSeries = store.getSeries(driverIdx, 'dist', tStart, tEnd, stepSec);

  const n = speedSeries.length;
  if (n === 0) return new Array(distGrid.length).fill(0);

  // Collect valid (cumulativeDist, speed) samples
  const samples: Array<{ d: number; s: number }> = [];
  for (let i = 0; i < n; i++) {
    const d = distSeries[i];
    const s = speedSeries[i];
    if (!isNaN(d) && !isNaN(s) && d >= 0) {
      samples.push({ d, s });
    }
  }

  if (samples.length === 0) return new Array(distGrid.length).fill(0);

  // Latest cumulative distance in window
  const latestCumDist = samples[samples.length - 1].d;
  const currentLapDist = latestCumDist % lapLength;
  const currentLapStartCum = latestCumDist - currentLapDist;

  // We want speed for each target lap distance x in distGrid (0 <= x <= lapLength)
  const result: number[] = new Array(distGrid.length);

  for (let b = 0; b < distGrid.length; b++) {
    const x = distGrid[b];
    let targetCumDist: number;

    if (x <= currentLapDist) {
      // Driver has driven distance x on the current lap
      targetCumDist = currentLapStartCum + x;
    } else if (currentLapStartCum >= lapLength) {
      // Driver hasn't reached distance x on the current lap yet,
      // but completed this distance on the previous lap!
      targetCumDist = currentLapStartCum - lapLength + x;
    } else {
      // Lap 1: Driver hasn't driven this distance yet in the session.
      targetCumDist = -1;
    }

    if (targetCumDist < 0) {
      result[b] = 0;
      continue;
    }

    // Binary search for sample adjacent to targetCumDist
    let low = 0;
    let high = samples.length - 1;
    let bestIdx = -1;

    while (low <= high) {
      const mid = (low + high) >> 1;
      if (samples[mid].d <= targetCumDist) {
        bestIdx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (bestIdx === -1) {
      result[b] = samples[0].s;
    } else if (bestIdx >= samples.length - 1) {
      result[b] = samples[samples.length - 1].s;
    } else {
      // Linear interpolation between bestIdx and bestIdx + 1
      const d0 = samples[bestIdx].d;
      const d1 = samples[bestIdx + 1].d;
      const s0 = samples[bestIdx].s;
      const s1 = samples[bestIdx + 1].s;
      const span = d1 - d0;
      if (span > 0.001) {
        const factor = Math.max(0, Math.min(1, (targetCumDist - d0) / span));
        result[b] = s0 + factor * (s1 - s0);
      } else {
        result[b] = s0;
      }
    }
  }

  // Smooth the speed curve with a 3-point moving average to eliminate discretization jitter
  if (result.length > 2) {
    const smoothed = new Array(result.length);
    smoothed[0] = result[0];
    smoothed[result.length - 1] = result[result.length - 1];
    for (let i = 1; i < result.length - 1; i++) {
      smoothed[i] = Number(
        (0.25 * result[i - 1] + 0.5 * result[i] + 0.25 * result[i + 1]).toFixed(1),
      );
    }
    return smoothed;
  }

  return result;
}

export const HeadToHeadPanel: React.FC<HeadToHeadPanelProps> = ({
  drivers,
  snapshot,
  store,
  clock,
  corners = DEFAULT_SUZUKA_CORNERS,
}) => {
  const { selectedDriver, compareDrivers } = useSelectionStore();

  // Pick Driver 1 and Driver 2
  const [driver1Code, setDriver1Code] = useState<string>(
    selectedDriver || drivers[0]?.code || 'VER',
  );
  const [driver2Code, setDriver2Code] = useState<string>(
    compareDrivers[0] || drivers[1]?.code || 'NOR',
  );

  // Sync with selection store if active
  useEffect(() => {
    if (selectedDriver) {
      setDriver1Code(selectedDriver);
    }
    if (compareDrivers[0]) {
      setDriver2Code(compareDrivers[0]);
    }
  }, [selectedDriver, compareDrivers]);

  const d1 = useMemo(
    () => drivers.find((d) => d.code === driver1Code) || drivers[0],
    [drivers, driver1Code],
  );
  const d2 = useMemo(
    () => drivers.find((d) => d.code === driver2Code) || drivers[1],
    [drivers, driver2Code],
  );

  const idx1 = d1?.index ?? drivers.indexOf(d1);
  const idx2 = d2?.index ?? drivers.indexOf(d2);

  // Real-time speed comparison
  const speed1 = snapshot && idx1 >= 0 ? Math.round(snapshot.speed[idx1] || 0) : 0;
  const speed2 = snapshot && idx2 >= 0 ? Math.round(snapshot.speed[idx2] || 0) : 0;
  const speedDelta = speed1 - speed2;

  // Real-time distance comparison
  const track = useSessionStore((state) => state.track);
  const lapLength = track?.lengthM || 5807;
  const dist1 = snapshot && idx1 >= 0 ? snapshot.dist[idx1] || 0 : 0;
  const lapDist1 = dist1 % lapLength;

  const bucketMeters = 25;
  const distGrid = useMemo(() => {
    const numBuckets = Math.floor(lapLength / bucketMeters);
    const grid: number[] = [];
    for (let b = 0; b <= numBuckets; b++) {
      grid.push(b * bucketMeters);
    }
    if (grid[grid.length - 1] < lapLength) {
      grid.push(lapLength);
    }
    return grid;
  }, [lapLength, bucketMeters]);

  // Generate distance-aligned speed and delta time curves
  const [h2hData, setH2hData] = useState<{
    speedChart: [number[], number[], number[]];
    deltaChart: [number[], number[]];
    miniSectorWinners: Array<{ sector: number; winner: string; advantage: number }>;
  }>({
    speedChart: [[0, 100], [0, 0], [0, 0]],
    deltaChart: [[0, 100], [0, 0]],
    miniSectorWinners: [],
  });

  useEffect(() => {
    if (!store || !clock || idx1 < 0 || idx2 < 0) return;

    const computeH2H = (t: number) => {
      // Look back over the last 140 seconds (covering full lap at race pace)
      const tEnd = t;
      const tStart = Math.max(0, tEnd - 140);
      const stepSec = 0.1;

      try {
        const speed1Grid = extractLapSpeed(store, idx1, lapLength, tStart, tEnd, stepSec, distGrid);
        const speed2Grid = extractLapSpeed(store, idx2, lapLength, tStart, tEnd, stepSec, distGrid);

        const deltaGrid = computeCumulativeDelta(speed1Grid, speed2Grid, bucketMeters);
        const miniSectors = computeMiniSectorWinners(speed1Grid, speed2Grid, 10, d1.code, d2.code);

        setH2hData({
          speedChart: [distGrid, speed1Grid, speed2Grid],
          deltaChart: [distGrid, deltaGrid],
          miniSectorWinners: miniSectors.map((ms) => ({
            sector: ms.sector,
            winner: ms.winner,
            advantage: ms.advantageKmh,
          })),
        });
      } catch {
        // ignore
      }
    };

    computeH2H(clock.currentTime);

    // 10 Hz (100ms) throttled updates for smooth, responsive curve tracking
    const unsub = clock.subscribeThrottled((t) => {
      computeH2H(t);
    }, 10);

    return unsub;
  }, [store, clock, idx1, idx2, d1.code, d2.code, lapLength, distGrid, bucketMeters]);

  const color1 = d1.color || 'var(--accent)';
  const color2 = d2.color || 'var(--insight)';

  // Memoize series definitions to prevent uPlot destruction on state updates
  const deltaSeries = useMemo<SeriesConfig[]>(
    () => [
      {
        label: `Δt (${d1.code} vs ${d2.code})`,
        color: 'var(--accent)',
        unit: 's',
        width: 2,
      },
    ],
    [d1.code, d2.code],
  );

  const speedSeries = useMemo<SeriesConfig[]>(
    () => [
      { label: `${d1.code} Speed`, color: color1, unit: ' km/h', width: 2 },
      { label: `${d2.code} Speed`, color: color2, unit: ' km/h', width: 2 },
    ],
    [d1.code, d2.code, color1, color2],
  );

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-1)] text-[var(--text-1)] select-none overflow-y-auto">
      {/* 1. Header Driver Selectors */}
      <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--text-2)]">
            HEAD-TO-HEAD TELEMETRY
          </span>
          <button
            type="button"
            onClick={() => {
              if (snapshot && snapshot.orderByPosition) {
                const p1 = drivers[snapshot.orderByPosition[0]];
                const p2 = drivers[snapshot.orderByPosition[1]];
                if (p1 && p2) {
                  setDriver1Code(p1.code);
                  setDriver2Code(p2.code);
                }
              }
            }}
            className="px-2 py-0.5 rounded-xs bg-[var(--surface-3)] hover:bg-[var(--surface-4)] border border-[var(--border)] text-[10px] font-mono font-bold text-[var(--accent)] cursor-pointer ml-1"
            title="Set to P1 vs P2 Lead Battle"
          >
            P1 vs P2
          </button>
        </div>

        {/* Driver Select Dropdowns */}
        <div className="flex items-center gap-2">
          {/* Driver 1 */}
          <select
            value={driver1Code}
            onChange={(e) => setDriver1Code(e.target.value)}
            className="bg-[var(--surface-3)] border border-[var(--border-hi)] rounded-xs px-2 py-0.5 font-mono font-bold text-xs text-[var(--text-1)] outline-none cursor-pointer"
            style={{ borderLeftColor: color1, borderLeftWidth: 3 }}
          >
            {drivers.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} (#{d.number})
              </option>
            ))}
          </select>

          <span className="text-[10px] font-mono text-[var(--text-3)] font-bold">VS</span>

          {/* Driver 2 */}
          <select
            value={driver2Code}
            onChange={(e) => setDriver2Code(e.target.value)}
            className="bg-[var(--surface-3)] border border-[var(--border-hi)] rounded-xs px-2 py-0.5 font-mono font-bold text-xs text-[var(--text-1)] outline-none cursor-pointer"
            style={{ borderLeftColor: color2, borderLeftWidth: 3 }}
          >
            {drivers.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} (#{d.number})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. Mini-Sector Dominance Summary */}
      <div className="p-2.5 bg-[var(--surface-1)] border-b border-[var(--border)] space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)]">
          <span>MINI-SECTOR PACE WINNERS</span>
          <span className="text-[var(--text-2)] font-bold">10 SECTOR SEGMENTS</span>
        </div>
        <div className="grid grid-cols-10 gap-1">
          {h2hData.miniSectorWinners.map((ms) => {
            const isD1 = ms.winner === d1.code;
            const col = isD1 ? color1 : color2;
            return (
              <div
                key={ms.sector}
                className="py-1 rounded-xs flex flex-col items-center justify-center text-center font-mono font-bold text-[9px] border"
                style={{
                  backgroundColor: `${col}1F`,
                  borderColor: `${col}66`,
                  color: col,
                }}
                title={`Sector ${ms.sector}: ${ms.winner} faster by ~${ms.advantage} km/h`}
              >
                <span>S{ms.sector}</span>
                <span className="text-[8px] font-black">{ms.winner}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Live Readouts Strip */}
      <div className="px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-around text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color1 }} />
          <span className="font-bold text-[var(--text-1)]">{d1.code}:</span>
          <span>{speed1} km/h</span>
        </div>

        <div className="flex items-center gap-1 px-2 py-0.5 rounded-xs bg-[var(--surface-3)] font-bold text-[11px]">
          <span className="text-[var(--text-3)]">Δ SPEED:</span>
          <span className={speedDelta >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
            {speedDelta >= 0 ? `+${speedDelta}` : speedDelta} km/h
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color2 }} />
          <span className="font-bold text-[var(--text-1)]">{d2.code}:</span>
          <span>{speed2} km/h</span>
        </div>
      </div>

      {/* 4. Delta Time Convention Banner (AC4 Required) */}
      <div className="px-3 py-1 bg-[var(--surface-1)] border-b border-[var(--border)] flex items-center justify-between text-[10px] font-mono text-[var(--text-3)]">
        <span className="font-bold text-[var(--text-2)]">DELTA TIME TRACE (Δt = t₁ - t₂)</span>
        <span className="text-[10px] text-[var(--accent)] font-semibold">
          [+] {d1.code} Slower / Behind · [-] {d1.code} Faster / Ahead
        </span>
      </div>

      {/* 5. Charts Stack */}
      <div className="flex-1 p-2 space-y-3">
        {/* Delta Time vs Distance */}
        <div className="rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] p-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1 px-1">
            <span className="font-bold text-[var(--text-2)]">TIME DELTA ALONG LAP</span>
            <span>Seconds (s)</span>
          </div>
          <DistanceChart
            data={[h2hData.deltaChart[0], h2hData.deltaChart[1]]}
            series={deltaSeries}
            corners={corners}
            currentDist={lapDist1}
            yUnit="s"
            height={110}
          />
        </div>

        {/* Speed Comparison vs Distance */}
        <div className="rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] p-2">
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-3)] mb-1 px-1">
            <span className="font-bold text-[var(--text-2)]">SPEED COMPARISON OVER DISTANCE</span>
            <span>km/h</span>
          </div>
          <DistanceChart
            data={[h2hData.speedChart[0], h2hData.speedChart[1], h2hData.speedChart[2]]}
            series={speedSeries}
            corners={corners}
            currentDist={lapDist1}
            yMin={0}
            yMax={360}
            yUnit=" km/h"
            height={130}
          />
        </div>
      </div>
    </div>
  );
};
