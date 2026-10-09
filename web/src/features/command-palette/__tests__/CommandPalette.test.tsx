import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { CommandPalette } from '../CommandPalette';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { DriverInfo, RaceEvent } from '@/api/types';

describe('CommandPalette', () => {
  const sampleDrivers: DriverInfo[] = [
    { code: 'VER', number: 1, fullName: 'Max Verstappen', team: 'Red Bull Racing' },
    { code: 'HAM', number: 44, fullName: 'Lewis Hamilton', team: 'Ferrari' },
  ];

  const sampleEvents: RaceEvent[] = [
    { id: '1', t: 45, type: 'safety_car', lap: 2, label: 'Safety Car Deployed', severity: 'major' },
    { id: '2', t: 60, type: 'overtake', lap: 3, label: 'VER passed HAM', severity: 'major', drivers: ['VER', 'HAM'] },
  ];

  it('renders commands and allows searching', () => {
    const clock = new PlaybackClock({ durationSec: 120 });
    const onOpenChange = vi.fn();

    render(
      <CommandPalette
        open={true}
        onOpenChange={onOpenChange}
        clock={clock}
        drivers={sampleDrivers}
        events={sampleEvents}
      />,
    );

    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument();
    expect(screen.getByText('Restart Replay (T+0)')).toBeInTheDocument();
    expect(screen.getByText('Select Max Verstappen (VER)')).toBeInTheDocument();

    // Search for Hamilton
    const input = screen.getByPlaceholderText(/Type a command/i);
    fireEvent.change(input, { target: { value: 'Hamilton' } });

    expect(screen.getByText('Select Lewis Hamilton (HAM)')).toBeInTheDocument();
    expect(screen.queryByText('Select Max Verstappen (VER)')).not.toBeInTheDocument();
  });

  it('executes command on click', () => {
    const clock = new PlaybackClock({ durationSec: 120 });
    const restartSpy = vi.spyOn(clock, 'restart');
    const onOpenChange = vi.fn();

    render(
      <CommandPalette
        open={true}
        onOpenChange={onOpenChange}
        clock={clock}
        drivers={sampleDrivers}
        events={sampleEvents}
      />,
    );

    const restartCmd = screen.getByText('Restart Replay (T+0)');
    fireEvent.click(restartCmd);

    expect(restartSpy).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
