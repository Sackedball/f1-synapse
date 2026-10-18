import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, TyreBadge, Skeleton } from '@/components';
import { PageNav, Choice } from '@/motion/PageKit';
import { SplitRise, Scramble } from '@/motion/Kinetic';
import { useMagnetic } from '@/motion/useMagnetic';
import { useMotionStore } from '@/motion/store';
import './quali.css';
import { api } from '@/api/client';
import {
  QualiResultsResponse,
  QualiTelemetryResponse,
  TrackGeometry,
} from '@/api/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatSpeed } from '@/utils/units';
import {
  classifySector,
  sectorSymbol,
  formatLapTime,
  formatGap,
  SectorColorClass,
} from './sectorColors';
import { DistanceChart } from '@/features/analytics/charts/DistanceChart';
import { QualiTrackMap, DriverMapMarker } from './QualiTrackMap';
import {
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';

const DriverSlab = ({ code, color, selected, ref_, onClick, i }: { code: string; color: string; selected: boolean; ref_: boolean; onClick: () => void; i: number }) => {
  const r = useMagnetic<HTMLButtonElement>(0.25, 50);
  return (
    <button ref={r} className="drv" aria-pressed={selected} onClick={onClick} data-testid={`driver-pill-${code}`}
      style={{ ['--c' as string]: color, ['--i' as string]: i }}>
      <span data-magnetic-inner><b>{code}</b>{ref_ && <em>REF</em>}</span>
    </button>
  );
};

export const QualifyingPage: React.FC = () => {
  const { sid = 'suzuka-2026-r3' } = useParams<{ sid: string }>();
  const settings = useSettingsStore();

  const [results, setResults] = useState<QualiResultsResponse | null>(null);
  const [track, setTrack] = useState<TrackGeometry | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<'Q1' | 'Q2' | 'Q3'>('Q3');
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>(['VER', 'PER', 'NOR']);
  const [telemetryMap, setTelemetryMap] = useState<Record<string, QualiTelemetryResponse>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Playback clock state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const animFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(performance.now());

  // 1. Fetch Qualifying Results & Track Geometry
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    Promise.all([
      api.getQualiResults(sid),
      api.getTrackGeometry(sid).catch(() => null),
    ])
      .then(([resData, trackData]) => {
        if (!active) return;
        setResults(resData);
        setTrack(trackData);

        // Default drivers: top 3 available in Q3
        if (resData.results.length > 0) {
          const top3 = resData.results.slice(0, 3).map((r) => r.code);
          setSelectedDrivers(top3);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error('Failed to load qualifying data:', err);
        setError(err?.message || 'Failed to load qualifying results.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sid]);

  // 2. Fetch Telemetry for selected drivers in active segment
  useEffect(() => {
    let active = true;

    selectedDrivers.forEach((driver) => {
      api
        .getQualiTelemetry(sid, driver, selectedSegment)
        .then((telem) => {
          if (!active) return;
          setTelemetryMap((prev) => ({
            ...prev,
            [`${driver}_${selectedSegment}`]: telem,
          }));
        })
        .catch((err) => {
          console.debug(`No telemetry for ${driver} in ${selectedSegment}:`, err);
        });
    });

    return () => {
      active = false;
    };
  }, [sid, selectedDrivers, selectedSegment]);

  // Max duration for current segment (benchmark driver's lap time)
  const maxLapTime = useMemo(() => {
    if (!results) return 90;
    return results.poleLap || 90;
  }, [results]);

  // 3. Playback Loop
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    lastTickRef.current = performance.now();

    const loop = (now: number) => {
      const dtSec = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + dtSec * playbackSpeed;
        if (next >= maxLapTime) {
          setIsPlaying(false);
          return maxLapTime;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isPlaying, playbackSpeed, maxLapTime]);

  // 4. Keyboard Shortcuts: Space (Play/Pause), Left/Right (Step), 1-4 (Speed), R (Restart)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setCurrentTime((prev) => Math.max(0, prev - 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setCurrentTime((prev) => Math.min(maxLapTime, prev + 1));
      } else if (e.code === 'KeyR') {
        e.preventDefault();
        setCurrentTime(0);
      } else if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
        const mult = Math.pow(2, parseInt(e.code.replace('Digit', ''), 10) - 1);
        setPlaybackSpeed(mult);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [maxLapTime]);

  // 5. Driver selection toggle (max 4 drivers)
  const toggleDriver = (code: string) => {
    setSelectedDrivers((prev) => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((d) => d !== code);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), code];
      }
      return [...prev, code];
    });
  };

  // Identify benchmark driver (fastest selected driver with telemetry in segment)
  const activeTelemetries = useMemo(() => {
    return selectedDrivers
      .map((code) => ({
        code,
        telem: telemetryMap[`${code}_${selectedSegment}`],
        color: results?.results.find((r) => r.code === code)?.color || '#808080',
      }))
      .filter((d): d is { code: string; telem: QualiTelemetryResponse; color: string } => !!d.telem);
  }, [selectedDrivers, selectedSegment, telemetryMap, results]);

  const benchmark = useMemo(() => {
    if (activeTelemetries.length === 0) return null;
    return activeTelemetries.reduce((fastest, curr) => {
      const tFastest = fastest.telem.lapTime ?? Infinity;
      const tCurr = curr.telem.lapTime ?? Infinity;
      return tCurr < tFastest ? curr : fastest;
    });
  }, [activeTelemetries]);

  // Synchronized distance for current time
  const currentDistance = useMemo(() => {
    if (!benchmark || !benchmark.telem.time || benchmark.telem.time.length === 0) return 0;
    const { time, distance } = benchmark.telem;
    // Find index where time >= currentTime
    let low = 0;
    let high = time.length - 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (time[mid] < currentTime) low = mid + 1;
      else high = mid;
    }
    const rawDist = distance[low] || 0;
    const maxD = distance[distance.length - 1] || 0;
    return maxD > 12000 ? rawDist * 0.1 : rawDist;
  }, [benchmark, currentTime]);

  // Compute map markers for cars along track
  const mapDriverMarkers: DriverMapMarker[] = useMemo(() => {
    return activeTelemetries.map(({ code, telem, color }) => {
      const { time, x, y } = telem;
      if (!time || time.length === 0) {
        return { code, color, x: 0, y: 0 };
      }
      // Binary search for time
      let low = 0;
      let high = time.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (time[mid] < currentTime) low = mid + 1;
        else high = mid;
      }
      return {
        code,
        color,
        x: x[low] || 0,
        y: y[low] || 0,
      };
    });
  }, [activeTelemetries, currentTime]);

  // 6. Build chart data arrays
  const chartDistanceGrid = useMemo(() => {
    if (activeTelemetries.length === 0) return [];
    const raw = activeTelemetries[0].telem.distance || [];
    const maxD = raw.length > 0 ? raw[raw.length - 1] : 0;
    if (maxD > 12000) {
      return raw.map((d) => d * 0.1);
    }
    return raw;
  }, [activeTelemetries]);

  // Speed Chart Data
  const speedChartData: [number[], ...number[][]] = useMemo(() => {
    if (chartDistanceGrid.length === 0) return [[]];
    const seriesData = activeTelemetries.map((d) => {
      if (settings.units === 'imperial') {
        return d.telem.speed.map((s) => Math.round(s * 0.621371));
      }
      return d.telem.speed;
    });
    return [chartDistanceGrid, ...seriesData];
  }, [chartDistanceGrid, activeTelemetries, settings.units]);

  // Delta Time Chart Data (vs Benchmark)
  const deltaChartData: [number[], ...number[][]] = useMemo(() => {
    if (!benchmark || chartDistanceGrid.length === 0) return [[]];
    const bTime = benchmark.telem.time;
    const seriesData = activeTelemetries.map((d) => {
      if (d.code === benchmark.code) {
        return new Array(chartDistanceGrid.length).fill(0);
      }
      return d.telem.time.map((t, idx) => {
        const b = bTime[idx] ?? t;
        return Number((t - b).toFixed(3));
      });
    });
    return [chartDistanceGrid, ...seriesData];
  }, [benchmark, chartDistanceGrid, activeTelemetries]);

  // Throttle & Brake Chart Data
  const throttleChartData: [number[], ...number[][]] = useMemo(() => {
    if (chartDistanceGrid.length === 0) return [[]];
    const seriesData: number[][] = [];
    activeTelemetries.forEach((d) => {
      seriesData.push(d.telem.throttle);
      seriesData.push(d.telem.brake);
    });
    return [chartDistanceGrid, ...seriesData];
  }, [chartDistanceGrid, activeTelemetries]);

  // Gear Chart Data
  const gearChartData: [number[], ...number[][]] = useMemo(() => {
    if (chartDistanceGrid.length === 0) return [[]];
    const seriesData = activeTelemetries.map((d) => d.telem.gear);
    return [chartDistanceGrid, ...seriesData];
  }, [chartDistanceGrid, activeTelemetries]);

  // Best sector splits across the session
  const sessionBestSectors = useMemo(() => {
    if (!results) return { s1: 0, s2: 0, s3: 0 };
    const validResults = results.results.filter((r) => r.bestLap !== null);
    const s1 = Math.min(...validResults.map((r) => r.s1 ?? Infinity));
    const s2 = Math.min(...validResults.map((r) => r.s2 ?? Infinity));
    const s3 = Math.min(...validResults.map((r) => r.s3 ?? Infinity));
    return {
      s1: s1 === Infinity ? null : s1,
      s2: s2 === Infinity ? null : s2,
      s3: s3 === Infinity ? null : s3,
    };
  }, [results]);

  const intro = useMotionStore((m) => m.introDone);
  const eventTitle = (results?.eventName ?? 'Qualifying').replace(' Grand Prix', '');
  const driverList = results?.results
    .filter((d) => (selectedSegment === 'Q3' ? d.q3 !== null : selectedSegment === 'Q2' ? d.q2 !== null : d.q1 !== null))
    .slice(0, 10) ?? [];

  return (
    <div className="pg pg-q h-screen w-screen overflow-y-auto flex flex-col">
      <PageNav section="QUALIFYING" to="/" backTestId="quali-back-btn" />

      <section className="q-hero">
        <div>
          <div className="q-kick">{results ? `${results.circuitName} · ${selectedSegment}` : 'LOADING SESSION'}</div>
          <h1 className="q-title"><SplitRise key={eventTitle} text={eventTitle} play={true} step={34} /></h1>
        </div>
        {results?.poleDriver && (
          <div className="q-pole" data-cursor="hide">
            <span className="q-pole-k">POLE POSITION</span>
            <span className="q-pole-c">{results.poleDriver}</span>
            <Scramble className="q-pole-t" text={formatLapTime(results.poleLap)} play={true} />
          </div>
        )}
      </section>

      <main className="q-main">
        {error && <div className="msg bad" role="alert">{error}</div>}

        <div className="q-bar">
          <Choice label="Session segment" value={selectedSegment} onChange={setSelectedSegment}
            options={[{ value: 'Q1', label: 'Q1 · all 20' }, { value: 'Q2', label: 'Q2 · top 15' }, { value: 'Q3', label: 'Q3 · top 10' }]} />
          <span className="q-hint">COMPARE UP TO 4 DRIVERS ↓</span>
        </div>

        <div className="q-drivers">
          {driverList.map((drv, i) => (
            <DriverSlab key={drv.code} i={i} code={drv.code} color={drv.color} selected={selectedDrivers.includes(drv.code)}
              ref_={benchmark?.code === drv.code} onClick={() => toggleDriver(drv.code)} />
          ))}
        </div>

        {/* 2-Column Split: Results Table (Left) + Telemetry Charts & Map (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Classification Table (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-4 overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-3">
                <span className="font-display font-bold text-xs tracking-wider text-[var(--text-2)]">
                  {selectedSegment} CLASSIFICATION & SPLITS
                </span>
                <span className="text-[11px] font-mono text-[var(--text-3)]">
                  Click driver to compare
                </span>
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Qualifying session results table"
                  className="overflow-x-auto max-h-[640px] overflow-y-auto focus-visible:outline-none"
                >
                  <table className="w-full text-xs font-mono text-left">
                    <thead className="text-[10px] text-[var(--text-3)] uppercase tracking-wider sticky top-0 bg-[var(--surface-1)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="py-2 px-1 text-center w-8">POS</th>
                        <th className="py-2 px-2">DRIVER</th>
                        <th className="py-2 px-1 text-right">S1</th>
                        <th className="py-2 px-1 text-right">S2</th>
                        <th className="py-2 px-1 text-right">S3</th>
                        <th className="py-2 px-2 text-right">LAP TIME</th>
                        <th className="py-2 px-2 text-right">GAP</th>
                        <th className="py-2 px-1 text-center">TYRE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]/40">
                      {results?.results.map((r, ri) => {
                        const isSelected = selectedDrivers.includes(r.code);
                        const segTime =
                          selectedSegment === 'Q1'
                            ? r.q1
                            : selectedSegment === 'Q2'
                              ? r.q2
                              : r.q3;

                        const s1Cls = classifySector(r.s1, sessionBestSectors.s1, r.s1);
                        const s2Cls = classifySector(r.s2, sessionBestSectors.s2, r.s2);
                        const s3Cls = classifySector(r.s3, sessionBestSectors.s3, r.s3);

                        const colorForCls = (cls: string) => {
                          if (cls === 'purple') return 'text-[var(--best)] font-bold';
                          if (cls === 'green') return 'text-[var(--success)] font-semibold';
                          if (cls === 'yellow') return 'text-[var(--warning)]';
                          return 'text-[var(--text-disabled)]';
                        };

                        const sym = (cls: SectorColorClass) => (settings.colorblindMode ? sectorSymbol(cls) : '');

                        return (
                          <tr
                            key={r.code}
                            style={{ ['--i' as string]: ri }}
                            onClick={() => toggleDriver(r.code)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-[var(--surface-3)]/60 font-bold'
                                : 'hover:bg-[var(--surface-2)]/40'
                            }`}
                            data-testid={`quali-row-${r.code}`}
                          >
                            <td className="py-2 px-1 text-center text-[var(--text-3)] font-mono">
                              {r.position}
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="w-1 h-3.5 rounded-full"
                                  style={{ backgroundColor: r.color }}
                                />
                                <span className="font-display font-bold text-[var(--text-1)]">
                                  {r.code}
                                </span>
                              </div>
                            </td>
                            <td className={`py-2 px-1 text-right font-mono text-[11px] ${colorForCls(s1Cls)}`}>
                              {r.s1 ? `${sym(s1Cls)}${r.s1.toFixed(3)}` : '—'}
                            </td>
                            <td className={`py-2 px-1 text-right font-mono text-[11px] ${colorForCls(s2Cls)}`}>
                              {r.s2 ? `${sym(s2Cls)}${r.s2.toFixed(3)}` : '—'}
                            </td>
                            <td className={`py-2 px-1 text-right font-mono text-[11px] ${colorForCls(s3Cls)}`}>
                              {r.s3 ? `${sym(s3Cls)}${r.s3.toFixed(3)}` : '—'}
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-medium">
                              {segTime ? (
                                <span
                                  className={
                                    r.position === 1
                                      ? 'text-purple-400 font-bold'
                                      : 'text-[var(--text-1)]'
                                  }
                                >
                                  {formatLapTime(segTime)}
                                </span>
                              ) : (
                                <span className="text-[var(--text-disabled)] italic">ELIM</span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-[var(--text-2)]">
                              {formatGap(r.gap)}
                            </td>
                            <td className="py-2 px-1 text-center">
                              <TyreBadge compound="S" size="xs" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>


            {/* Playback Controls & Lap Scrubber */}
            <Card className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="gap-1.5 text-xs font-mono"
                    data-testid="quali-play-btn"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    {isPlaying ? 'PAUSE' : 'PLAY LAP'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentTime(0);
                    }}
                    className="text-xs"
                    title="Restart Lap (R)"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="flex items-center gap-1 bg-[var(--surface-2)] p-0.5 rounded border border-[var(--border)] text-xs font-mono">
                  {[1, 2, 4, 8].map((s) => (
                    <button
                      key={s}
                      onClick={() => setPlaybackSpeed(s)}
                      className={`px-2 py-0.5 rounded ${
                        playbackSpeed === s
                          ? 'bg-[var(--accent)] text-white font-bold'
                          : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>

                <div className="text-xs font-mono font-bold text-[var(--text-1)]">
                  {formatLapTime(currentTime)} / {formatLapTime(maxLapTime)}
                </div>
              </div>

              {/* Lap Progress Scrubber */}
              <div className="space-y-1">
                <input
                  type="range"
                  aria-label="Qualifying Lap Telemetry Scrubber"
                  min={0}
                  max={maxLapTime}
                  step={0.05}
                  value={currentTime}
                  onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                  className="w-full accent-[var(--accent)] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-[var(--text-3)]">
                  <span>START (0.000s)</span>
                  <span>CURRENT DIST: {Math.round(currentDistance)} m</span>
                  <span>FINISH ({formatLapTime(maxLapTime)})</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Stacked Charts & Mini Map (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Top: Mini Map + Live Stats Strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-3.5 flex flex-col items-center justify-center min-h-[175px]">
                <div className="w-full flex justify-between items-center text-xs font-mono text-[var(--text-3)] mb-1">
                  <span>CIRCUIT MINI-MAP</span>
                  <span className="text-[var(--accent)] font-bold">{Math.round(currentDistance)} m</span>
                </div>
                <QualiTrackMap
                  track={track}
                  drivers={mapDriverMarkers}
                  cursorDist={currentDistance}
                  className="w-full h-[145px]"
                />
              </Card>

              {/* Selected Drivers Live Snapshot at Cursor */}
              <Card className="p-3.5 space-y-2.5">
                <div className="text-xs font-mono text-[var(--text-3)] pb-1 border-b border-[var(--border)]">
                  TELEMETRY AT DISTANCE: {Math.round(currentDistance)} m
                </div>
                <div className="space-y-1.5">
                  {activeTelemetries.map(({ code, telem, color }) => {
                    let low = 0;
                    let high = telem.time.length - 1;
                    while (low < high) {
                      const mid = Math.floor((low + high) / 2);
                      if (telem.time[mid] < currentTime) low = mid + 1;
                      else high = mid;
                    }
                    const idx = low;
                    const sp = telem.speed[idx] ?? 0;
                    const gr = telem.gear[idx] ?? 0;
                    const th = telem.throttle[idx] ?? 0;
                    const br = telem.brake[idx] ?? 0;

                    return (
                      <div
                        key={code}
                        className="p-1.5 bg-[var(--surface-2)] rounded border border-[var(--border)] flex items-center justify-between text-xs font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-bold text-[var(--text-1)]">{code}</span>
                        </div>
                        <div className="flex items-center gap-3.5 text-[11px]">
                          <span>
                            SPD: <strong className="text-[var(--text-1)]">{formatSpeed(sp, settings.units)}</strong>
                          </span>
                          <span>
                            GEAR: <strong className="text-[var(--text-1)]">{gr}</strong>
                          </span>
                          <span>
                            THR: <strong className="text-emerald-400">{Math.round(th)}%</strong>
                          </span>
                          <span>
                            BRK: <strong className="text-red-400">{Math.round(br)}%</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>

            {/* Stacked Telemetry Charts */}
            <Card className="p-3.5 space-y-4">
              {/* Speed Comparison Chart */}
              <div>
                <DistanceChart
                  title={`SPEED (${settings.units === 'imperial' ? 'MPH' : 'KM/H'})`}
                  data={speedChartData}
                  series={activeTelemetries.map((d) => ({
                    label: d.code,
                    stroke: d.color,
                    width: 2,
                  }))}
                  height={130}
                  currentDist={currentDistance}
                  yUnit=""
                />
              </div>

              {/* Delta Time Trace Chart */}
              {benchmark && activeTelemetries.length > 1 && (
                <div>
                  <DistanceChart
                    title={`DELTA TIME VS BENCHMARK (${benchmark.code})`}
                    data={deltaChartData}
                    series={activeTelemetries.map((d) => ({
                      label: `Δ ${d.code}`,
                      stroke: d.color,
                      width: 2,
                    }))}
                    height={110}
                    currentDist={currentDistance}
                    yUnit="s"
                  />
                </div>
              )}

              {/* Gear Traces Chart */}
              <div>
                <DistanceChart
                  title="GEAR SELECTION"
                  data={gearChartData}
                  series={activeTelemetries.map((d) => ({
                    label: `${d.code} Gear`,
                    stroke: d.color,
                    width: 1.5,
                  }))}
                  height={95}
                  yMin={1}
                  yMax={8}
                  currentDist={currentDistance}
                />
              </div>

              {/* Throttle & Brake Chart */}
              <div>
                <DistanceChart
                  title="THROTTLE (SOLID) & BRAKE (DASHED) (%)"
                  data={throttleChartData}
                  series={activeTelemetries.flatMap((d) => [
                    { label: `${d.code} Thr`, stroke: d.color, width: 1.5 },
                    { label: `${d.code} Brk`, stroke: '#e8002d', width: 1.5, dash: [4, 4] },
                  ])}
                  height={110}
                  yMin={0}
                  yMax={100}
                  currentDist={currentDistance}
                  yUnit="%"
                />
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};
