import { DriverInfo } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';

export interface TowerRowData {
  driver: DriverInfo;
  driverIndex: number;
  position: number;
  isLeader: boolean;
  isRetired: boolean;
  isInPit: boolean;
  gapSeconds: number;
  lapsBehind: number;
  tyreCompound: number;
  tyreLife: number;
  speed: number;
  positionDiff?: number; // >0 gained, <0 lost places
}

export function buildTowerRows(
  drivers: DriverInfo[],
  snapshot: Snapshot | null,
  gapMode: 'interval' | 'leader' = 'interval',
): TowerRowData[] {
  if (!snapshot || snapshot.n === 0 || drivers.length === 0) {
    // Return initial unranked list
    return drivers.map((driver, idx) => ({
      driver,
      driverIndex: idx,
      position: idx + 1,
      isLeader: idx === 0,
      isRetired: false,
      isInPit: false,
      gapSeconds: idx === 0 ? 0 : NaN,
      lapsBehind: 0,
      tyreCompound: 1,
      tyreLife: 0,
      speed: 0,
    }));
  }

  const n = Math.min(snapshot.n, drivers.length);
  const activeRows: TowerRowData[] = [];
  const retiredRows: TowerRowData[] = [];

  // Determine leader lap to calculate lapped cars
  const leaderIdx = snapshot.orderByPosition[0] ?? 0;
  const leaderLap = snapshot.lap[leaderIdx] || 1;

  for (let i = 0; i < n; i++) {
    const d = snapshot.orderByPosition[i];
    if (d < 0 || d >= drivers.length) continue;

    const driver = drivers[d];
    if (!driver) continue;

    const isInPit = snapshot.inPit[d] === 1;
    // Status: 0 running, 1 retired, 2 DNS
    const isRetired = snapshot.status[d] > 0;
    const driverLap = snapshot.lap[d] || 1;

    // Raw gap from snapshot
    let rawGap = gapMode === 'interval' ? snapshot.gapAhead[d] : snapshot.gapLeader[d];
    if (isNaN(rawGap) || rawGap < 0) {
      rawGap = 0;
    }

    const row: TowerRowData = {
      driver,
      driverIndex: d,
      position: 0,
      isLeader: false,
      isRetired,
      isInPit,
      gapSeconds: isRetired ? 0 : rawGap,
      lapsBehind: isRetired ? 0 : Math.max(0, leaderLap - driverLap),
      tyreCompound: snapshot.tyre[d] ?? 1,
      tyreLife: snapshot.tyreLife[d] ?? 0,
      speed: snapshot.speed[d] ?? 0,
    };

    if (isRetired) {
      retiredRows.push(row);
    } else {
      activeRows.push(row);
    }
  }

  // Active runners sequentially numbered P1..P(active)
  activeRows.forEach((row, idx) => {
    row.position = idx + 1;
    row.isLeader = idx === 0;
    if (idx === 0) {
      row.gapSeconds = 0;
      row.lapsBehind = 0;
    }
  });

  // Retired runners sink to bottom
  retiredRows.forEach((row, idx) => {
    row.position = activeRows.length + idx + 1;
    row.isLeader = false;
    row.gapSeconds = 0;
    row.lapsBehind = 0;
  });

  return [...activeRows, ...retiredRows];
}
