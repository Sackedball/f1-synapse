import React, { useMemo } from 'react';
import { SessionMeta, WeatherSample } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { PlaybackStatus } from '@/engine/PlaybackClock';
import { FlagPill } from '@/components/ui/FlagPill';
import { Wordmark } from '@/components/ui/Wordmark';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover';
import { CloudRain, Wind, Droplets, Thermometer, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatTemp } from '@/utils/units';

interface RaceStripProps {
  meta: SessionMeta | null;
  snapshot: Snapshot | null;
  weather: WeatherSample[];
  playheadTime: number;
  clockRate: number;
  playbackStatus?: PlaybackStatus;
  activeTab?: 'race' | 'analysis';
  sid?: string;
  onOpenHelp?: () => void;
}

export const RaceStrip: React.FC<RaceStripProps> = ({
  meta,
  snapshot,
  weather,
  playheadTime,
  clockRate,
  playbackStatus = 'paused',
  activeTab = 'race',
  sid,
  onOpenHelp,
}) => {
  // Format race clock HH:MM:SS
  const raceClock = useMemo(() => {
    const totalSec = Math.max(0, Math.floor(playheadTime));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [playheadTime]);

  // Current lap calculation
  const currentLap = useMemo(() => {
    if (!snapshot || snapshot.n === 0) return 1;
    const leaderIdx = snapshot.orderByPosition[0] ?? 0;
    return Math.max(1, snapshot.lap[leaderIdx] || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, snapshot?.t]);

  const totalLaps = meta?.totalLaps || 53;

  // Track status mapping (normalized 0=green, 1=yellow, 2=SC, 3=red, 4/5=VSC)
  const flagStatus = useMemo<'GREEN' | 'YELLOW' | 'RED' | 'SC' | 'VSC'>(() => {
    if (!snapshot) return 'GREEN';
    const s = snapshot.trackStatus;
    if (s === 2) return 'SC';
    if (s === 3) return 'RED';
    if (s === 4 || s === 5 || s === 6 || s === 7) return 'VSC';
    if (s === 1) return 'YELLOW';
    return 'GREEN';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, snapshot?.t]);

  // Closest weather sample
  const currentWeather = useMemo(() => {
    if (weather.length === 0) return null;
    // Find sample closest to playheadTime
    let closest = weather[0];
    let minDiff = Math.abs(closest.t - playheadTime);
    for (let i = 1; i < weather.length; i++) {
      const diff = Math.abs(weather[i].t - playheadTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = weather[i];
      }
    }
    return closest;
  }, [weather, playheadTime]);

  const units = useSettingsStore((s) => s.units);

  return (
    <header
      className="h-14 bg-[var(--surface-1)] border-b border-[var(--border)] px-4 flex items-center justify-between select-none relative z-30"
      role="banner"
    >
      {/* 1px top highlight for depth */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-[var(--border-hi)] pointer-events-none" />

      {/* Left: Original F1 Synapse Wordmark & Session */}
      <div className="flex items-center gap-4">
        <Wordmark size="md" />

        <div className="hidden lg:flex items-center gap-2 border-l border-[var(--border)] pl-4">
          <span className="font-display font-bold text-sm tracking-wide text-[var(--text-1)]">
            {meta?.sessionName || 'RACE REPLAY'}
          </span>
          <span className="text-xs text-[var(--text-3)] font-mono">
            {meta?.circuitName ? `· ${meta.circuitName.toUpperCase()}` : ''}
          </span>
          {meta?.round && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-[var(--surface-2)] text-[var(--text-3)] border border-[var(--border)]">
              R{meta.round}
            </span>
          )}
        </div>

        {/* Workspace Mode Tabs */}
        {sid && (
          <nav aria-label="Workspace View Switcher" className="hidden sm:flex items-center bg-[var(--surface-3)] p-0.5 rounded-xs border border-[var(--border)] ml-1">
            <Link
              to={`/race/${sid}`}
              className={cn(
                'px-2.5 py-1 rounded-xs text-[10px] font-mono font-bold transition-colors',
                activeTab === 'race'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)]',
              )}
            >
              RACE
            </Link>
            <Link
              to={`/analysis/${sid}`}
              className={cn(
                'px-2.5 py-1 rounded-xs text-[10px] font-mono font-bold transition-colors',
                activeTab === 'analysis'
                  ? 'bg-[var(--accent)] text-white shadow-xs'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)]',
              )}
            >
              ANALYSIS
            </Link>
          </nav>
        )}
      </div>

      {/* Center: Live Flag Status Pill (announces changes via aria-live) */}
      <div className="flex items-center gap-3">
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          Current track status: {flagStatus}
        </div>
        <span key={flagStatus} className="flag-pop"><FlagPill status={flagStatus} size="md" /></span>
      </div>

      {/* Right: Telemetry Clock, Lap Counter, Weather & Rate */}
      <div className="flex items-center gap-3">
        {/* Lap Counter */}
        <div className="flex items-baseline gap-1 bg-[var(--surface-2)] px-2.5 py-1 rounded-[var(--r-md)] border border-[var(--border)]">
          <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)]">
            LAP
          </span>
          <span className="font-display font-black text-sm text-[var(--text-1)]">
            {currentLap}
          </span>
          <span className="font-mono text-xs text-[var(--text-3)]">/{totalLaps}</span>
        </div>

        {/* Race Elapsed Time */}
        <div className="hidden sm:flex items-center bg-[var(--surface-2)] px-2.5 py-1 rounded-[var(--r-md)] border border-[var(--border)]">
          <span className="font-mono font-bold text-xs tracking-wider text-[var(--text-1)]">
            {raceClock}
          </span>
        </div>

        {/* Playback Status & Rate Indicator */}
        <div className="hidden md:flex items-center gap-1.5 bg-[var(--surface-3)] px-2 py-1 rounded-[var(--r-sm)] border border-[var(--border)] text-[11px] font-mono font-bold text-[var(--text-2)]">
          {playbackStatus && (
            <span
              className={
                playbackStatus === 'playing'
                  ? 'text-[var(--success)]'
                  : 'text-[var(--text-3)]'
              }
            >
              {playbackStatus.toUpperCase()}
            </span>
          )}
          <span>{clockRate}×</span>
        </div>

        {/* Weather Chip with Popover Readout */}
        {currentWeather && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--r-md)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-xs transition-colors cursor-pointer"
                title="Click for full weather telemetry"
                aria-label="Track Weather Telemetry"
              >
                <Thermometer className="w-3.5 h-3.5 text-[var(--text-3)]" />
                <span className="font-mono font-bold text-[var(--text-1)]">
                  {formatTemp(currentWeather.airTemp ?? 0, units)}
                </span>
                {currentWeather.rainfall ? (
                  <CloudRain className="w-3.5 h-3.5 text-[var(--info)] ml-0.5" />
                ) : null}
              </button>
            </PopoverTrigger>

            <PopoverContent align="end" className="w-64 p-3 bg-[var(--surface-2)] border border-[var(--border-hi)] shadow-2xl">
              <div className="text-[10px] font-mono font-bold text-[var(--text-3)] uppercase tracking-wider mb-2">
                CIRCUIT METEOROLOGY
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between py-1 border-b border-[var(--border)]">
                  <span className="text-[var(--text-3)] flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-[var(--accent)]" /> Track Temp
                  </span>
                  <span className="font-mono font-bold text-[var(--text-1)]">
                    {formatTemp(currentWeather.trackTemp ?? 0, units, 1)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[var(--border)]">
                  <span className="text-[var(--text-3)] flex items-center gap-1.5">
                    <Thermometer className="w-3.5 h-3.5 text-[var(--text-2)]" /> Air Temp
                  </span>
                  <span className="font-mono font-bold text-[var(--text-1)]">
                    {formatTemp(currentWeather.airTemp ?? 0, units, 1)}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[var(--border)]">
                  <span className="text-[var(--text-3)] flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-[var(--insight)]" /> Humidity
                  </span>
                  <span className="font-mono font-bold text-[var(--text-1)]">
                    {currentWeather.humidity?.toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-[var(--border)]">
                  <span className="text-[var(--text-3)] flex items-center gap-1.5">
                    <Wind className="w-3.5 h-3.5 text-[var(--info)]" /> Wind Speed
                  </span>
                  <span className="font-mono font-bold text-[var(--text-1)]">
                    {currentWeather.windSpeed?.toFixed(1)} m/s
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[var(--text-3)]">Condition</span>
                  <span
                    className={`font-mono font-bold text-[10px] px-1.5 py-0.5 rounded-xs ${
                      currentWeather.rainfall
                        ? 'bg-[rgba(59,130,246,0.2)] text-[var(--info)]'
                        : 'bg-[rgba(0,210,106,0.15)] text-[var(--success)]'
                    }`}
                  >
                    {currentWeather.rainfall ? 'WET TRACK' : 'DRY TRACK'}
                  </span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Shortcuts / Help Button */}
        {onOpenHelp && (
          <button
            type="button"
            onClick={onOpenHelp}
            aria-label="Keyboard Shortcuts and Help"
            className="p-1.5 rounded-[var(--r-sm)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
