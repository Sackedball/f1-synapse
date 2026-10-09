import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { DriverInfo, RaceEvent } from '@/api/types';
import { useUiStore, useSelectionStore } from '@/stores';
import {
  Search,
  Zap,
  User,
  Sliders,
  Sparkles,
  Keyboard,
  RotateCcw,
  Play,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clock: PlaybackClock | null;
  drivers?: DriverInfo[];
  events?: RaceEvent[];
  totalLaps?: number;
  durationSec?: number;
  onOpenMoments?: () => void;
  onOpenHelp?: () => void;
}

interface CommandItem {
  id: string;
  category: 'NAVIGATION' | 'DRIVERS' | 'DISPLAY' | 'PANELS';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  keywords: string[];
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  clock,
  drivers = [],
  events = [],
  totalLaps = 53,
  durationSec = 120,
  onOpenMoments,
  onOpenHelp,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    toggleLabels,
    toggleLabelMode,
    toggleDrsZones,
    toggleFocusMode,
    toggleProgressBar,
    toggleFps,
  } = useUiStore();

  const { setSelectedDriver } = useSelectionStore();

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Generate all available commands
  const commands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [];

    // 1. Navigation
    list.push({
      id: 'restart',
      category: 'NAVIGATION',
      title: 'Restart Replay (T+0)',
      subtitle: 'Seek back to start of session',
      icon: <RotateCcw className="w-4 h-4 text-[var(--accent)]" />,
      keywords: ['restart', 'reset', 'start', 'beginning', 't0'],
      action: () => clock?.restart(),
    });

    list.push({
      id: 'play-pause',
      category: 'NAVIGATION',
      title: 'Toggle Play / Pause',
      subtitle: 'Spacebar',
      icon: <Play className="w-4 h-4 text-[var(--success)]" />,
      keywords: ['play', 'pause', 'stop', 'resume'],
      action: () => clock?.toggle(),
    });

    // Jump to next SC
    const scEvents = events.filter((e) => e.type === 'safety_car' || e.type === 'vsc');
    if (scEvents.length > 0) {
      list.push({
        id: 'jump-sc',
        category: 'NAVIGATION',
        title: 'Jump to Next Safety Car',
        subtitle: `${scEvents[0].label} (L${scEvents[0].lap})`,
        icon: <ShieldAlert className="w-4 h-4 text-[var(--safety-car)]" />,
        keywords: ['safety car', 'sc', 'vsc', 'yellow flag', 'caution'],
        action: () => {
          const curT = clock?.currentTime ?? 0;
          const next = scEvents.find((e) => e.t > curT + 1) || scEvents[0];
          clock?.seek(Math.max(0, next.t - 3));
        },
      });
    }

    // Jump to next Overtake
    const overtakeEvents = events.filter((e) => e.type === 'overtake');
    if (overtakeEvents.length > 0) {
      list.push({
        id: 'jump-overtake',
        category: 'NAVIGATION',
        title: 'Jump to Next Overtake',
        subtitle: `${overtakeEvents.length} overtakes detected in session`,
        icon: <Zap className="w-4 h-4 text-[var(--accent)]" />,
        keywords: ['overtake', 'pass', 'position change', 'lead change'],
        action: () => {
          const curT = clock?.currentTime ?? 0;
          const next = overtakeEvents.find((e) => e.t > curT + 1) || overtakeEvents[0];
          clock?.seek(Math.max(0, next.t - 3));
        },
      });
    }

    // Lap benchmarks
    const lapIntervals = [1, 5, 10, 20, 30, 40, 50, totalLaps];
    for (const lap of lapIntervals) {
      if (lap <= totalLaps) {
        const avgLapSec = durationSec / Math.max(1, totalLaps);
        const targetT = Math.min(durationSec, (lap - 1) * avgLapSec);
        list.push({
          id: `go-lap-${lap}`,
          category: 'NAVIGATION',
          title: `Go to Lap ${lap}`,
          subtitle: `Seek to ~${Math.round(targetT)}s`,
          icon: <ArrowRight className="w-4 h-4 text-[var(--text-3)]" />,
          keywords: ['lap', `lap ${lap}`, `l${lap}`],
          action: () => clock?.seek(targetT),
        });
      }
    }

    // 2. Driver Selection
    for (const d of drivers) {
      list.push({
        id: `driver-${d.code}`,
        category: 'DRIVERS',
        title: `Select ${d.fullName} (${d.code})`,
        subtitle: `${d.team} · #${d.number}`,
        icon: (
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: d.color || 'var(--accent)' }}
          >
            <User className="w-2.5 h-2.5" />
          </span>
        ),
        keywords: [
          d.code.toLowerCase(),
          d.fullName.toLowerCase(),
          d.team.toLowerCase(),
          String(d.number),
        ],
        action: () => setSelectedDriver(d.code),
      });
    }

    // 3. Display Toggles
    list.push({
      id: 'toggle-labels',
      category: 'DISPLAY',
      title: 'Toggle Driver Labels',
      subtitle: 'Shortcut: L',
      icon: <Sliders className="w-4 h-4 text-[var(--insight)]" />,
      keywords: ['labels', 'names', 'codes', 'hide labels', 'show labels'],
      action: () => toggleLabels(),
    });

    list.push({
      id: 'toggle-label-mode',
      category: 'DISPLAY',
      title: 'Toggle Label Mode (Code / Car Number)',
      subtitle: 'Shortcut: Shift + L',
      icon: <Sliders className="w-4 h-4 text-[var(--insight)]" />,
      keywords: ['label mode', 'car number', 'driver code'],
      action: () => toggleLabelMode(),
    });

    list.push({
      id: 'toggle-drs',
      category: 'DISPLAY',
      title: 'Toggle DRS Detection Zones',
      subtitle: 'Shortcut: D',
      icon: <Sliders className="w-4 h-4 text-[var(--success)]" />,
      keywords: ['drs', 'drs zones', 'detection'],
      action: () => toggleDrsZones(),
    });

    list.push({
      id: 'toggle-focus',
      category: 'DISPLAY',
      title: 'Toggle Driver Focus Mode',
      subtitle: 'Dim all other cars to 25% (Shortcut: F)',
      icon: <Sliders className="w-4 h-4 text-[var(--accent)]" />,
      keywords: ['focus', 'isolate', 'dim other cars'],
      action: () => toggleFocusMode(),
    });

    list.push({
      id: 'toggle-timeline',
      category: 'DISPLAY',
      title: 'Toggle Timeline Scrubber Bar',
      subtitle: 'Shortcut: B',
      icon: <Sliders className="w-4 h-4 text-[var(--text-2)]" />,
      keywords: ['timeline', 'progress bar', 'scrubber', 'bottom bar'],
      action: () => toggleProgressBar(),
    });

    list.push({
      id: 'toggle-fps',
      category: 'DISPLAY',
      title: 'Toggle FPS & Performance Debug Overlay',
      subtitle: 'Shortcut: `',
      icon: <Sliders className="w-4 h-4 text-[var(--warning)]" />,
      keywords: ['fps', 'performance', 'stats', 'debug', 'frame rate'],
      action: () => toggleFps(),
    });

    // 4. Panels & Modals
    if (onOpenMoments) {
      list.push({
        id: 'open-moments',
        category: 'PANELS',
        title: 'Open Key Moments Drawer',
        subtitle: 'Chronological race events and battles',
        icon: <Sparkles className="w-4 h-4 text-[var(--accent)]" />,
        keywords: ['moments', 'key moments', 'events', 'drawer', 'battles'],
        action: onOpenMoments,
      });
    }

    if (onOpenHelp) {
      list.push({
        id: 'open-help',
        category: 'PANELS',
        title: 'Open Keyboard Shortcuts Guide',
        subtitle: 'Shortcut: H or ?',
        icon: <Keyboard className="w-4 h-4 text-[var(--text-1)]" />,
        keywords: ['help', 'shortcuts', 'keyboard', 'hotkeys', 'guide'],
        action: onOpenHelp,
      });
    }

    return list;
  }, [
    clock,
    drivers,
    events,
    totalLaps,
    durationSec,
    setSelectedDriver,
    toggleLabels,
    toggleLabelMode,
    toggleDrsZones,
    toggleFocusMode,
    toggleProgressBar,
    toggleFps,
    onOpenMoments,
    onOpenHelp,
  ]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter((cmd) => {
      if (cmd.title.toLowerCase().includes(q)) return true;
      if (cmd.subtitle?.toLowerCase().includes(q)) return true;
      return cmd.keywords.some((k) => k.includes(q));
    });
  }, [commands, query]);

  // Keep selected index within bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  const executeCommand = (cmd: CommandItem) => {
    cmd.action();
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((idx) =>
        idx === 0 ? Math.max(0, filteredCommands.length - 1) : idx - 1,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        executeCommand(filteredCommands[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-[var(--surface-1)] border-[var(--border-hi)] shadow-2xl text-[var(--text-1)]">
        {/* Search Input Box */}
        <div className="flex items-center px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <Search className="w-4 h-4 text-[var(--text-3)] shrink-0 mr-2.5" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search drivers, laps, events..."
            className="w-full bg-transparent text-sm font-sans text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none"
            aria-label="Command palette search input"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded-xs text-[10px] font-mono bg-[var(--surface-3)] text-[var(--text-3)] border border-[var(--border)]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-3)] font-sans">
              No matching commands or actions found.
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => executeCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    'px-3 py-2 rounded-[var(--r-md)] flex items-center justify-between cursor-pointer transition-colors text-xs',
                    isSelected
                      ? 'bg-[var(--surface-3)] text-[var(--text-1)] border border-[var(--border-hi)]'
                      : 'text-[var(--text-2)] hover:bg-[var(--surface-2)]',
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0">{cmd.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm leading-tight truncate">
                        {cmd.title}
                      </p>
                      {cmd.subtitle && (
                        <p className="text-[11px] text-[var(--text-3)] truncate mt-0.5">
                          {cmd.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-mono font-bold text-[var(--text-3)] uppercase tracking-wider shrink-0 ml-2">
                    {cmd.category}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
