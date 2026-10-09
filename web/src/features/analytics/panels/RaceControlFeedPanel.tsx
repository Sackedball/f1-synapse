import React, { useState, useMemo, useRef, useEffect } from 'react';
import { RaceControlMessage, DriverInfo } from '@/api/types';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { Radio, AlertTriangle, ShieldAlert, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatClockTime } from '@/features/timeline/timelineMath';

export interface RaceControlFeedPanelProps {
  raceControl: RaceControlMessage[];
  clock: PlaybackClock | null;
  drivers?: DriverInfo[];
}

export type MessageFilter = 'all' | 'flag' | 'incident' | 'penalty';

export const RaceControlFeedPanel: React.FC<RaceControlFeedPanelProps> = ({
  raceControl = [],
  clock,
  drivers: _drivers = [],
}) => {
  const [filter, setFilter] = useState<MessageFilter>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [currentTime, setCurrentTime] = useState(clock ? clock.currentTime : 0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Subscribe to clock throttled
  useEffect(() => {
    if (!clock) return;
    const unsub = clock.subscribeThrottled((t) => {
      setCurrentTime(t);
    }, 4);
    return unsub;
  }, [clock]);

  // Filter messages
  const filteredMessages = useMemo(() => {
    return raceControl.filter((msg) => {
      if (filter === 'flag') return msg.flag != null;
      if (filter === 'incident') {
        const cat = (msg.category || '').toLowerCase();
        const text = (msg.message || '').toLowerCase();
        return cat.includes('incident') || text.includes('incident') || text.includes('noted') || text.includes('investigat');
      }
      if (filter === 'penalty') {
        const text = (msg.message || '').toLowerCase();
        return text.includes('penalty') || text.includes('time penalty') || text.includes('reprimand');
      }
      return true;
    });
  }, [raceControl, filter]);

  // Auto-scroll to active message near currentTime
  useEffect(() => {
    if (!autoScroll || !scrollContainerRef.current) return;
    // Find item closest to currentTime
    const activeItem = scrollContainerRef.current.querySelector('[data-active="true"]');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentTime, autoScroll]);

  const handleSeek = (msg: RaceControlMessage) => {
    if (!clock) return;
    // msg.timeSec or approximate from lap
    const t = msg.timeSec ?? (msg.lap ? msg.lap * 90 : 0);
    clock.seek(Math.max(0, t - 2));
  };

  const getMessageIcon = (msg: RaceControlMessage) => {
    if (msg.flag === 'RED') return <Flag className="w-3.5 h-3.5 text-[var(--danger)]" />;
    if (msg.flag === 'YELLOW') return <Flag className="w-3.5 h-3.5 text-[var(--warning)]" />;
    if (msg.flag === 'GREEN') return <Flag className="w-3.5 h-3.5 text-[var(--success)]" />;
    if (msg.flag === 'CHEQUERED') return <Flag className="w-3.5 h-3.5 text-white" />;
    if (msg.category === 'SafetyCar') return <ShieldAlert className="w-3.5 h-3.5 text-[var(--safety-car)]" />;
    return <AlertTriangle className="w-3.5 h-3.5 text-[var(--text-2)]" />;
  };

  return (
    <div className="h-full w-full flex flex-col bg-[var(--surface-1)] text-[var(--text-1)] select-none overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-[var(--accent)]" />
          <span className="font-display font-bold text-xs uppercase tracking-wider text-[var(--text-2)]">
            RACE CONTROL COMMUNICATIONS
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--surface-3)] text-[var(--text-2)]">
            {filteredMessages.length}
          </span>
        </div>

        {/* Live Follow Toggle */}
        <label className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--text-3)] cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <span>AUTO-FOLLOW</span>
        </label>
      </div>

      {/* 2. Filter Pills */}
      <div className="px-3 py-1.5 bg-[var(--surface-1)] border-b border-[var(--border)] flex items-center gap-1 text-[10px] font-mono">
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'flag', label: 'Flags' },
            { key: 'incident', label: 'Incidents' },
            { key: 'penalty', label: 'Penalties' },
          ] as const
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-2 py-0.5 rounded-xs transition-colors cursor-pointer',
              filter === f.key
                ? 'bg-[var(--surface-3)] text-[var(--text-1)] font-bold border border-[var(--border-hi)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 3. Messages List */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-1.5"
      >
        {filteredMessages.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-3)] font-sans">
            No race control messages matching filter.
          </div>
        ) : (
          filteredMessages.map((msg, idx) => {
            const msgT = msg.timeSec ?? (msg.lap ? msg.lap * 90 : 0);
            const isActive = Math.abs(currentTime - msgT) < 5;

            return (
              <div
                key={idx}
                data-active={isActive ? 'true' : 'false'}
                onClick={() => handleSeek(msg)}
                className={cn(
                  'p-2.5 rounded-[var(--r-md)] border transition-all cursor-pointer flex items-start gap-2.5',
                  isActive
                    ? 'bg-[var(--surface-3)] border-[var(--accent)] shadow-[0_0_10px_var(--accent-glow)]'
                    : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--border-hi)] hover:bg-[var(--surface-3)]',
                )}
              >
                <div className="mt-0.5 shrink-0">{getMessageIcon(msg)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                    <div className="flex items-center gap-1.5 text-[var(--text-3)]">
                      {msg.lap && <span className="font-bold text-[var(--text-2)]">LAP {msg.lap}</span>}
                      <span>T+{formatClockTime(msgT)}</span>
                    </div>

                    {msg.flag && (
                      <span className="font-bold uppercase tracking-wider text-[9px] px-1 rounded-xs bg-[var(--surface-4)]">
                        {msg.flag} FLAG
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-sans text-[var(--text-1)] leading-relaxed">
                    {msg.message}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
