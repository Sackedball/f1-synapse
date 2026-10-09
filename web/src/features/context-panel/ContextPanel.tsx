import React, { useMemo } from 'react';
import { DriverInfo, WeatherSample } from '@/api/types';
import { Snapshot } from '@/engine/snapshot';
import { FrameStore } from '@/engine/FrameStore';
import { useSelectionStore, useUiStore, useSettingsStore, useMlStore } from '@/stores';
import { Gauge } from '@/components/ui/Gauge';
import { StatBar } from '@/components/ui/StatBar';
import { TyreBadge } from '@/components/ui/TyreBadge';
import { DriverChip } from '@/components/ui/DriverChip';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Sparkline } from '@/components/ui/Sparkline';
import { FlagPill } from '@/components/ui/FlagPill';
import { Target, X, Wind, Thermometer, Swords } from 'lucide-react';
import { formatGap } from '../timing-tower/formatGap';
import { PlaybackClock } from '@/engine/PlaybackClock';
import { RaceEvent } from '@/api/types';
import { RecentMomentsCard } from '../key-moments/RecentMomentsCard';

interface ContextPanelProps {
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  store: FrameStore | null;
  weather: WeatherSample[];
  totalLaps?: number;
  collapsed?: boolean;
  clock?: PlaybackClock | null;
  events?: RaceEvent[];
  onOpenAllMoments?: () => void;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  drivers,
  snapshot,
  store,
  weather,
  totalLaps = 53,
  collapsed = false,
  clock = null,
  events = [],
  onOpenAllMoments,
}) => {
  const {
    selectedDriver,
    compareDrivers,
    setSelectedDriver,
    clearSelection,
    toggleCompareDriver,
    setCompareDrivers,
  } = useSelectionStore();

  const { focusMode, toggleFocusMode } = useUiStore();
  const { showMlInsights } = useSettingsStore();
  const getTyre = useMlStore((s) => s.getTyre);
  const getPit = useMlStore((s) => s.getPit);
  const getOvertake = useMlStore((s) => s.getOvertake);
  const getBattleDetails = useMlStore((s) => s.getBattleDetails);

  // Active weather sample
  const latestWeather = weather.length > 0 ? weather[weather.length - 1] : null;

  // Active drivers count & retirements
  const activeCount = useMemo(() => {
    if (!snapshot) return drivers.length;
    let count = 0;
    for (let i = 0; i < snapshot.n; i++) {
      if (snapshot.status[i] === 0) count++;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, snapshot?.t, drivers.length]);

  const inPitCount = useMemo(() => {
    if (!snapshot) return 0;
    let count = 0;
    for (let i = 0; i < snapshot.n; i++) {
      if (snapshot.inPit[i] === 1) count++;
    }
    return count;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, snapshot?.t]);

  // Determine active focused driver index (selected or leader fallback)
  const activeDriverIndex = useMemo(() => {
    if (selectedDriver) {
      const idx = drivers.findIndex((d) => d.code === selectedDriver);
      if (idx !== -1) return idx;
    }
    if (snapshot && snapshot.n > 0) {
      return snapshot.orderByPosition[0] ?? 0;
    }
    return 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriver, drivers, snapshot, snapshot?.t]);

  const currentSpeed = snapshot ? Math.round(snapshot.speed[activeDriverIndex] || 0) : 0;

  // 30s Speed Sparkline data (unconditionally at top)
  const sparklineData = useMemo(() => {
    if (!store || !snapshot) return [currentSpeed, currentSpeed];
    try {
      const tNow = snapshot.t;
      const tStart = Math.max(0, tNow - 30);
      const arr = store.getSeries(activeDriverIndex, 'speed', tStart, tNow, 1.0);
      const res: number[] = [];
      for (let i = 0; i < arr.length; i++) {
        if (!isNaN(arr[i])) res.push(arr[i]);
      }
      return res.length >= 2 ? res : [currentSpeed, currentSpeed];
    } catch {
      return [currentSpeed, currentSpeed];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, snapshot, snapshot?.t, activeDriverIndex, currentSpeed]);

  // Lead Battle (P1 vs P2) Switch / Overtake Prediction
  const leadBattle = useMemo(() => {
    if (!snapshot || snapshot.n < 2 || !snapshot.orderByPosition) return null;
    const p1Idx = snapshot.orderByPosition[0];
    const p2Idx = snapshot.orderByPosition[1];
    const leader = drivers[p1Idx];
    const chaser = drivers[p2Idx];
    if (!leader || !chaser) return null;

    const gapSec = snapshot.gapAhead[p2Idx] || 0;
    const mlProb = getOvertake(chaser.code, leader.code, snapshot.t);
    const battleDetails = getBattleDetails ? getBattleDetails(chaser.code, leader.code, snapshot.t) : null;
    const probability = mlProb !== null ? mlProb : (battleDetails?.probability ?? null);

    // Threat level / status description
    let statusText = 'STABLE LEAD';
    let statusVariant: 'neutral' | 'accent' | 'warning' | 'danger' | 'insight' = 'neutral';
    if (probability !== null && probability >= 0.5) {
      statusText = 'OVERTAKE IMMINENT';
      statusVariant = 'danger';
    } else if (probability !== null && probability >= 0.3) {
      statusText = 'HIGH OVERTAKE THREAT';
      statusVariant = 'warning';
    } else if (gapSec > 0 && gapSec <= 1.0) {
      statusText = 'DRS ATTACK ZONE';
      statusVariant = 'warning';
    } else if (gapSec > 1.0 && gapSec <= 2.2) {
      statusText = 'IN PURSUIT';
      statusVariant = 'insight';
    }

    return {
      leader,
      chaser,
      p1Idx,
      p2Idx,
      gapSec,
      probability,
      statusText,
      statusVariant,
      closingSpeedKmh: battleDetails?.closingSpeedKmh ?? null,
      gapMeters: battleDetails?.gapMeters ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, snapshot?.t, drivers, getOvertake, getBattleDetails]);

  if (collapsed) {
    return null;
  }

  // Mode 1: Multi-Driver Compare (2..4 drivers selected)
  if (compareDrivers.length >= 2) {
    return (
      <aside
        className="w-[360px] min-w-[360px] max-w-[360px] bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col h-full overflow-hidden select-none"
        aria-label="Driver Comparison Panel"
      >
        <div className="p-3 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold tracking-wider text-[var(--insight)] uppercase">
              ◆ DRIVER COMPARE ({compareDrivers.length}/4)
            </span>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="flex items-center gap-1 text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)] px-1.5 py-0.5 rounded-xs hover:bg-[var(--surface-3)]"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {compareDrivers.length === 2 ? (
            /* 2 Drivers Side-by-Side Comparison */
            <TwoDriverComparison
              driverCodes={[compareDrivers[0], compareDrivers[1]]}
              drivers={drivers}
              snapshot={snapshot}
              store={store}
            />
          ) : (
            /* 3-4 Drivers Stacked Cards */
            <MultiDriverComparison
              driverCodes={compareDrivers}
              drivers={drivers}
              snapshot={snapshot}
              onRemove={(code) => toggleCompareDriver(code)}
            />
          )}
        </div>
      </aside>
    );
  }

  // Mode 2: Summary View (when no driver is explicitly selected)
  if (!selectedDriver) {
    return (
      <aside
        className="w-[360px] min-w-[360px] max-w-[360px] bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col h-full overflow-y-auto select-none divide-y divide-[var(--border)]"
        aria-label="Race Summary Panel"
      >
        {/* Race Summary Header */}
        <div className="p-4 bg-[var(--surface-2)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-3)]">
              RACE CONTROL SUMMARY
            </span>
            <FlagPill
              status={
                snapshot?.trackStatus === 2
                  ? 'SC'
                  : snapshot?.trackStatus === 3
                    ? 'RED'
                    : snapshot?.trackStatus === 4 || snapshot?.trackStatus === 5
                      ? 'VSC'
                      : snapshot?.trackStatus === 1
                        ? 'YELLOW'
                        : 'GREEN'
              }
              size="sm"
            />
          </div>
          <h2 className="font-display font-black text-xl text-[var(--text-1)] tracking-wide">
            LIVE SESSION OVERVIEW
          </h2>
          <div className="text-xs text-[var(--text-3)] font-sans mt-0.5">
            Select any car on track or in tower for full telemetry
          </div>
        </div>

        {/* Current Leader Spotlight */}
        {snapshot && snapshot.n > 0 && drivers.length > 0 && (
          <div className="p-4 bg-[var(--surface-1)] space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] block">
              RACE LEADER
            </span>
            {(() => {
              const leaderIdx = snapshot.orderByPosition[0] ?? 0;
              const leader = drivers[leaderIdx];
              if (!leader) return null;
              return (
                <div
                  onClick={() => setSelectedDriver(leader.code)}
                  className="flex items-center justify-between p-3 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border-hi)] hover:border-[var(--accent)] cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-1.5 h-10 rounded-xs shrink-0"
                      style={{ backgroundColor: leader.color || 'var(--accent)' }}
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="accent" size="sm">
                          P1
                        </Badge>
                        <span className="font-display font-bold text-base text-[var(--text-1)]">
                          {leader.fullName.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-3)] font-sans mt-0.5">{leader.team}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-display font-black text-2xl text-[var(--text-1)] opacity-20">
                      {leader.number}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Race Leader Battle & Switch Prediction Card */}
        {leadBattle && showMlInsights && (
          <div className="p-4 bg-[var(--surface-1)] space-y-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--insight)] flex items-center gap-1.5">
                <Swords className="w-3.5 h-3.5" />
                P1 vs P2 LEAD BATTLE PREDICTION
              </span>
              <Badge variant={leadBattle.statusVariant} size="sm">
                {leadBattle.statusText}
              </Badge>
            </div>
            <Card className="p-3 bg-[var(--surface-2)] border-[rgba(168,85,247,0.2)] space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DriverChip code={leadBattle.leader.code} teamColor={leadBattle.leader.color} />
                  <span className="text-[11px] font-mono font-bold text-[var(--text-3)]">vs</span>
                  <DriverChip code={leadBattle.chaser.code} teamColor={leadBattle.chaser.color} />
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs font-bold text-[var(--text-1)]">
                    +{leadBattle.gapSec.toFixed(3)}s
                  </span>
                  <div className="text-[10px] text-[var(--text-3)] font-sans">Interval</div>
                </div>
              </div>

              {/* Likelihood Meter */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--text-2)] font-sans">Lead Switch Likelihood</span>
                  <span className="font-mono font-bold text-[var(--insight)]">
                    {leadBattle.probability !== null
                      ? `${Math.round(leadBattle.probability * 100)}% est.`
                      : leadBattle.gapSec <= 1.0
                        ? 'High (DRS range)'
                        : leadBattle.gapSec <= 2.2
                          ? 'Medium'
                          : 'Low (< 5%)'}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--insight)] rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        leadBattle.probability !== null
                          ? Math.min(100, Math.max(5, Math.round(leadBattle.probability * 100)))
                          : leadBattle.gapSec <= 1.0
                            ? 65
                            : leadBattle.gapSec <= 2.2
                              ? 30
                              : 8
                      }%`,
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[var(--border)] text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedDriver(leadBattle.chaser.code)}
                  className="text-[var(--insight)] hover:underline flex items-center gap-1 font-mono text-[10px]"
                >
                  Inspect Chaser ({leadBattle.chaser.code}) →
                </button>
                <button
                  type="button"
                  onClick={() => setCompareDrivers([leadBattle.leader.code, leadBattle.chaser.code])}
                  className="text-[var(--text-3)] hover:text-[var(--text-1)] font-mono text-[10px]"
                >
                  Compare Head-to-Head
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Grid Statistics Matrix */}
        <div className="p-4 bg-[var(--surface-1)] space-y-3">
          <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] block">
            TRACK CONDITIONS & GRID
          </span>
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-3 bg-[var(--surface-2)] border-[var(--border)]">
              <span className="text-[10px] font-mono uppercase text-[var(--text-3)] block">
                ACTIVE RUNNERS
              </span>
              <span className="font-display font-bold text-xl text-[var(--text-1)]">
                {activeCount} <span className="text-xs text-[var(--text-3)] font-sans font-normal">/ {drivers.length}</span>
              </span>
            </Card>

            <Card className="p-3 bg-[var(--surface-2)] border-[var(--border)]">
              <span className="text-[10px] font-mono uppercase text-[var(--text-3)] block">
                IN PIT LANE
              </span>
              <span className="font-display font-bold text-xl text-[var(--warning)]">
                {inPitCount}
              </span>
            </Card>

            <Card className="p-3 bg-[var(--surface-2)] border-[var(--border)]">
              <span className="text-[10px] font-mono uppercase text-[var(--text-3)] block">
                RETIREMENTS
              </span>
              <span className="font-display font-bold text-xl text-[var(--danger)]">
                {drivers.length - activeCount}
              </span>
            </Card>

            <Card className="p-3 bg-[var(--surface-2)] border-[var(--border)]">
              <span className="text-[10px] font-mono uppercase text-[var(--text-3)] block">
                TOTAL LAPS
              </span>
              <span className="font-display font-bold text-xl text-[var(--text-1)]">
                {totalLaps}
              </span>
            </Card>
          </div>
        </div>

        {/* Weather Conditions */}
        {latestWeather && (
          <div className="p-4 bg-[var(--surface-1)] space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] block mb-1">
              METEOROLOGICAL READOUT
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] text-center">
                <div className="flex items-center justify-center gap-1 text-[var(--text-3)] mb-1">
                  <Thermometer className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-mono font-bold">AIR</span>
                </div>
                <span className="font-mono font-bold text-sm text-[var(--text-1)]">
                  {latestWeather.airTemp?.toFixed(1)}°C
                </span>
              </div>

              <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] text-center">
                <div className="flex items-center justify-center gap-1 text-[var(--accent)] mb-1">
                  <Thermometer className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-mono font-bold">TRACK</span>
                </div>
                <span className="font-mono font-bold text-sm text-[var(--text-1)]">
                  {latestWeather.trackTemp?.toFixed(1)}°C
                </span>
              </div>

              <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] text-center">
                <div className="flex items-center justify-center gap-1 text-[var(--insight)] mb-1">
                  <Wind className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-mono font-bold">WIND</span>
                </div>
                <span className="font-mono font-bold text-sm text-[var(--text-1)]">
                  {latestWeather.windSpeed?.toFixed(1)} m/s
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Key Moments Card */}
        <div className="p-4 bg-[var(--surface-1)] flex-1">
          <RecentMomentsCard
            events={events}
            clock={clock}
            currentTime={snapshot ? snapshot.t : 0}
            drivers={drivers}
            onOpenAllMoments={onOpenAllMoments}
          />
        </div>
      </aside>
    );
  }

  // Mode 3: Focused Single Driver Card
  const driver = drivers[activeDriverIndex];
  if (!driver) return null;

  const speed = currentSpeed;
  const rawThr = snapshot ? snapshot.throttle[activeDriverIndex] || 0 : 0;
  const throttle = rawThr > 1.0 ? Math.round(Math.min(100, Math.max(0, rawThr))) : Math.round(Math.min(100, Math.max(0, rawThr * 100)));
  const rawBrk = snapshot ? snapshot.brake[activeDriverIndex] || 0 : 0;
  const brake = rawBrk > 1.0 ? Math.round(Math.min(100, Math.max(0, rawBrk))) : Math.round(Math.min(100, Math.max(0, rawBrk * 100)));
  const gear = snapshot ? snapshot.gear[activeDriverIndex] ?? 0 : 0;
  const drs = snapshot ? snapshot.drs[activeDriverIndex] ?? 0 : 0;
  const tyreCompound = snapshot ? snapshot.tyre[activeDriverIndex] ?? 1 : 1;
  const tyreLife = snapshot ? snapshot.tyreLife[activeDriverIndex] ?? 0 : 0;
  const currentLap = snapshot ? snapshot.lap[activeDriverIndex] ?? 1 : 1;
  const pos = snapshot && snapshot.position[activeDriverIndex] > 0
    ? snapshot.position[activeDriverIndex]
    : activeDriverIndex + 1;

  const tyreEstimate = showMlInsights ? getTyre(driver.code, currentLap) : null;
  const pitProb = showMlInsights && snapshot ? getPit(driver.code, snapshot.t) : null;

  // Determine Ahead & Behind cars
  let driverAhead: DriverInfo | null = null;
  let gapAheadSec = 0;
  let driverBehind: DriverInfo | null = null;
  let gapBehindSec = 0;

  if (snapshot && snapshot.orderByPosition) {
    const order = snapshot.orderByPosition;
    const rankIndex = order.findIndex((idx) => idx === activeDriverIndex);
    if (rankIndex > 0) {
      const idxAhead = order[rankIndex - 1];
      driverAhead = drivers[idxAhead] || null;
      gapAheadSec = snapshot.gapAhead[activeDriverIndex] || 0;
    }
    if (rankIndex >= 0 && rankIndex < snapshot.n - 1) {
      const idxBehind = order[rankIndex + 1];
      driverBehind = drivers[idxBehind] || null;
      gapBehindSec = snapshot.gapAhead[idxBehind] || 0;
    }
  }

  return (
    <aside
      className="w-[360px] min-w-[360px] max-w-[360px] bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col overflow-y-auto select-none h-full divide-y divide-[var(--border)]"
      aria-label="Driver Telemetry Context Panel"
    >
      {/* Driver Focus Header */}
      <div className="p-4 bg-[var(--surface-2)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-3)]">
            DRIVER TELEMETRY FOCUS
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Toggle Focused View on Track"
              aria-label="Toggle Focus Mode"
              onClick={toggleFocusMode}
              className={`p-1 rounded-xs transition-colors flex items-center gap-1 text-[10px] font-mono font-bold ${
                focusMode
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              FOCUS
            </button>
            <Badge variant="accent">P{pos}</Badge>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="w-1.5 h-10 rounded-xs shrink-0"
              style={{ backgroundColor: driver.color || 'var(--accent)' }}
            />
            <div>
              <h2 className="font-display font-bold text-lg leading-tight tracking-wide text-[var(--text-1)]">
                {driver.fullName.toUpperCase()}
              </h2>
              <div className="text-xs text-[var(--text-3)] font-sans">{driver.team}</div>
            </div>
          </div>

          <span className="font-display font-black text-4xl text-[var(--text-1)] opacity-20">
            {driver.number}
          </span>
        </div>
      </div>

      {/* Primary Telemetry: Speed Gauge & Gear */}
      <div className="p-4 flex items-center justify-around gap-4 bg-[var(--surface-1)]">
        <Gauge value={speed} max={350} label="SPEED" unit="km/h" variant="accent" />

        <div className="flex flex-col items-center justify-center p-3 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border-hi)] w-24">
          <span className="text-[10px] font-mono font-semibold uppercase text-[var(--text-3)]">
            GEAR
          </span>
          <span className="font-display font-black text-3xl text-[var(--text-1)] leading-tight">
            {gear === 0 ? 'N' : gear === -1 ? 'R' : gear}
          </span>
          <span
            className={`text-[10px] font-mono font-bold mt-1 px-1.5 py-0.5 rounded-xs ${
              drs === 2
                ? 'bg-[var(--success)] text-neutral-900 animate-pulse'
                : drs === 1
                  ? 'bg-[rgba(0,210,106,0.2)] text-[var(--success)]'
                  : 'bg-[var(--surface-4)] text-[var(--text-disabled)]'
            }`}
          >
            {drs === 2 ? 'DRS OPEN' : drs === 1 ? 'DRS READY' : 'DRS OFF'}
          </span>
        </div>
      </div>

      {/* Throttle & Brake Pedals */}
      <div className="p-4 space-y-3 bg-[var(--surface-2)]">
        <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[var(--text-3)] block mb-1">
          PEDAL INPUTS
        </span>
        <StatBar label="Throttle" value={throttle} variant="throttle" />
        <StatBar label="Brake" value={brake} variant="brake" />
      </div>

      {/* Gaps Ahead / Behind */}
      <div className="p-4 space-y-2 bg-[var(--surface-1)]">
        <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[var(--text-3)] block mb-2">
          TRACK INTERVALS
        </span>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)]">
            <span className="text-[9px] font-mono font-bold uppercase text-[var(--text-3)] block mb-1">
              AHEAD
            </span>
            {driverAhead ? (
              <div
                onClick={() => setSelectedDriver(driverAhead.code)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="font-mono text-sm font-bold text-[var(--text-1)]">
                  {formatGap({ gapSeconds: gapAheadSec })}
                </div>
                <DriverChip
                  code={driverAhead.code}
                  teamColor={driverAhead.color}
                  className="mt-1"
                />
              </div>
            ) : (
              <span className="text-xs font-mono font-bold text-[var(--text-3)]">LEADER</span>
            )}
          </div>

          <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)]">
            <span className="text-[9px] font-mono font-bold uppercase text-[var(--text-3)] block mb-1">
              BEHIND
            </span>
            {driverBehind ? (
              <div
                onClick={() => setSelectedDriver(driverBehind.code)}
                className="cursor-pointer hover:opacity-80 transition-opacity"
              >
                <div className="font-mono text-sm font-bold text-[var(--text-2)]">
                  −{gapBehindSec > 0 ? gapBehindSec.toFixed(1) : '0.0'}s
                </div>
                <DriverChip
                  code={driverBehind.code}
                  teamColor={driverBehind.color}
                  className="mt-1"
                />
              </div>
            ) : (
              <span className="text-xs font-mono font-bold text-[var(--text-3)]">N/A</span>
            )}
          </div>
        </div>
      </div>

      {/* Tyre Status Card */}
      <div className="p-4 space-y-2 bg-[var(--surface-1)]">
        <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[var(--text-3)] block mb-2">
          TYRE CONDITION
        </span>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TyreBadge compound={tyreCompound} tyreLife={tyreLife} size="lg" />
            <div>
              <div className="font-mono text-xs font-bold text-[var(--text-1)]">
                {tyreLife} LAPS OLD
              </div>
              <div className="text-[11px] text-[var(--text-3)]">Current tyre stint</div>
            </div>
          </div>
          {tyreEstimate ? (
            <div className="text-right">
              <span className="font-mono text-xs font-bold text-[var(--insight)]">
                +{tyreEstimate.degradationRate.toFixed(2)}s/lap est.
              </span>
              <div className="text-[10px] text-[var(--text-3)]">Bayesian Wear</div>
            </div>
          ) : (
            <Badge variant="neutral">NOMINAL</Badge>
          )}
        </div>
      </div>

      {/* 30s Speed History Sparkline */}
      <div className="p-4 space-y-2 bg-[var(--surface-2)]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)]">
            SPEED TREND (30S)
          </span>
          <span className="text-[10px] font-mono text-[var(--text-2)]">{speed} km/h</span>
        </div>
        <div className="flex justify-center py-1">
          <Sparkline data={sparklineData} width={280} height={36} color="var(--accent)" />
        </div>
      </div>

      {/* ML Predictive Insight */}
      {showMlInsights && (
        <div className="p-4 bg-[rgba(168,85,247,0.04)] space-y-2 border-t border-[rgba(168,85,247,0.15)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase text-[var(--insight)] tracking-wider">
              ◆ PREDICTIVE TELEMETRY
            </span>
            <Badge variant="insight">ESTIMATED</Badge>
          </div>
          <Card className="p-3 bg-[var(--surface-2)] border-[rgba(168,85,247,0.2)]">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xs text-[var(--text-2)]">Pit Anticipation</span>
              <span className="font-mono text-sm font-bold text-[var(--insight)]">
                {pitProb !== null ? `${Math.round(pitProb * 100)}% est.` : '--'}
              </span>
            </div>
            {tyreEstimate && (
              <>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-[var(--text-2)]">Cumulative Pace Loss</span>
                  <span className="font-mono text-xs font-semibold text-[var(--text-1)]">
                    +{tyreEstimate.paceLoss.toFixed(2)}s est.
                  </span>
                </div>
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-[var(--text-3)]">5-LAP DEGRADATION PROJECTION</span>
                    <span className="text-[10px] font-mono text-[var(--insight)]">+{tyreEstimate.projected[4]?.toFixed(2)}s</span>
                  </div>
                  <div className="flex justify-center py-1">
                    <Sparkline data={tyreEstimate.projected} width={280} height={32} color="var(--insight)" />
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* Race Leader Switch Prediction / Focused Battle Prediction */}
          {leadBattle && (
            <Card className="p-3 bg-[var(--surface-2)] border-[rgba(168,85,247,0.2)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold uppercase text-[var(--insight)] flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5" />
                  {driver.code === leadBattle.leader.code
                    ? `P1 LEAD DEFENSE VS ${leadBattle.chaser.code}`
                    : driver.code === leadBattle.chaser.code
                      ? `P2 LEAD ATTACK ON ${leadBattle.leader.code}`
                      : 'RACE LEAD (P1 VS P2) PREDICTION'}
                </span>
                <Badge variant={leadBattle.statusVariant} size="sm">
                  {leadBattle.statusText}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-2)]">
                  {driver.code === leadBattle.leader.code
                    ? 'Lead Defense Threat'
                    : driver.code === leadBattle.chaser.code
                      ? 'Lead Takeover Probability'
                      : 'Leader Switch Likelihood'}
                </span>
                <span className="font-mono text-sm font-bold text-[var(--insight)]">
                  {leadBattle.probability !== null
                    ? `${Math.round(leadBattle.probability * 100)}% est.`
                    : leadBattle.gapSec <= 1.0
                      ? 'High (DRS range)'
                      : leadBattle.gapSec <= 2.2
                        ? 'Medium'
                        : 'Low (< 5%)'}
                </span>
              </div>

              <div className="w-full h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--insight)] rounded-full transition-all duration-300"
                  style={{
                    width: `${
                      leadBattle.probability !== null
                        ? Math.min(100, Math.max(5, Math.round(leadBattle.probability * 100)))
                        : leadBattle.gapSec <= 1.0
                          ? 65
                          : leadBattle.gapSec <= 2.2
                            ? 30
                            : 8
                    }%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border)]">
                <span className="text-[var(--text-3)] font-mono">
                  Gap: +{leadBattle.gapSec.toFixed(3)}s
                </span>
                <button
                  type="button"
                  onClick={() => setCompareDrivers([leadBattle.leader.code, leadBattle.chaser.code])}
                  className="text-[var(--insight)] hover:underline font-mono text-[10px]"
                >
                  Compare Head-to-Head →
                </button>
              </div>
            </Card>
          )}

          {/* Focused Driver's Own Direct Battle vs Car Ahead (if not P1 and within 2.5s) */}
          {driverAhead && gapAheadSec <= 2.5 && driver.code !== leadBattle?.chaser.code && (() => {
            const myProb = getOvertake(driver.code, driverAhead.code, snapshot.t);
            return (
              <Card className="p-3 bg-[var(--surface-2)] border-[rgba(168,85,247,0.2)] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase text-[var(--insight)] flex items-center gap-1.5">
                    <Swords className="w-3.5 h-3.5" />
                    ATTACK ON {driverAhead.code} (P{pos - 1})
                  </span>
                  <Badge variant={myProb !== null && myProb >= 0.3 ? 'warning' : 'insight'} size="sm">
                    +{gapAheadSec.toFixed(3)}s GAP
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--text-2)]">Overtake Likelihood</span>
                  <span className="font-mono text-sm font-bold text-[var(--insight)]">
                    {myProb !== null
                      ? `${Math.round(myProb * 100)}% est.`
                      : gapAheadSec <= 1.0
                        ? 'DRS Range (High)'
                        : 'In Pursuit'}
                  </span>
                </div>
              </Card>
            );
          })()}
        </div>
      )}
    </aside>
  );
};

/**
 * 2-Driver Side-by-Side Comparison with Central Delta Column
 */
const TwoDriverComparison: React.FC<{
  driverCodes: [string, string];
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  store: FrameStore | null;
}> = ({ driverCodes, drivers, snapshot }) => {
  const d1 = drivers.find((d) => d.code === driverCodes[0]);
  const d2 = drivers.find((d) => d.code === driverCodes[1]);
  if (!d1 || !d2) return null;

  const idx1 = d1.index ?? drivers.indexOf(d1);
  const idx2 = d2.index ?? drivers.indexOf(d2);

  const speed1 = snapshot ? Math.round(snapshot.speed[idx1] || 0) : 0;
  const speed2 = snapshot ? Math.round(snapshot.speed[idx2] || 0) : 0;
  const speedDelta = speed1 - speed2;

  const pos1 = snapshot ? snapshot.position[idx1] || 1 : 1;
  const pos2 = snapshot ? snapshot.position[idx2] || 2 : 2;

  const tyreLife1 = snapshot ? snapshot.tyreLife[idx1] || 0 : 0;
  const tyreLife2 = snapshot ? snapshot.tyreLife[idx2] || 0 : 0;
  const tyreDelta = tyreLife1 - tyreLife2;

  const gap1 = snapshot ? snapshot.gapLeader[idx1] || 0 : 0;
  const gap2 = snapshot ? snapshot.gapLeader[idx2] || 0 : 0;
  const gapDelta = Math.abs(gap1 - gap2);

  return (
    <div className="space-y-3">
      {/* Driver Chips Header */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--surface-2)] border-l-4" style={{ borderColor: d1.color }}>
          <div className="flex items-center justify-between">
            <span className="font-display font-black text-xl text-[var(--text-1)]">{d1.code}</span>
            <Badge variant="accent" size="sm">P{pos1}</Badge>
          </div>
          <div className="text-[11px] text-[var(--text-3)] truncate">{d1.fullName}</div>
        </div>

        <div className="p-2.5 rounded-[var(--r-md)] bg-[var(--surface-2)] border-l-4" style={{ borderColor: d2.color }}>
          <div className="flex items-center justify-between">
            <span className="font-display font-black text-xl text-[var(--text-1)]">{d2.code}</span>
            <Badge variant="accent" size="sm">P{pos2}</Badge>
          </div>
          <div className="text-[11px] text-[var(--text-3)] truncate">{d2.fullName}</div>
        </div>
      </div>

      {/* Synchronized Deltas Table */}
      <Card className="p-3 bg-[var(--surface-2)] border-[var(--border)] divide-y divide-[var(--border)]">
        <div className="py-2 flex items-center justify-between">
          <span className="font-mono text-sm text-[var(--text-1)]">{speed1} km/h</span>
          <span className="text-[10px] font-mono font-bold text-[var(--text-3)] uppercase">SPEED Δ</span>
          <span className="font-mono text-sm text-[var(--text-1)]">{speed2} km/h</span>
        </div>
        <div className="py-1 text-center font-mono text-xs font-bold text-[var(--insight)]">
          {speedDelta >= 0 ? `+${speedDelta}` : speedDelta} km/h
        </div>

        <div className="py-2 flex items-center justify-between">
          <span className="font-mono text-sm text-[var(--text-1)]">{tyreLife1} laps</span>
          <span className="text-[10px] font-mono font-bold text-[var(--text-3)] uppercase">TYRE AGE</span>
          <span className="font-mono text-sm text-[var(--text-1)]">{tyreLife2} laps</span>
        </div>
        <div className="py-1 text-center font-mono text-xs font-bold text-[var(--insight)]">
          {tyreDelta >= 0 ? `+${tyreDelta}` : tyreDelta} laps
        </div>

        <div className="py-2 flex items-center justify-between">
          <span className="font-mono text-sm text-[var(--text-1)]">
            {formatGap({ gapSeconds: gap1 })}
          </span>
          <span className="text-[10px] font-mono font-bold text-[var(--text-3)] uppercase">TIME GAP</span>
          <span className="font-mono text-sm text-[var(--text-1)]">
            {formatGap({ gapSeconds: gap2 })}
          </span>
        </div>
        <div className="py-1 text-center font-mono text-xs font-bold text-[var(--warning)]">
          Δ {gapDelta.toFixed(3)}s
        </div>
      </Card>
    </div>
  );
};

/**
 * 3-4 Drivers Multi Comparison List
 */
const MultiDriverComparison: React.FC<{
  driverCodes: string[];
  drivers: DriverInfo[];
  snapshot: Snapshot | null;
  onRemove: (code: string) => void;
}> = ({ driverCodes, drivers, snapshot, onRemove }) => {
  return (
    <div className="space-y-2">
      {driverCodes.map((code) => {
        const d = drivers.find((drv) => drv.code === code);
        if (!d) return null;
        const idx = d.index ?? drivers.indexOf(d);
        const pos = snapshot ? snapshot.position[idx] || 1 : 1;
        const speed = snapshot ? Math.round(snapshot.speed[idx] || 0) : 0;
        const tyreCompound = snapshot ? snapshot.tyre[idx] ?? 1 : 1;
        const tyreLife = snapshot ? snapshot.tyreLife[idx] ?? 0 : 0;

        return (
          <div
            key={code}
            className="p-3 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-8 rounded-xs" style={{ backgroundColor: d.color }} />
              <div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="accent" size="sm">P{pos}</Badge>
                  <span className="font-display font-bold text-sm text-[var(--text-1)]">{d.code}</span>
                </div>
                <div className="text-[11px] text-[var(--text-3)]">{d.fullName}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-[var(--text-1)]">{speed} km/h</span>
              <TyreBadge compound={tyreCompound} tyreLife={tyreLife} size="sm" />
              <button
                type="button"
                onClick={() => onRemove(code)}
                className="text-[var(--text-3)] hover:text-[var(--danger)] p-1"
                aria-label={`Remove ${code} from comparison`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
