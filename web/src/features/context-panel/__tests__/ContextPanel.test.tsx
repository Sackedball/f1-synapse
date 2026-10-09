import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextPanel } from '../ContextPanel';
import { createSnapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';
import { useSelectionStore } from '@/stores';

describe('ContextPanel component', () => {
  const drivers: DriverInfo[] = [
    { code: 'VER', fullName: 'Max Verstappen', number: 1, team: 'Red Bull Racing', color: '#3671c6', index: 0 },
    { code: 'NOR', fullName: 'Lando Norris', number: 4, team: 'McLaren', color: '#ff8000', index: 1 },
    { code: 'LEC', fullName: 'Charles Leclerc', number: 16, team: 'Ferrari', color: '#e8002d', index: 2 },
  ];

  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('renders race summary when no driver is selected', () => {
    const snapshot = createSnapshot(3);
    snapshot.n = 3;
    snapshot.position[0] = 1;
    snapshot.position[1] = 2;
    snapshot.position[2] = 3;
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.status.fill(1);

    render(
      <ContextPanel
        drivers={drivers}
        snapshot={snapshot}
        store={null}
        weather={[]}
        totalLaps={53}
      />,
    );

    expect(screen.getByText('RACE CONTROL SUMMARY')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE RUNNERS')).toBeInTheDocument();
    expect(screen.getByText('TOTAL LAPS')).toBeInTheDocument();
    expect(screen.getByText('MAX VERSTAPPEN')).toBeInTheDocument();
  });

  it('renders single driver telemetry card when one driver is selected', () => {
    const snapshot = createSnapshot(3);
    snapshot.n = 3;
    snapshot.position[0] = 1;
    snapshot.position[1] = 2;
    snapshot.position[2] = 3;
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.status.fill(1);
    snapshot.speed[1] = 312;
    snapshot.gear[1] = 8;
    snapshot.drs[1] = 2; // OPEN
    snapshot.tyre[1] = 1; // M
    snapshot.tyreLife[1] = 14;

    useSelectionStore.getState().setSelectedDriver('NOR');

    render(
      <ContextPanel
        drivers={drivers}
        snapshot={snapshot}
        store={null}
        weather={[]}
        totalLaps={53}
      />,
    );

    expect(screen.getByText('DRIVER TELEMETRY FOCUS')).toBeInTheDocument();
    expect(screen.getByText('LANDO NORRIS')).toBeInTheDocument();
    expect(screen.getByText('McLaren')).toBeInTheDocument();
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('DRS OPEN')).toBeInTheDocument();
    expect(screen.getByText('14 LAPS OLD')).toBeInTheDocument();
  });

  it('renders side-by-side comparison with central deltas when 2 drivers selected', () => {
    const snapshot = createSnapshot(3);
    snapshot.n = 3;
    snapshot.position[0] = 1;
    snapshot.position[1] = 2;
    snapshot.position[2] = 3;
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.status.fill(1);
    snapshot.speed[0] = 320;
    snapshot.speed[1] = 310;
    snapshot.gapLeader[0] = 0;
    snapshot.gapLeader[1] = 1.25;

    useSelectionStore.getState().toggleCompareDriver('VER');
    useSelectionStore.getState().toggleCompareDriver('NOR');

    render(
      <ContextPanel
        drivers={drivers}
        snapshot={snapshot}
        store={null}
        weather={[]}
        totalLaps={53}
      />,
    );

    expect(screen.getByText(/DRIVER COMPARE \(2\/4\)/i)).toBeInTheDocument();
    expect(screen.getByText('SPEED Δ')).toBeInTheDocument();
    expect(screen.getByText('+10 km/h')).toBeInTheDocument();
    expect(screen.getByText('TIME GAP')).toBeInTheDocument();
  });

  it('clears selection when clicking Clear button', () => {
    useSelectionStore.getState().toggleCompareDriver('VER');
    useSelectionStore.getState().toggleCompareDriver('NOR');

    render(
      <ContextPanel
        drivers={drivers}
        snapshot={null}
        store={null}
        weather={[]}
        totalLaps={53}
      />,
    );

    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearBtn);

    expect(useSelectionStore.getState().compareDrivers).toHaveLength(0);
  });
});
