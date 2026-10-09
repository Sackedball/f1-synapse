import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RaceStrip } from '../RaceStrip';
import { createSnapshot } from '@/engine/snapshot';
import { SessionMeta, WeatherSample } from '@/api/types';

describe('RaceStrip component', () => {
  const meta: SessionMeta = {
    sessionName: '2026 Japanese Grand Prix',
    circuitName: 'Suzuka International Racing Course',
    round: 3,
    totalLaps: 53,
    fps: 25,
    totalFrames: 3000,
    chunkSize: 1500,
    drivers: [],
  };

  const weather: WeatherSample[] = [
    { t: 0, airTemp: 22.4, trackTemp: 34.8, humidity: 48, windSpeed: 2.1, windDirection: 140, rainfall: false },
    { t: 60, airTemp: 22.8, trackTemp: 35.2, humidity: 47, windSpeed: 2.4, windDirection: 145, rainfall: false },
  ];

  it('renders wordmark, session name, lap counter, and formatted race time', () => {
    const snapshot = createSnapshot(2);
    snapshot.n = 2;
    snapshot.lap[0] = 23;
    snapshot.orderByPosition[0] = 0;

    render(
      <RaceStrip
        meta={meta}
        snapshot={snapshot}
        weather={weather}
        playheadTime={75} // 00:01:15
        clockRate={1.0}
      />,
    );

    expect(screen.getByText('F1')).toBeInTheDocument();
    expect(screen.getByText('SYNAPSE')).toBeInTheDocument();
    expect(screen.getByText('2026 Japanese Grand Prix')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    expect(screen.getByText('/53')).toBeInTheDocument();
    expect(screen.getByText('00:01:15')).toBeInTheDocument();
  });

  it('renders flag pill and announces status changes via aria-live', () => {
    const snapshot = createSnapshot(2);
    snapshot.trackStatus = 2; // SC (normalized: 2 is SC)

    render(
      <RaceStrip
        meta={meta}
        snapshot={snapshot}
        weather={weather}
        playheadTime={30}
        clockRate={1.0}
      />,
    );

    expect(screen.getByText('SAFETY CAR')).toBeInTheDocument();
    expect(screen.getByText(/Current track status: SC/i)).toBeInTheDocument();
  });

  it('opens weather popover when clicking weather button', () => {
    render(
      <RaceStrip
        meta={meta}
        snapshot={null}
        weather={weather}
        playheadTime={10}
        clockRate={1.0}
      />,
    );

    const weatherBtn = screen.getByRole('button', { name: /Track Weather Telemetry/i });
    expect(weatherBtn).toBeInTheDocument();

    fireEvent.click(weatherBtn);
    expect(screen.getByText('CIRCUIT METEOROLOGY')).toBeInTheDocument();
    expect(screen.getByText('34.8°C')).toBeInTheDocument();
  });

  it('calls onOpenHelp when help button is clicked', () => {
    const handleHelp = vi.fn();
    render(
      <RaceStrip
        meta={meta}
        snapshot={null}
        weather={weather}
        playheadTime={0}
        clockRate={1.0}
        onOpenHelp={handleHelp}
      />,
    );

    const helpBtn = screen.getByRole('button', { name: /Keyboard Shortcuts and Help/i });
    fireEvent.click(helpBtn);
    expect(handleHelp).toHaveBeenCalledOnce();
  });
});
