import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { KeyMomentsDrawer } from '../KeyMomentsDrawer';
import { RecentMomentsCard } from '../RecentMomentsCard';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { RaceEvent } from '@/api/types';

describe('Key Moments', () => {
  const sampleEvents: RaceEvent[] = [
    { id: '1', t: 15, type: 'overtake', lap: 1, label: 'VER overtakes NOR', severity: 'major', drivers: ['VER', 'NOR'] },
    { id: '2', t: 45, type: 'safety_car', lap: 2, label: 'Safety Car Deployed', severity: 'major' },
    { id: '3', t: 80, type: 'pit_in', lap: 4, label: 'HAM Pit In', severity: 'minor', drivers: ['HAM'] },
  ];

  it('renders KeyMomentsDrawer when open', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    const onClose = vi.fn();

    render(
      <KeyMomentsDrawer
        open={true}
        onClose={onClose}
        events={sampleEvents}
        clock={clock}
      />,
    );

    expect(screen.getByText('KEY MOMENTS')).toBeInTheDocument();
    expect(screen.getByText('VER overtakes NOR')).toBeInTheDocument();
    expect(screen.getByText('Safety Car Deployed')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Close Key Moments Drawer');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('filters moments in drawer by event type', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    render(
      <KeyMomentsDrawer
        open={true}
        onClose={vi.fn()}
        events={sampleEvents}
        clock={clock}
      />,
    );

    const overtakesFilter = screen.getByRole('button', { name: 'Overtakes' });
    fireEvent.click(overtakesFilter);

    expect(screen.getByText('VER overtakes NOR')).toBeInTheDocument();
    expect(screen.queryByText('Safety Car Deployed')).not.toBeInTheDocument();
  });

  it('seeks clock when card is clicked in RecentMomentsCard', () => {
    const clock = new PlaybackClock({ durationSec: 100 });
    const seekSpy = vi.spyOn(clock, 'seek');

    render(
      <RecentMomentsCard
        events={sampleEvents}
        clock={clock}
        currentTime={50}
      />,
    );

    const card = screen.getByText('Safety Car Deployed');
    fireEvent.click(card);

    // event is at t=45, seeks to t-3 = 42
    expect(seekSpy).toHaveBeenCalledWith(42);
  });
});
