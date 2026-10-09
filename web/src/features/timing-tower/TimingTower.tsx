import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DriverInfo } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { useSelectionStore, useUiStore, useSettingsStore, useMlStore } from '@/stores';
import { TyreBadge } from '@/components/ui/TyreBadge';
import { buildTowerRows, TowerRowData } from './sortTowerRows';
import { formatGap } from './formatGap';

interface TimingTowerProps {
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  totalLaps?: number;
  fastestLapDriverCode?: string | null;
}

interface PosChangeRecord {
  diff: number; // positive = gained positions (e.g. +2 from P5 to P3)
  timestamp: number;
}

export const TimingTower: React.FC<TimingTowerProps> = ({
  drivers,
  snapshot,
  totalLaps = 53,
  fastestLapDriverCode = null,
}) => {
  const {
    selectedDriver,
    hoveredDriver,
    compareDrivers,
    setSelectedDriver,
    setHoveredDriver,
    toggleCompareDriver,
    clearSelection,
  } = useSelectionStore();

  const { density } = useUiStore();
  const { showMlInsights } = useSettingsStore();
  const getPit = useMlStore((s) => s.getPit);
  const isCompact = density === 'compact' || drivers.length > 20;
  const rowHeight = isCompact ? 30 : 36;

  const [gapMode, setGapMode] = useState<'interval' | 'leader'>('interval');
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Track previous positions for FLIP transitions & position change flashes
  const prevPositionsRef = useRef<Map<string, number>>(new Map());
  const [posChanges, setPosChanges] = useState<Map<string, PosChangeRecord>>(new Map());
  const flipOffsetsRef = useRef<Map<string, number>>(new Map());

  // Build sorted rows
  const rows: TowerRowData[] = useMemo(() => {
    return buildTowerRows(drivers, snapshot, gapMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, snapshot, snapshot?.t, snapshot?.frameIndex, gapMode]);

  // Compute FLIP offsets & position change badges when positions update
  useEffect(() => {
    if (rows.length === 0) return;

    const prevMap = prevPositionsRef.current;
    const now = Date.now();
    const newFlip = new Map<string, number>();

    setPosChanges((prevChanges) => {
      const newChanges = new Map(prevChanges);
      let changed = false;

      rows.forEach((row, currentIdx) => {
        const code = row.driver.code;
        if (prevMap.has(code)) {
          const prevIdx = prevMap.get(code)!;
          if (prevIdx !== currentIdx) {
            // Gained places = prevIdx - currentIdx (e.g. 4 -> 2 is +2 gained)
            const diff = prevIdx - currentIdx;
            // Apply FLIP invert offset
            const deltaY = (prevIdx - currentIdx) * rowHeight;
            newFlip.set(code, deltaY);

            // Only flash change badge if not retired
            if (!row.isRetired && Math.abs(diff) < 5) {
              newChanges.set(code, { diff, timestamp: now });
              changed = true;
            }
          }
        }
        prevMap.set(code, currentIdx);
      });

      // Prune flashes older than 2000ms
      newChanges.forEach((rec, code) => {
        if (now - rec.timestamp > 2000) {
          newChanges.delete(code);
          changed = true;
        }
      });

      return changed ? newChanges : prevChanges;
    });

    if (newFlip.size > 0) {
      flipOffsetsRef.current = newFlip;
      // Clear flip transform after paint
      requestAnimationFrame(() => {
        flipOffsetsRef.current = new Map();
      });
    }
  }, [rows, rowHeight]);

  // Row selection handler
  const handleRowClick = useCallback(
    (code: string, e: React.MouseEvent) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        toggleCompareDriver(code);
      } else {
        setSelectedDriver(code);
      }
    },
    [setSelectedDriver, toggleCompareDriver],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (rows.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, rows.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < rows.length) {
          const code = rows[focusedIndex].driver.code;
          setSelectedDriver(code);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearSelection();
        setFocusedIndex(-1);
      }
    },
    [rows, focusedIndex, setSelectedDriver, clearSelection],
  );

  // Current lap of leader
  const leaderLap = rows[0]?.lapsBehind === 0 && snapshot ? snapshot.lap[rows[0].driverIndex] || 1 : 1;

  return (
    <aside
      className="w-[320px] min-w-[320px] max-w-[320px] bg-[var(--surface-1)] border-r border-[var(--border)] flex flex-col select-none h-full outline-none"
      aria-label="Timing Tower"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Tower Header */}
      <div className="px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="font-display font-black text-sm tracking-wider text-[var(--text-1)]">
            <span>LAP</span>{' '}
            <span className="text-[var(--accent)] font-mono">{leaderLap}</span>
            <span className="text-[var(--text-3)] font-mono">/{totalLaps}</span>
          </div>
          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-xs bg-[rgba(0,210,106,0.12)] text-[var(--success)] font-bold">
            LIVE
          </span>
        </div>

        {/* Interval / Leader toggle */}
        <div className="flex items-center gap-1 bg-[var(--surface-3)] p-0.5 rounded-[var(--r-sm)] border border-[var(--border)]">
          <button
            type="button"
            title="Show Interval to Car Ahead"
            aria-label="Interval Gap Mode"
            onClick={() => setGapMode('interval')}
            className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-xs transition-colors ${
              gapMode === 'interval'
                ? 'bg-[var(--surface-1)] text-[var(--text-1)] shadow-xs border border-[var(--border-hi)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
            }`}
          >
            INT
          </button>
          <button
            type="button"
            title="Show Gap to Leader"
            aria-label="Leader Gap Mode"
            onClick={() => setGapMode('leader')}
            className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-xs transition-colors ${
              gapMode === 'leader'
                ? 'bg-[var(--surface-1)] text-[var(--text-1)] shadow-xs border border-[var(--border-hi)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
            }`}
          >
            LDR
          </button>
        </div>
      </div>

      {/* Standings Table Container */}
      <div role="table" aria-label="Driver Standings Table" className="flex-1 flex flex-col overflow-hidden">
        {/* Column Headers */}
        <div
          className="grid grid-cols-[28px_4px_58px_1fr_42px_54px] items-center px-3 py-1 bg-[var(--surface-1)] border-b border-[var(--border)] text-[10px] font-mono font-bold tracking-wider text-[var(--text-3)] uppercase"
          role="row"
        >
          <span role="columnheader">POS</span>
          <span />
          <span role="columnheader">DRIVER</span>
          <span role="columnheader" className="text-right pr-2">
            {gapMode === 'interval' ? 'INTERVAL' : 'LEADER'}
          </span>
          <span role="columnheader" className="text-center">
            TYRE
          </span>
          <span role="columnheader" className="text-right">
            STATUS
          </span>
        </div>

        {/* Driver Rows Table Body */}
        <div
          tabIndex={0}
          role="rowgroup"
          aria-label="Driver timing rows"
          className="flex-1 overflow-y-auto divide-y divide-[var(--border)]/40 relative focus-visible:outline-none"
        >
        {rows.map((row, idx) => {
          const isSelected = selectedDriver === row.driver.code;
          const isHovered = hoveredDriver === row.driver.code;
          const isCompared = compareDrivers.includes(row.driver.code);
          const isFastest = fastestLapDriverCode === row.driver.code;
          const posChange = posChanges.get(row.driver.code);
          const flipOffset = flipOffsetsRef.current.get(row.driver.code) || 0;

          const isOut = row.isRetired && !row.isInPit;
          const gapText = row.isInPit
            ? 'PIT'
            : formatGap({
                gapSeconds: row.gapSeconds,
                isLeader: row.isLeader,
                isOut,
                lapsBehind: row.lapsBehind,
              });

          return (
            <div
              key={row.driver.code}
              role="row"
              aria-selected={isSelected}
              data-driver={row.driver.code}
              data-flash={posChange && posChange.diff !== 0 ? (posChange.diff > 0 ? 'up' : 'down') : undefined}
              onClick={(e) => handleRowClick(row.driver.code, e)}
              onMouseEnter={() => setHoveredDriver(row.driver.code)}
              onMouseLeave={() => setHoveredDriver(null)}
              style={{
                ['--team' as string]: row.driver.color || '#555',
                height: `${rowHeight}px`,
                transform: flipOffset !== 0 ? `translateY(${flipOffset}px)` : 'none',
                transition:
                  'transform var(--dur-slow) var(--ease-out), background-color var(--dur-fast) var(--ease-out)',
              }}
              className={`tower-row grid grid-cols-[28px_4px_58px_1fr_42px_54px] items-center px-3 cursor-pointer text-xs select-none transition-colors border-l-2 ${
                isSelected
                  ? 'bg-[var(--surface-3)] border-l-[var(--accent)]'
                  : isCompared
                    ? 'bg-[var(--surface-2)] border-l-[var(--insight)]'
                    : isHovered
                      ? 'bg-[var(--surface-2)] border-l-transparent'
                      : idx % 2 === 1
                        ? 'bg-[rgba(255,255,255,0.015)] border-l-transparent'
                        : 'bg-transparent border-l-transparent'
              } ${isOut ? 'opacity-40 grayscale' : ''}`}
            >
              {/* Position with gain/loss indicator */}
              <div role="cell" className="flex items-center gap-1 font-mono font-bold text-[13px] text-[var(--text-2)]">
                {isOut ? (
                  <span className="text-[var(--danger)] text-xs">OUT</span>
                ) : (
                  <span>{row.position}</span>
                )}
              </div>

              {/* 4px solid team color bar */}
              <div
                className="w-1 h-5 rounded-xs"
                style={{ backgroundColor: row.driver.color || '#555' }}
              />

              {/* Driver Code (15px bold display face) */}
              <div role="cell" className="pl-2 flex items-center gap-1">
                <span className="font-display font-bold text-[15px] tracking-[0.04em] text-[var(--text-1)]">
                  {row.driver.code}
                </span>

                {/* Position Change Flash Badge */}
                {posChange && posChange.diff !== 0 && (
                  <span
                    className={`text-[9px] font-mono font-black px-1 rounded-xs animate-pulse ${
                      posChange.diff > 0
                        ? 'bg-[rgba(0,210,106,0.2)] text-[var(--success)]'
                        : 'bg-[rgba(235,10,30,0.2)] text-[var(--danger)]'
                    }`}
                  >
                    {posChange.diff > 0 ? `▲${posChange.diff}` : `▼${Math.abs(posChange.diff)}`}
                  </span>
                )}
              </div>

              {/* Gap (Interval or Leader) */}
              <div
                role="cell"
                className={`text-right pr-2 font-mono text-[13px] tracking-tight ${
                  row.isLeader
                    ? 'font-bold text-[var(--text-3)] text-xs'
                    : 'text-[var(--text-1)] font-semibold'
                }`}
              >
                {gapText}
              </div>

              {/* Tyre Compound + Age */}
              <div role="cell" className="flex justify-center">
                <TyreBadge compound={row.tyreCompound} tyreLife={row.tyreLife} size="sm" />
              </div>

              {/* Status (PIT / DNF / FL) */}
              <div role="cell" className="flex items-center justify-end gap-1">
                {row.isInPit && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-[rgba(255,135,0,0.2)] text-[var(--warning)] border border-[rgba(255,135,0,0.4)]">
                    PIT
                  </span>
                )}

                {isOut && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs bg-[rgba(235,10,30,0.2)] text-[var(--danger)]">
                    DNF
                  </span>
                )}

                {/* ML Pit Window Anticipation */}
                {showMlInsights &&
                  !row.isInPit &&
                  !row.isRetired &&
                  snapshot &&
                  (() => {
                    const pitProb = getPit(row.driver.code, snapshot.t);
                    if (pitProb !== null && pitProb >= 0.5) {
                      const pct = Math.round(pitProb * 100);
                      return (
                        <span
                          title={`Pit Anticipation: ${pct}% est.`}
                          className="text-[9px] font-mono font-bold px-1 py-0.5 rounded-xs bg-[rgba(168,85,247,0.2)] text-[var(--insight)] border border-[rgba(168,85,247,0.4)] whitespace-nowrap"
                        >
                          PIT {pct}% est.
                        </span>
                      );
                    }
                    return null;
                  })()}

                {isFastest && !row.isRetired && (
                  <span
                    title="Fastest Lap"
                    className="text-[9px] font-mono font-bold px-1 py-0.5 rounded-xs bg-[rgba(168,85,247,0.2)] text-[var(--best)] border border-[rgba(168,85,247,0.4)]"
                  >
                    FL
                  </span>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </aside>
  );
};
