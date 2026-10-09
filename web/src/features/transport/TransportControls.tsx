import React, { useState, useEffect } from 'react';
import { PlaybackClock, PlaybackStatus } from '@/engine/PlaybackClock';
import { formatClockTime } from '../timeline/timelineMath';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Rewind,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Sparkles,
  Camera,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { LapRow } from '@/api/types';

export interface TransportControlsProps {
  clock: PlaybackClock | null;
  durationSec: number;
  playbackStatus?: PlaybackStatus;
  rate?: number;
  onRateChange?: (rate: number) => void;
  laps?: LapRow[];
  totalLaps?: number;
  onToggleKeyMoments?: () => void;
  keyMomentsOpen?: boolean;
  onExport?: () => void;
  isExporting?: boolean;
  className?: string;
}

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8, 16, 32];

export const TransportControls: React.FC<TransportControlsProps> = ({
  clock,
  durationSec,
  playbackStatus = 'paused',
  rate = 1.0,
  onRateChange,
  laps: _laps = [],
  totalLaps = 53,
  onToggleKeyMoments,
  keyMomentsOpen = false,
  onExport,
  isExporting = false,
  className,
}) => {
  const [speedPopoverOpen, setSpeedPopoverOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Subscribe to clock throttled for time display
  useEffect(() => {
    if (!clock) return;
    setCurrentTime(clock.currentTime);
    const unsub = clock.subscribeThrottled((t) => {
      setCurrentTime(t);
    }, 10);
    return unsub;
  }, [clock]);

  const isPlaying = playbackStatus === 'playing';
  const isBuffering = playbackStatus === 'buffering';

  const handlePlayToggle = () => {
    if (!clock) return;
    clock.toggle();
  };

  const handleRestart = () => {
    if (!clock) return;
    clock.restart();
  };

  const handleStepSeconds = (seconds: number) => {
    if (!clock) return;
    clock.stepSeconds(seconds);
  };

  const handleStepLap = (direction: -1 | 1) => {
    if (!clock || durationSec <= 0) return;
    const avgLapTime = durationSec / Math.max(1, totalLaps);
    const currentEstLap = Math.floor(currentTime / avgLapTime);
    const targetLap = Math.max(0, Math.min(totalLaps - 1, currentEstLap + direction));
    const targetT = targetLap * avgLapTime;
    clock.seek(targetT);
  };

  const handleSetRate = (newRate: number) => {
    if (clock) {
      clock.setRate(newRate);
    }
    if (onRateChange) {
      onRateChange(newRate);
    }
    setSpeedPopoverOpen(false);
  };

  return (
    <div
      className={cn(
        'h-12 px-4 bg-[var(--surface-2)] border-t border-[var(--border-hi)] flex items-center justify-between select-none z-20',
        className,
      )}
      aria-label="Replay Transport Bar"
    >
      {/* 1. Left Cluster: Restart, Lap Skip, Step Seconds */}
      <div className="flex items-center gap-1.5">
        {/* Restart Button */}
        <button
          type="button"
          onClick={handleRestart}
          title="Restart Replay (R)"
          aria-label="Restart Replay"
          className="p-1.5 rounded-xs text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* -1 Lap */}
        <button
          type="button"
          onClick={() => handleStepLap(-1)}
          title="Previous Lap (Shift + Left Arrow)"
          aria-label="Previous Lap"
          className="p-1.5 rounded-xs text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer flex items-center"
        >
          <ChevronLeft className="w-4 h-4 -mr-2" />
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* -10s */}
        <button
          type="button"
          onClick={() => handleStepSeconds(-10)}
          title="Back 10s (Left Arrow)"
          aria-label="Seek back 10 seconds"
          className="p-1.5 rounded-xs text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono font-bold"
        >
          <Rewind className="w-4 h-4" />
          <span>-10s</span>
        </button>
      </div>

      {/* 2. Center: Play/Pause with Halo + Clock Readout */}
      <div className="flex items-center gap-4">
        {/* Main Play / Pause Button with Broadcast Glow */}
        <button
          type="button"
          onClick={handlePlayToggle}
          title={isPlaying ? 'Pause Replay (Space)' : 'Play Replay (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          data-playing={isPlaying}
          data-cursor="link"
          className={cn(
            'play-btn',
            'w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer',
            isPlaying
              ? 'bg-[var(--surface-3)] text-[var(--text-1)] border border-[var(--border-strong)] shadow-[0_0_12px_rgba(255,255,255,0.15)]'
              : 'bg-[var(--accent)] text-white shadow-[0_0_16px_var(--accent-glow)] hover:scale-105 active:scale-95',
          )}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        {/* Clock Readout */}
        <div className="flex items-baseline gap-1.5 font-mono tabular-nums text-xs">
          <span className="font-bold text-sm text-[var(--text-1)]">
            {formatClockTime(currentTime)}
          </span>
          <span className="text-[var(--text-3)]">/</span>
          <span className="text-[var(--text-3)]">
            {formatClockTime(durationSec)}
          </span>
          {isBuffering && (
            <span className="ml-2 text-[10px] font-bold text-[var(--warning)] animate-pulse">
              [BUFFERING]
            </span>
          )}
        </div>
      </div>

      {/* 3. Right Cluster: Step +10s, +1 Lap, Speed Selector Popover, Key Moments Toggle */}
      <div className="flex items-center gap-2">
        {/* +10s */}
        <button
          type="button"
          onClick={() => handleStepSeconds(10)}
          title="Forward 10s (Right Arrow)"
          aria-label="Seek forward 10 seconds"
          className="p-1.5 rounded-xs text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-mono font-bold"
        >
          <span>+10s</span>
          <FastForward className="w-4 h-4" />
        </button>

        {/* +1 Lap */}
        <button
          type="button"
          onClick={() => handleStepLap(1)}
          title="Next Lap (Shift + Right Arrow)"
          aria-label="Next Lap"
          className="p-1.5 rounded-xs text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer flex items-center"
        >
          <ChevronRight className="w-4 h-4" />
          <ChevronRight className="w-4 h-4 -ml-2" />
        </button>

        <div className="w-[1px] h-5 bg-[var(--border)] mx-1" />

        {/* Speed Rate Popover */}
        <Popover.Root open={speedPopoverOpen} onOpenChange={setSpeedPopoverOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={cn(
                'px-2 py-1 rounded-xs font-mono text-xs font-bold border transition-colors flex items-center gap-1.5 cursor-pointer',
                rate !== 1.0
                  ? 'bg-[var(--surface-3)] border-[var(--accent)] text-[var(--accent)]'
                  : 'bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-1)] hover:border-[var(--border-hi)]',
              )}
              title="Playback Speed (Up/Down or 1-4)"
              aria-label="Playback speed"
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>{rate}×</span>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              side="top"
              align="end"
              sideOffset={8}
              className="bg-[var(--surface-2)] border border-[var(--border-hi)] rounded-[var(--r-md)] p-2 shadow-2xl z-50 flex flex-col gap-1 min-w-[120px] animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] px-2 py-1">
                SPEED PRESETS
              </div>
              <div className="grid grid-cols-2 gap-1">
                {SPEED_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSetRate(s)}
                    className={cn(
                      'px-2 py-1 rounded-xs text-xs font-mono font-semibold transition-colors cursor-pointer text-center',
                      rate === s
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)]',
                    )}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {/* Key Moments Drawer Toggle */}
        {onToggleKeyMoments && (
          <button
            type="button"
            onClick={onToggleKeyMoments}
            title="Toggle Key Moments Drawer"
            aria-label="Toggle Key Moments Drawer"
            className={cn(
              'px-2.5 py-1 rounded-xs text-xs font-mono font-bold border transition-colors flex items-center gap-1.5 cursor-pointer',
              keyMomentsOpen
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                : 'bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-[var(--border-hi)]',
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">MOMENTS</span>
          </button>
        )}

        {/* Export Workspace Snapshot */}
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            disabled={isExporting}
            title="Export Workspace Screenshot (P)"
            aria-label="Export screenshot"
            className={cn(
              'px-2.5 py-1 rounded-xs text-xs font-mono font-bold border transition-colors flex items-center gap-1.5 cursor-pointer',
              isExporting
                ? 'bg-[var(--surface-4)] text-[var(--text-3)] border-[var(--border)] cursor-not-allowed'
                : 'bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-[var(--border-hi)]',
            )}
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">EXPORT</span>
          </button>
        )}
      </div>
    </div>
  );
};
