import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimingTower } from '../TimingTower';
import { createSnapshot } from '@/engine/snapshot';
import { DriverInfo } from '@/api/types';
import { useSelectionStore } from '@/stores';

describe('TimingTower component', () => {
  const drivers: DriverInfo[] = [
    { code: 'VER', fullName: 'Max Verstappen', number: 1, team: 'Red Bull Racing', color: '#3671c6', index: 0 },
    { code: 'NOR', fullName: 'Lando Norris', number: 4, team: 'McLaren', color: '#ff8000', index: 1 },
    { code: 'LEC', fullName: 'Charles Leclerc', number: 16, team: 'Ferrari', color: '#e8002d', index: 2 },
  ];

  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
  });

  it('renders all driver rows in correct server position order', () => {
    const snapshot = createSnapshot(3);
    snapshot.n = 3;
    snapshot.position[0] = 1;
    snapshot.position[1] = 2;
    snapshot.position[2] = 3;
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.status.fill(0);
    snapshot.gapAhead[1] = 1.2;
    snapshot.gapAhead[2] = 2.5;

    render(<TimingTower drivers={drivers} snapshot={snapshot} totalLaps={53} />);

    expect(screen.getByText('VER')).toBeInTheDocument();
    expect(screen.getByText('NOR')).toBeInTheDocument();
    expect(screen.getByText('LEC')).toBeInTheDocument();
    expect(screen.getByText('LEADER')).toBeInTheDocument();
    expect(screen.getByText('+1.2')).toBeInTheDocument();
    expect(screen.getByText('+2.5')).toBeInTheDocument();
  });

  it('toggles gap mode between interval and leader when clicking INT / LDR buttons', () => {
    const snapshot = createSnapshot(3);
    snapshot.n = 3;
    snapshot.position[0] = 1;
    snapshot.position[1] = 2;
    snapshot.position[2] = 3;
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.status.fill(0);
    snapshot.gapAhead[1] = 1.2;
    snapshot.gapLeader[1] = 1.2;
    snapshot.gapAhead[2] = 2.5;
    snapshot.gapLeader[2] = 3.7;

    render(<TimingTower drivers={drivers} snapshot={snapshot} totalLaps={53} />);

    // Default: INTERVAL
    expect(screen.getByText('+2.5')).toBeInTheDocument();

    // Click LDR button
    const ldrBtn = screen.getByRole('button', { name: /Leader Gap Mode/i });
    fireEvent.click(ldrBtn);

    // Now shows gap to leader for LEC
    expect(screen.getByText('+3.7')).toBeInTheDocument();
  });

  it('selects driver when clicking row and syncs selectionStore', () => {
    const snapshot = createSnapshot(3);
    snapshot.n = 3;
    snapshot.position[0] = 1;
    snapshot.position[1] = 2;
    snapshot.position[2] = 3;
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.status.fill(0);

    render(<TimingTower drivers={drivers} snapshot={snapshot} totalLaps={53} />);

    const norRow = screen.getByText('NOR').closest('[role="row"]');
    expect(norRow).toBeInTheDocument();

    fireEvent.click(norRow!);
    expect(useSelectionStore.getState().selectedDriver).toBe('NOR');

    // Clicking again deselects
    fireEvent.click(norRow!);
    expect(useSelectionStore.getState().selectedDriver).toBeNull();
  });

  it('adds driver to comparison when shift-clicking row', () => {
    const snapshot = createSnapshot(3);
    snapshot.n = 3;
    snapshot.position[0] = 1;
    snapshot.position[1] = 2;
    snapshot.position[2] = 3;
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.status.fill(0);

    render(<TimingTower drivers={drivers} snapshot={snapshot} totalLaps={53} />);

    const verRow = screen.getByText('VER').closest('[role="row"]');
    const norRow = screen.getByText('NOR').closest('[role="row"]');

    fireEvent.click(verRow!, { shiftKey: true });
    fireEvent.click(norRow!, { shiftKey: true });

    expect(useSelectionStore.getState().compareDrivers).toContain('VER');
    expect(useSelectionStore.getState().compareDrivers).toContain('NOR');
  });

  it('supports keyboard navigation with arrow keys and Enter', () => {
    const snapshot = createSnapshot(3);
    snapshot.n = 3;
    snapshot.position[0] = 1;
    snapshot.position[1] = 2;
    snapshot.position[2] = 3;
    snapshot.orderByPosition[0] = 0;
    snapshot.orderByPosition[1] = 1;
    snapshot.orderByPosition[2] = 2;
    snapshot.status.fill(0);

    const { container } = render(<TimingTower drivers={drivers} snapshot={snapshot} totalLaps={53} />);
    const table = container.querySelector('[role="table"]');
    expect(table).toBeInTheDocument();

    // Down arrow to P1 (index 0), then Down arrow to P2 (index 1), then Enter
    fireEvent.keyDown(table!, { key: 'ArrowDown' });
    fireEvent.keyDown(table!, { key: 'ArrowDown' });
    fireEvent.keyDown(table!, { key: 'Enter' });

    expect(useSelectionStore.getState().selectedDriver).toBe('NOR');

    // Escape clears
    fireEvent.keyDown(table!, { key: 'Escape' });
    expect(useSelectionStore.getState().selectedDriver).toBeNull();
  });
});
