import { describe, it, expect } from 'vitest';
import { buildTowerRows } from '../sortTowerRows';
import { createSnapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';

describe('buildTowerRows', () => {
  const drivers: DriverInfo[] = [
    { code: 'VER', fullName: 'Max Verstappen', number: 1, team: 'Red Bull', color: '#3671c6', index: 0 },
    { code: 'NOR', fullName: 'Lando Norris', number: 4, team: 'McLaren', color: '#ff8000', index: 1 },
    { code: 'LEC', fullName: 'Charles Leclerc', number: 16, team: 'Ferrari', color: '#e8002d', index: 2 },
    { code: 'ALB', fullName: 'Alexander Albon', number: 23, team: 'Williams', color: '#64c4ff', index: 3 },
  ];

  it('orders active drivers by server position', () => {
    const snapshot = createSnapshot(4);
    snapshot.n = 4;
    snapshot.position[0] = 1; // VER P1
    snapshot.position[1] = 2; // NOR P2
    snapshot.position[2] = 3; // LEC P3
    snapshot.position[3] = 4; // ALB P4
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.orderByPosition[3] = 3;
    snapshot.status.fill(0); // all active (0 = running)

    const rows = buildTowerRows(drivers, snapshot, 'interval');
    expect(rows.map((r) => r.driver.code)).toEqual(['VER', 'NOR', 'LEC', 'ALB']);
    expect(rows[0].isLeader).toBe(true);
    expect(rows[0].position).toBe(1);
    expect(rows[1].position).toBe(2);
  });

  it('sinks retired drivers to the bottom with isRetired flag', () => {
    const snapshot = createSnapshot(4);
    snapshot.n = 4;
    // NOR was P2, but retired
    snapshot.position[0] = 1; // VER P1
    snapshot.position[1] = 2; // NOR
    snapshot.position[2] = 3; // LEC P3
    snapshot.position[3] = 4; // ALB P4
    snapshot.orderByPosition[0] = 0; // VER
    snapshot.orderByPosition[1] = 1; // NOR
    snapshot.orderByPosition[2] = 2; // LEC
    snapshot.orderByPosition[3] = 3; // ALB
    snapshot.status[0] = 0;
    snapshot.status[1] = 1; // NOR retired!
    snapshot.status[2] = 0;
    snapshot.status[3] = 0;

    const rows = buildTowerRows(drivers, snapshot, 'interval');
    // Active cars: VER, LEC, ALB; Retired: NOR
    expect(rows.map((r) => r.driver.code)).toEqual(['VER', 'LEC', 'ALB', 'NOR']);
    expect(rows[3].isRetired).toBe(true);
    expect(rows[3].driver.code).toBe('NOR');
  });

  it('correctly maps pit status', () => {
    const snapshot = createSnapshot(4);
    snapshot.n = 4;
    snapshot.status.fill(0);
    snapshot.inPit[2] = 1; // LEC in pit

    const rows = buildTowerRows(drivers, snapshot, 'interval');
    const lec = rows.find((r) => r.driver.code === 'LEC');
    expect(lec?.isInPit).toBe(true);
  });

  it('toggles between interval and leader gaps', () => {
    const snapshot = createSnapshot(4);
    snapshot.n = 4;
    snapshot.status.fill(0);
    snapshot.gapAhead[1] = 1.25;
    snapshot.gapLeader[1] = 1.25;
    snapshot.gapAhead[2] = 2.10;
    snapshot.gapLeader[2] = 3.35; // 1.25 + 2.10

    const intervalRows = buildTowerRows(drivers, snapshot, 'interval');
    const leaderRows = buildTowerRows(drivers, snapshot, 'leader');
    expect(intervalRows.find((r) => r.driver.code === 'LEC')?.gapSeconds).toBeCloseTo(2.10, 2);
    expect(leaderRows.find((r) => r.driver.code === 'LEC')?.gapSeconds).toBeCloseTo(3.35, 2);
  });
});
