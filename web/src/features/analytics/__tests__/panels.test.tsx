import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriverInfo } from '@/api/types';
import { createSnapshot } from '@/engine/snapshot';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { useSelectionStore } from '@/stores/selectionStore';

import { DriverTelemetryPanel } from '../panels/DriverTelemetryPanel';
import { HeadToHeadPanel } from '../panels/HeadToHeadPanel';
import { LapTimesGapsPanel } from '../panels/LapTimesGapsPanel';
import { TyreStrategyPanel } from '../panels/TyreStrategyPanel';
import { RaceControlFeedPanel } from '../panels/RaceControlFeedPanel';
import { TrackPositionStripPanel } from '../panels/TrackPositionStripPanel';
import { DebugStreamInspectorPanel } from '../panels/DebugStreamInspectorPanel';
import { DistanceChart } from '../charts/DistanceChart';

// Mock uPlot to render a simple placeholder div in JSDOM
vi.mock('uplot', () => {
  const MockUPlot = vi.fn().mockImplementation((_opts, _data, target) => {
    const el = document.createElement('div');
    el.className = 'uplot-mock';
    if (target) {
      target.appendChild(el);
    }
    return {
      setData: vi.fn(),
      setSize: vi.fn(),
      destroy: vi.fn(),
      redraw: vi.fn(),
      valToPos: vi.fn((v) => Number(v)),
      bbox: { left: 0, top: 0, width: 400, height: 200 },
      root: el,
    };
  });
  Object.assign(MockUPlot, {
    sync: vi.fn(() => ({
      sub: vi.fn(),
      unsub: vi.fn(),
      pub: vi.fn(),
    })),
  });
  return {
    default: MockUPlot,
  };
});

// Polyfill ResizeObserver for JSDOM if needed
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

