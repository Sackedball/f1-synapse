import React, { useState, useMemo } from 'react';
import { RaceEvent, DriverInfo } from '@/api/types';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { formatTimelineTime } from '../timeline/timelineMath';
import { getEventIcon, getEventColor } from '../timeline/TimelineMarker';
import {
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSelectionStore } from '@/stores/selectionStore';

export interface KeyMomentsDrawerProps {
  open: boolean;
  onClose: () => void;
  events: RaceEvent[];
  clock: PlaybackClock | null;
  drivers?: DriverInfo[];
  currentTime?: number;
  onSelectEvent?: (event: RaceEvent) => void;
}

export type MomentFilter = 'all' | 'overtake' | 'pit' | 'safety_car' | 'battle' | 'incident';

export const KeyMomentsDrawer: React.FC<KeyMomentsDrawerProps> = ({
  open,
  onClose,
  events,
  clock,
  drivers = [],
  currentTime = 0,
  onSelectEvent,
}) => {
  const [filter, setFilter] = useState<MomentFilter>('all');
  const [driverOnly, setDriverOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { selectedDriver, selectMomentDrivers } = useSelectionStore();

  const driverColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of drivers) {
      if (d.code && d.color) {
        map[d.code] = d.color;
      }
    }
    return map;
  }, [drivers]);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (driverOnly && selectedDriver) {
        if (!ev.drivers || !ev.drivers.includes(selectedDriver)) return false;
      }
      if (filter === 'overtake') return ev.type === 'overtake';
      if (filter === 'pit') return ev.type === 'pit_in' || ev.type === 'pit_out';
      if (filter === 'safety_car') return ev.type === 'safety_car' || ev.type === 'vsc';
      if (filter === 'battle') return ev.type === 'battle';
      if (filter === 'incident')
        return ev.type === 'incident' || ev.type === 'penalty' || ev.type === 'retirement';
      return true;
    });
  }, [events, filter, driverOnly, selectedDriver]);

  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) =>
      sortOrder === 'asc' ? a.t - b.t : b.t - a.t,
    );
  }, [filteredEvents, sortOrder]);

  const handleSeekEvent = (ev: RaceEvent) => {
    if (clock) {
      clock.seek(Math.max(0, ev.t - 3));
    }
    if (ev.drivers && ev.drivers.length > 0) {
      selectMomentDrivers(ev.drivers, 4);
    }
    if (onSelectEvent) {
      onSelectEvent(ev);
    }
  };

  const handleNextMoment = () => {
    const next = sortedEvents.find((e) => e.t > currentTime + 0.5);
    if (next) handleSeekEvent(next);
  };

  const handlePrevMoment = () => {
    const prev = [...sortedEvents].reverse().find((e) => e.t < currentTime - 0.5);
    if (prev) handleSeekEvent(prev);
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed top-14 bottom-24 right-0 w-96 bg-[var(--surface-1)] border-l border-[var(--border-hi)] shadow-2xl z-40 flex flex-col select-none animate-in slide-in-from-right duration-200',
      )}
      aria-label="Key Moments Drawer"
    >
      {/* 1. Header */}
      <div className="p-3.5 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="font-display font-bold text-sm tracking-wide text-[var(--text-1)]">
            KEY MOMENTS
          </h2>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--surface-3)] text-[var(--text-2)] font-semibold">
            {filteredEvents.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Prev / Next buttons */}
          <button
            type="button"
            onClick={handlePrevMoment}
            title="Previous Key Moment (K)"
            aria-label="Previous Key Moment"
            className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNextMoment}
            title="Next Key Moment (J)"
            aria-label="Next Key Moment"
            className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-4 bg-[var(--border)] mx-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Key Moments Drawer"
            className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="p-2.5 bg-[var(--surface-1)] border-b border-[var(--border)] space-y-2">
        <div className="flex items-center gap-1 overflow-x-auto text-[10px] font-mono font-semibold pb-1">
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'overtake', label: 'Overtakes' },
              { key: 'pit', label: 'Pits' },
              { key: 'safety_car', label: 'SC/VSC' },
              { key: 'battle', label: 'Battles' },
              { key: 'incident', label: 'Incidents' },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'px-2 py-1 rounded-xs transition-colors cursor-pointer shrink-0',
                filter === f.key
                  ? 'bg-[var(--surface-3)] text-[var(--text-1)] border border-[var(--border-hi)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] font-sans text-[var(--text-3)] pt-1">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={driverOnly}
              onChange={(e) => setDriverOnly(e.target.checked)}
              disabled={!selectedDriver}
              className="accent-[var(--accent)]"
            />
            <span>
              {selectedDriver ? `Only ${selectedDriver}` : 'Select driver to filter'}
            </span>
          </label>

          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="text-[10px] font-mono text-[var(--text-2)] hover:text-[var(--text-1)] cursor-pointer flex items-center gap-1"
          >
            <span>{sortOrder === 'asc' ? 'Oldest First' : 'Newest First'}</span>
          </button>
        </div>
      </div>

      {/* 3. Event Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sortedEvents.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--text-3)]">
            No events match the active filter.
          </div>
        ) : (
          sortedEvents.map((ev) => {
            const isActive = Math.abs(currentTime - ev.t) <= 3;
            const primaryColor =
              ev.drivers && ev.drivers[0] && driverColors[ev.drivers[0]]
                ? driverColors[ev.drivers[0]]
                : getEventColor(ev.type, ev.severity);

            return (
              <div
                key={ev.id}
                onClick={() => handleSeekEvent(ev)}
                className={cn(
                  'p-2.5 rounded-[var(--r-md)] border transition-all cursor-pointer relative group',
                  isActive
                    ? 'bg-[var(--surface-3)] border-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]'
                    : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--border-hi)] hover:bg-[var(--surface-3)]',
                )}
              >
                {/* Header row */}
                <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="p-1 rounded-xs"
                      style={{
                        backgroundColor: `${primaryColor}22`,
                        color: primaryColor,
                      }}
                    >
                      {getEventIcon(ev.type, 'w-3.5 h-3.5')}
                    </span>
                    <span className="font-bold text-[var(--text-2)]">L{ev.lap}</span>
                    <span className="text-[var(--text-3)]">T+{formatTimelineTime(ev.t)}</span>
                  </div>

                  {ev.severity === 'major' && (
                    <span className="px-1.5 py-0.2 rounded-xs bg-[var(--danger)] text-white text-[9px] font-bold uppercase tracking-wider">
                      MAJOR
                    </span>
                  )}
                  {isActive && (
                    <span className="text-[9px] font-bold text-[var(--accent)] animate-pulse">
                      ACTIVE NOW
                    </span>
                  )}
                </div>

                {/* Event Label */}
                <p className="text-xs font-sans font-semibold text-[var(--text-1)] mb-1.5 leading-snug">
                  {ev.label}
                </p>

                {/* Drivers involved */}
                {ev.drivers && ev.drivers.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {ev.drivers.map((code) => {
                      const color = driverColors[code] || 'var(--text-2)';
                      return (
                        <span
                          key={code}
                          className="px-1.5 py-0.5 rounded-xs text-[10px] font-mono font-bold border"
                          style={{
                            borderColor: `${color}66`,
                            backgroundColor: `${color}18`,
                            color: color,
                          }}
                        >
                          {code}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
