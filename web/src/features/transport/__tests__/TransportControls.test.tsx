import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { TransportControls } from '../TransportControls';
import { PlaybackClock } from '@/engine/PlaybackClock';

describe('TransportControls', () => {
  it('renders all transport buttons and clock time', () => {
    const clock = new PlaybackClock({ durationSec: 120, initialTime: 15 });
    render(
      <TransportControls
        clock={clock}
        durationSec={120}
        rate={1.0}
      />,
    );

    expect(screen.getByLabelText('Restart Replay')).toBeInTheDocument();
    expect(screen.getByLabelText('Seek back 10 seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.getByLabelText('Seek forward 10 seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('Playback speed')).toBeInTheDocument();
    expect(screen.getByText('00:15')).toBeInTheDocument();
    expect(screen.getByText('02:00')).toBeInTheDocument();
  });

  it('toggles play/pause when main button is clicked', () => {
    const clock = new PlaybackClock({ durationSec: 120 });
    const toggleSpy = vi.spyOn(clock, 'toggle');

    render(
      <TransportControls
        clock={clock}
        durationSec={120}
        playbackStatus="paused"
      />,
    );

    const playBtn = screen.getByLabelText('Play');
    fireEvent.click(playBtn);
    expect(toggleSpy).toHaveBeenCalled();
  });

  it('steps seconds when -10s and +10s buttons are clicked', () => {
    const clock = new PlaybackClock({ durationSec: 120 });
    const stepSpy = vi.spyOn(clock, 'stepSeconds');

    render(
      <TransportControls
        clock={clock}
        durationSec={120}
      />,
    );

    const backBtn = screen.getByLabelText('Seek back 10 seconds');
    fireEvent.click(backBtn);
    expect(stepSpy).toHaveBeenCalledWith(-10);

    const fwdBtn = screen.getByLabelText('Seek forward 10 seconds');
    fireEvent.click(fwdBtn);
    expect(stepSpy).toHaveBeenCalledWith(10);
  });
});