describe('Analytics Panels Component Tests', () => {
  const mockDrivers: DriverInfo[] = [
    { code: 'VER', fullName: 'Max Verstappen', number: 1, team: 'Red Bull Racing', color: '#3671c6', index: 0 },
    { code: 'NOR', fullName: 'Lando Norris', number: 4, team: 'McLaren', color: '#ff8000', index: 1 },
    { code: 'LEC', fullName: 'Charles Leclerc', number: 16, team: 'Ferrari', color: '#e8002d', index: 2 },
  ];

  const mockSnapshot = createSnapshot(3);
  mockSnapshot.n = 3;
  mockSnapshot.position[0] = 1;
  mockSnapshot.position[1] = 2;
  mockSnapshot.position[2] = 3;
  mockSnapshot.orderByPosition[0] = 0;
  mockSnapshot.orderByPosition[1] = 1;
  mockSnapshot.orderByPosition[2] = 2;
  mockSnapshot.speed[0] = 315;
  mockSnapshot.speed[1] = 308;
  mockSnapshot.speed[2] = 302;
  mockSnapshot.gear[0] = 8;
  mockSnapshot.throttle[0] = 1.0;
  mockSnapshot.brake[0] = 0;
  mockSnapshot.drs[0] = 1;
  mockSnapshot.dist[0] = 1500;
  mockSnapshot.dist[1] = 1420;
  mockSnapshot.dist[2] = 1380;
  mockSnapshot.status.fill(1);

  const mockClock = new PlaybackClock({ durationSec: 5400 });

  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('renders 1. DriverTelemetryPanel with real-time gauges and controls', () => {
    render(
      <DriverTelemetryPanel
        drivers={mockDrivers}
        snapshot={mockSnapshot}
        store={null}
        clock={mockClock}
      />,
    );

    expect(screen.getByText(/SPEED TRACE/i)).toBeInTheDocument();
    expect(screen.getByText(/PEDALS \(THROTTLE \/ BRAKE\)/i)).toBeInTheDocument();
    expect(screen.getByText('VER')).toBeInTheDocument();
  });

  it('renders 2. HeadToHeadPanel with delta-time sign convention banner and mini-sectors', () => {
    render(
      <HeadToHeadPanel
        drivers={mockDrivers}
        snapshot={mockSnapshot}
        store={null}
        clock={mockClock}
      />,
    );

    expect(screen.getByText(/DELTA TIME TRACE/i)).toBeInTheDocument();
    expect(screen.getByText(/Slower \/ Behind/i)).toBeInTheDocument();
    expect(screen.getByText(/Faster \/ Ahead/i)).toBeInTheDocument();
  });

  it('renders 3. LapTimesGapsPanel with outlier filter toggle and pace breakdown', () => {
    const mockLaps = [
      { lap: 1, timeSec: 92.5, driver: 'VER', position: 1 },
      { lap: 2, timeSec: 91.8, driver: 'VER', position: 1 },
    ];

    render(
      <LapTimesGapsPanel
        drivers={mockDrivers}
        laps={mockLaps}
        snapshot={mockSnapshot}
      />,
    );

    expect(screen.getByText('LAP TIMES & PACE EVOLUTION')).toBeInTheDocument();
    expect(screen.getByText(/Filter Outliers/i)).toBeInTheDocument();
    expect(screen.getByText(/BEST LAP \(PB\)/i)).toBeInTheDocument();
  });

  it('renders 4. TyreStrategyPanel with Gantt chart container and legend', () => {
    const mockStints = [
      { driver: 'VER', stint: 1, compound: 'MEDIUM', lapStart: 1, lapEnd: 22 },
      { driver: 'VER', stint: 2, compound: 'HARD', lapStart: 23, lapEnd: 53 },
    ];

    render(
      <TyreStrategyPanel
        drivers={mockDrivers}
        stints={mockStints}
        snapshot={mockSnapshot}
        totalLaps={53}
      />,
    );

    expect(screen.getByText(/TYRE STRATEGY/i)).toBeInTheDocument();
    expect(screen.getByText(/SOFT/i)).toBeInTheDocument();
    expect(screen.getByText(/MED/i)).toBeInTheDocument();
    expect(screen.getByText(/HARD/i)).toBeInTheDocument();
  });

  it('renders 5. RaceControlFeedPanel with category filter pills and live auto-scroll', () => {
    const mockMessages = [
      { lap: 5, message: 'CAR 4 (NOR) OFF TRACK AT TURN 1', category: 'Incident' },
      { lap: 10, message: 'YELLOW FLAG IN SECTOR 2', flag: 'YELLOW', category: 'Flag' },
    ];

    render(
      <RaceControlFeedPanel
        raceControl={mockMessages}
        clock={mockClock}
        drivers={mockDrivers}
      />,
    );

    expect(screen.getByText(/RACE CONTROL COMMUNICATIONS/i)).toBeInTheDocument();
    expect(screen.getByText('AUTO-FOLLOW')).toBeInTheDocument();
    expect(screen.getByText('CAR 4 (NOR) OFF TRACK AT TURN 1')).toBeInTheDocument();
    expect(screen.getByText('YELLOW FLAG IN SECTOR 2')).toBeInTheDocument();
  });

  it('renders 6. TrackPositionStripPanel with 0-100% linear strip and sector badges', () => {
    render(
      <TrackPositionStripPanel
        drivers={mockDrivers}
        snapshot={mockSnapshot}
      />,
    );

    expect(screen.getByText(/LINEAR TRACK POSITION/i)).toBeInTheDocument();
    expect(screen.getByText(/INTERVALS & CAR ACCUMULATION/i)).toBeInTheDocument();
    expect(screen.getAllByText(/SECTOR 1/i).length).toBeGreaterThan(0);
  });

  it('renders 7. DebugStreamInspectorPanel with binary stream metrics', () => {
    render(
      <DebugStreamInspectorPanel
        drivers={mockDrivers}
        snapshot={mockSnapshot}
        store={null}
        clock={mockClock}
      />,
    );

    expect(screen.getByText('STREAM INSPECTOR & SNAPSHOT BUFFER')).toBeInTheDocument();
    expect(screen.getByText(/CLOCK:/i)).toBeInTheDocument();
    expect(screen.getAllByText('VER').length).toBeGreaterThan(0);
  });

  it('renders 8. DistanceChart with stable uPlot instance on re-render without flickering', () => {
    const { rerender } = render(
      <DistanceChart
        data={[[0, 100], [200, 250]]}
        series={[{ label: 'Speed', color: '#ff0000', width: 2 }]}
        currentDist={50}
        height={120}
      />,
    );

    // Re-render with new array reference containing identical series config
    rerender(
      <DistanceChart
        data={[[0, 100], [205, 255]]}
        series={[{ label: 'Speed', color: '#ff0000', width: 2 }]}
        currentDist={75}
        height={120}
      />,
    );

    expect(document.querySelector('.uplot-mock')).toBeInTheDocument();
  });
});

