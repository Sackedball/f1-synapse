import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { RaceTimeline } from '../RaceTimeline';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { RaceEvent, DriverInfo } from '@/api/types';

describe('RaceTimeline', () => {
  const sampleEvents: RaceEvent[] = [
    { id: 'ev1', t: 15, type: 'overtake', lap: 1, label: 'VER passed NOR', severity: 'major', drivers: ['VER', 'NOR'] },
    { id: 'ev2', t: 45, type: 'safety_car', lap: 2, label: 'Safety Car Deployed', severity: 'major' },
    { id: 'ev3', t: 75, type: 'pit_in', lap: 4, label: 'HAM in pit', severity: 'minor', drivers: ['HAM'] },
  ];

  const sampleDrivers: DriverInfo[] = [
    { code: 'VER', number: 1, fullName: 'Max Verstappen', team: 'Red Bull Racing', color: '#3671C6' },
    { code: 'NOR', number: 4, fullName: 'Lando Norris', team: 'McLaren', color: '#FF8000' },
    { code: 'HAM', number: 44, fullName: 'Lewis Hamilton', team: 'Ferrari', color: '#E80020' },
  ];

  it('renders correctly with events and markers', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    render(
      <RaceTimeline
        clock={clock}
        durationSec={100}
        events={sampleEvents}
        drivers={sampleDrivers}
      />,
    );

    // Filter buttons should be rendered
    expect(screen.getByText('FILTERS')).toBeInTheDocument();
    expect(screen.getByText('Overtakes')).toBeInTheDocument();
    expect(screen.getByText('Pits')).toBeInTheDocument();
    expect(screen.getByText('Safety Car')).toBeInTheDocument();
  });

  it('filters events when filter chips are clicked', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    render(
      <RaceTimeline
        clock={clock}
        durationSec={100}
        events={sampleEvents}
        drivers={sampleDrivers}
      />,
    );

    const overtakeBtn = screen.getByText('Overtakes');
    fireEvent.click(overtakeBtn);

    // Active filter style applied
    expect(overtakeBtn).toHaveClass('text-[var(--text-1)]');
  });

  it('handles zoom in and out interactions', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    render(
      <RaceTimeline
        clock={clock}
        durationSec={100}
        events={sampleEvents}
        drivers={sampleDrivers}
      />,
    );

    const zoomInBtn = screen.getByLabelText('Zoom in timeline');
    fireEvent.click(zoomInBtn);

    // RESET button appears when zoomed
    expect(screen.getByText('RESET')).toBeInTheDocument();

    const resetBtn = screen.getByText('RESET');
    fireEvent.click(resetBtn);
    expect(screen.queryByText('RESET')).not.toBeInTheDocument();
  });

  it('seeks clock when marker is clicked', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    const seekSpy = vi.spyOn(clock, 'seek');
    const onSelect = vi.fn();

    render(
      <RaceTimeline
        clock={clock}
        durationSec={100}
        events={sampleEvents}
        drivers={sampleDrivers}
        onEventSelect={onSelect}
      />,
    );

    // Find marker buttons
    const markerButtons = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('aria-label')?.includes('at 00:'),
    );
    expect(markerButtons.length).toBeGreaterThan(0);

    fireEvent.click(markerButtons[0]);
    expect(seekSpy).toHaveBeenCalled();
  });
});
