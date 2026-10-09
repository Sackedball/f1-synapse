import React, { useState } from 'react';
import {
  ArrowLeftRight,
  Wrench,
  X,
  Zap,
  ShieldAlert,
  Swords,
  AlertTriangle,
  Flag,
} from 'lucide-react';
import { RaceEvent } from '@/api/types';
import { MarkerCluster, formatTimelineTime } from './timelineMath';
import { cn } from '@/lib/utils';

interface TimelineMarkerProps {
  cluster: MarkerCluster;
  leftPct: number;
  onSelect: (event: RaceEvent) => void;
  driverColors?: Record<string, string>;
}

export function getEventIcon(type: string, className = 'w-3 h-3') {
  switch (type) {
    case 'overtake':
      return <ArrowLeftRight className={className} />;
    case 'pit_in':
    case 'pit_out':
      return <Wrench className={className} />;
    case 'retirement':
      return <X className={className} />;
    case 'fastest_lap':
      return <Zap className={className} />;
    case 'safety_car':
    case 'vsc':
      return <ShieldAlert className={className} />;
    case 'battle':
      return <Swords className={className} />;
    case 'incident':
    case 'penalty':
      return <AlertTriangle className={className} />;
    case 'start':
    case 'finish':
    case 'flag':
    default:
      return <Flag className={className} />;
  }
}

export function getEventColor(type: string, severity?: string): string {
  if (severity === 'major') {
    if (type === 'retirement') return 'var(--danger)';
    if (type === 'safety_car' || type === 'vsc') return 'var(--safety-car)';
  }
  switch (type) {
    case 'overtake':
      return 'var(--accent)';
    case 'pit_in':
    case 'pit_out':
      return 'var(--warning)';
    case 'retirement':
      return 'var(--danger)';
    case 'fastest_lap':
      return 'var(--best)';
    case 'safety_car':
    case 'vsc':
      return 'var(--safety-car)';
    case 'battle':
      return 'var(--warning)';
    case 'incident':
    case 'penalty':
      return 'var(--danger)';
    default:
      return 'var(--text-1)';
  }
}

export const TimelineMarker: React.FC<TimelineMarkerProps> = ({
  cluster,
  leftPct,
  onSelect,
  driverColors = {},
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const primaryEvent = cluster.events[0];
  const primaryColor =
    primaryEvent.drivers && primaryEvent.drivers[0] && driverColors[primaryEvent.drivers[0]]
      ? driverColors[primaryEvent.drivers[0]]
      : getEventColor(cluster.primaryType, primaryEvent.severity);

  return (
    <div
      className="absolute top-1 -translate-x-1/2 z-20 group"
      style={{ left: `${leftPct}%` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Marker Badge Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(primaryEvent);
        }}
        aria-label={`${cluster.count > 1 ? `${cluster.count} events` : primaryEvent.label} at ${formatTimelineTime(cluster.t)}`}
        className={cn(
          'w-5 h-5 rounded-xs flex items-center justify-center transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out)] cursor-pointer shadow-md select-none',
          'bg-[var(--surface-2)] border hover:scale-[1.15] hover:z-30',
        )}
        style={{
          borderColor: primaryColor,
          color: primaryColor,
          boxShadow: isHovered ? `0 0 10px ${primaryColor}66` : undefined,
        }}
      >
        {getEventIcon(cluster.primaryType, 'w-3 h-3')}
        {cluster.count > 1 && (
          <span className="absolute -top-1.5 -right-2 text-[9px] font-mono font-bold px-1 rounded-full bg-[var(--surface-4)] text-[var(--text-1)] border border-[var(--border)] leading-tight scale-90">
            {cluster.count}
          </span>
        )}
      </button>

      {/* Hover Card / Popover */}
      {isHovered && (
        <div
          className={cn(
            'absolute bottom-full mb-2 -translate-x-1/2 left-1/2 w-56 p-2 rounded-[var(--r-md)]',
            'bg-[var(--surface-2)] border border-[var(--border-hi)] shadow-xl z-50 pointer-events-auto',
            'animate-in fade-in zoom-in-95 duration-100 divide-y divide-[var(--border)]',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pb-1 mb-1 flex items-center justify-between text-[10px] font-mono text-[var(--text-3)]">
            <span>T+{formatTimelineTime(cluster.t)}</span>
            <span className="font-bold text-[var(--text-2)]">L{primaryEvent.lap}</span>
          </div>

          <div className="space-y-1.5 pt-1 max-h-48 overflow-y-auto">
            {cluster.events.map((ev) => {
              const evColor =
                ev.drivers && ev.drivers[0] && driverColors[ev.drivers[0]]
                  ? driverColors[ev.drivers[0]]
                  : getEventColor(ev.type, ev.severity);

              return (
                <div
                  key={ev.id}
                  onClick={() => onSelect(ev)}
                  className="p-1 rounded-[var(--r-sm)] hover:bg-[var(--surface-3)] cursor-pointer flex items-start gap-1.5 transition-colors"
                >
                  <span
                    className="shrink-0 p-0.5 rounded-xs mt-0.5"
                    style={{ color: evColor }}
                  >
                    {getEventIcon(ev.type, 'w-3 h-3')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-sans font-medium text-[var(--text-1)] truncate leading-tight">
                      {ev.label}
                    </p>
                    {ev.drivers && ev.drivers.length > 0 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        {ev.drivers.map((code) => (
                          <span
                            key={code}
                            className="text-[9px] font-mono font-bold px-1 rounded-xs"
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
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
