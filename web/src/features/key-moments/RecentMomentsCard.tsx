import React, { useMemo } from 'react';
import { RaceEvent, DriverInfo } from '@/api/types';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { formatTimelineTime } from '../timeline/timelineMath';
import { getEventIcon, getEventColor } from '../timeline/TimelineMarker';
import { Card } from '@/components/ui/Card';
import { Sparkles, ChevronRight } from 'lucide-react';
import { useSelectionStore } from '@/stores/selectionStore';
import { cn } from '@/lib/utils';

export interface RecentMomentsCardProps {
  events: RaceEvent[];
  clock: PlaybackClock | null;
  currentTime?: number;
  drivers?: DriverInfo[];
  onOpenAllMoments?: () => void;
  className?: string;
}

export const RecentMomentsCard: React.FC<RecentMomentsCardProps> = ({
  events,
  clock,
  currentTime = 0,
  drivers = [],
  onOpenAllMoments,
  className,
}) => {
  const { selectMomentDrivers } = useSelectionStore();

  const driverColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of drivers) {
      if (d.code && d.color) {
        map[d.code] = d.color;
      }
    }
    return map;
  }, [drivers]);

  // Find 3-4 most relevant recent events (prioritize events near currentTime, or most recent past events)
  const recentEvents = useMemo(() => {
    if (events.length === 0) return [];

    // Sort by proximity to currentTime
    const past = events.filter((e) => e.t <= currentTime + 2);
    if (past.length > 0) {
      return [...past].sort((a, b) => b.t - a.t).slice(0, 4);
    }
    // If before race start, show first few
    return events.slice(0, 4);
  }, [events, currentTime]);

  const handleSeek = (ev: RaceEvent) => {
    if (clock) {
      clock.seek(Math.max(0, ev.t - 3));
    }
    if (ev.drivers && ev.drivers.length > 0) {
      selectMomentDrivers(ev.drivers, 4);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-3)]">
            RECENT KEY MOMENTS
          </span>
        </div>
        {onOpenAllMoments && (
          <button
            type="button"
            onClick={onOpenAllMoments}
            className="text-[10px] font-mono text-[var(--accent)] hover:underline flex items-center gap-0.5 cursor-pointer"
          >
            <span>ALL ({events.length})</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {recentEvents.length === 0 ? (
        <Card className="p-3 bg-[var(--surface-2)] border-[var(--border)] text-center text-xs text-[var(--text-3)] font-sans">
          No key race events recorded yet.
        </Card>
      ) : (
        <div className="space-y-1.5">
          {recentEvents.map((ev) => {
            const primaryColor =
              ev.drivers && ev.drivers[0] && driverColors[ev.drivers[0]]
                ? driverColors[ev.drivers[0]]
                : getEventColor(ev.type, ev.severity);

            return (
              <div
                key={ev.id}
                onClick={() => handleSeek(ev)}
                className="p-2 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-hi)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="p-1 rounded-xs shrink-0"
                    style={{
                      backgroundColor: `${primaryColor}22`,
                      color: primaryColor,
                    }}
                  >
                    {getEventIcon(ev.type, 'w-3 h-3')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-sans font-medium text-[var(--text-1)] truncate">
                      {ev.label}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-3)]">
                      <span className="font-semibold text-[var(--text-2)]">L{ev.lap}</span>
                      <span>T+{formatTimelineTime(ev.t)}</span>
                    </div>
                  </div>
                </div>

                {ev.drivers && ev.drivers.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {ev.drivers.slice(0, 2).map((code) => (
                      <span
                        key={code}
                        className="px-1 py-0.5 rounded-xs text-[9px] font-mono font-bold"
                        style={{
                          backgroundColor: `${driverColors[code] || 'var(--surface-4)'}26`,
                          color: driverColors[code] || 'var(--text-1)',
                        }}
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
