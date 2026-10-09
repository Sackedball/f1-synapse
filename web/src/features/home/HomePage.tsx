import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Wordmark } from '@/components';
import { api } from '@/api/client';
import { RoundSummary, CacheStatusResponse } from '@/api/types';
import { getRecentSessions, RecentSession } from './recents';
import { getCircuitForEvent } from './circuits';
import { SessionLoadModal } from './SessionLoadModal';
import { useCurtain } from '@/motion/Curtain';
import { useMagnetic } from '@/motion/useMagnetic';
import { SplitRise, ProximityText, Count, useInView } from '@/motion/Kinetic';
import { useMotionStore } from '@/motion/store';
import { lerp } from '@/motion/pointer';
import { CircuitStage } from './CircuitStage';
import './home.css';

const SEASONS = [2026, 2025, 2024, 2023, 2022];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const go = useCurtain();
  const introDone = useMotionStore((st) => st.introDone);
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  // Season selection
  const [selectedSeason, setSelectedSeason] = useState<number>(2026);
  const [schedule, setSchedule] = useState<RoundSummary[]>([]);
  const [cacheStatus, setCacheStatus] = useState<CacheStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorInfo, setErrorInfo] = useState<{ message: string; detail?: string } | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
  const [recents, setRecents] = useState<RecentSession[]>([]);

  // Load modal state
  const [activeLoad, setActiveLoad] = useState<{
    year: number;
    round: number;
    type: string;
    eventName: string;
    refresh?: boolean;
  } | null>(null);

  // Deep link check
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (sessionParam) {
      if (sessionParam.endsWith('_Q') || sessionParam.endsWith('_SQ')) {
        navigate(`/quali/${encodeURIComponent(sessionParam)}`);
      } else {
        navigate(`/race/${encodeURIComponent(sessionParam)}`);
      }
    }
  }, [searchParams, navigate]);

  // Load recents on mount
  useEffect(() => {
    setRecents(getRecentSessions());
  }, []);

  // Fetch season schedule & cache status
  const fetchSeasonData = async (year: number) => {
    setIsLoading(true);
    setErrorInfo(null);
    try {
      const [schedRes, cacheRes] = await Promise.all([
        api.getSeasonSchedule(year),
        api.getCacheStatus(year).catch(() => ({ rounds: [] })),
      ]);
      setSchedule(schedRes);
      setCacheStatus(cacheRes);
    } catch (err: unknown) {
      console.warn(`Failed to fetch season ${year} schedule:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorInfo({
        message: 'FastF1 schedule service is currently unreachable. Showing locally cached data.',
        detail: msg,
      });

      // Fallback: If year is 2026, provide default Suzuka fixture
      if (year === 2026) {
        setSchedule([
          {
            round: 3,
            name: 'Japanese Grand Prix',
            country: 'Japan',
            location: 'Suzuka',
            date: '2026-04-07',
            sessions: ['FP1', 'FP2', 'FP3', 'Qualifying', 'Race'],
          },
        ]);
        setCacheStatus({
          rounds: [
            {
              round: 3,
              sessions: [
                { type: 'FP1', cached: false },
                { type: 'FP2', cached: false },
                { type: 'FP3', cached: false },
                { type: 'Q', cached: true },
                { type: 'R', cached: true },
              ],
            },
          ],
        });
      } else {
        setSchedule([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSeasonData(selectedSeason);
  }, [selectedSeason]);

  const isSessionCached = (roundNum: number, sessionType: string): boolean => {
    if (!cacheStatus || !cacheStatus.rounds) return false;
    const r = cacheStatus.rounds.find((rnd) => rnd.round === roundNum);
    if (!r || !r.sessions) return false;
    const s = r.sessions.find((sess) => sess.type === sessionType);
    return !!s?.cached;
  };

  const preloadWorkspace = () => {
    try {
      import('@/components/layout/RaceWorkspace');
    } catch {
      // ignore
    }
  };

  const handleLaunchSession = (
    year: number,
    round: number,
    type: string,
    eventName: string,
    refresh = false,
  ) => {
    preloadWorkspace();
    setActiveLoad({
      year,
      round,
      type,
      eventName,
      refresh,
    });
  };


  const evOf = (id: string | null) => schedule.find((e) => String(e.round) === id) ?? null;
  const stageEv = evOf(hover) ?? schedule.find((e) => isSessionCached(e.round, 'R')) ?? schedule[0] ?? null;
  const stageCircuit = stageEv ? getCircuitForEvent(stageEv) : null;
  useScrollMotion(scroller);

  return (
    <div ref={scroller} className="home h-screen w-screen overflow-y-auto overflow-x-hidden">
      <Spine scroller={scroller} />

      <header className="h-nav">
        <Wordmark size="sm" />
        <nav className="flex items-center">
          <MagLink onClick={() => go('/dev/gallery', 'Gallery')}>Gallery</MagLink>
          <MagLink onClick={() => go('/settings', 'Settings')} testId="home-settings-btn">Settings</MagLink>
        </nav>
      </header>

      <div className="home-split">
      <div className="home-main">
      {/* ───── HERO ───── */}
      <section className="hero">
        <div className="hero-top">
          <span className="tab">FORMULA 1 · TELEMETRY REPLAY</span>
          <span className="hero-live"><i /> 25 Hz SYNC</span>
        </div>
        <div className="hero-year" data-parallax="0.12">
          <ProximityText text={String(selectedSeason)} radius={260} />
          <span className="hero-slash" aria-hidden />
        </div>
        <div className="hero-foot">
          <p className="hero-copy">
            <SplitRise play={introDone} text="Every lap, 25 times a second." delay={900} step={18} />
            <br />
            <span style={{ opacity: 0.7 }}>Pick a weekend. Scrub the grid. Watch the race rewrite itself.</span>
          </p>
          <div className="years" role="group" aria-label="Season">
            {SEASONS.map((y) => (
              <YearBtn key={y} year={y} active={y === selectedSeason} onPick={() => setSelectedSeason(y)} />
            ))}
          </div>
        </div>
      </section>

      <div className="ticker" aria-hidden>
        <div className="ticker-run">
          {[0, 1].map((k) => (
            <span key={k}>
              {(schedule.length ? schedule : [{ round: 0, name: 'Loading calendar', location: '', country: '', date: '' } as RoundSummary]).map((e) => (
                <b key={e.round}>R{String(e.round).padStart(2, '0')} <em>{e.name.replace(' Grand Prix', '').toUpperCase()}</em> {e.location?.toUpperCase()} <i /></b>
              ))}
            </span>
          ))}
        </div>
      </div>

      {errorInfo && (
        <div className="err" role="alert">
          <span>{errorInfo.message}{showErrorDetails && errorInfo.detail ? ` — ${errorInfo.detail}` : ''}</span>
          <span className="flex">
            <MagLink onClick={() => setShowErrorDetails(!showErrorDetails)}>Details</MagLink>
            <MagLink onClick={() => fetchSeasonData(selectedSeason)}>Retry</MagLink>
          </span>
        </div>
      )}

      {/* ───── RECENTS ───── */}
      {recents.length > 0 && (
        <section className="recents">
          <div className="sec-label">LAST ON TRACK</div>
          <div className="recent-track">
            {recents.map((rc) => (
              <button
                key={rc.sessionId}
                className="recent"
                data-cursor="view"
                data-cursor-label="REPLAY"
                data-testid={`recent-card-${rc.sessionId}`}
                onClick={() =>
                  go(
                    rc.type === 'Q' || rc.type === 'SQ' ? `/quali/${encodeURIComponent(rc.sessionId)}` : `/race/${encodeURIComponent(rc.sessionId)}`,
                    rc.eventName,
                  )
                }
              >
                <div className="row-meta" style={{ marginTop: 0 }}><span>{rc.year}</span><span>R{rc.round}</span></div>
                <div className="big">{rc.eventName}</div>
                <div className="row-meta" style={{ marginTop: 0 }}>{rc.type === 'Q' ? 'Qualifying' : 'Race'} →</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ───── INDEX ───── */}
      <section className="index">
        <div className="idx-head">
          <span>{selectedSeason} / <Count key={selectedSeason + ':' + schedule.length} to={schedule.length} /> ROUNDS</span>
          <span>● CACHED &nbsp; ○ NEEDS DOWNLOAD</span>
        </div>

        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => <div key={i} className="sk" style={{ ['--i' as string]: i, ['--w' as string]: `${(i * 17) % 40}%` }} />)
        ) : schedule.length === 0 ? (
          <div className="row" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <div className="row-name" style={{ fontSize: 'clamp(28px,5vw,72px)' }}>Nothing on the grid</div>
              <div className="row-meta">No events for {selectedSeason}. Try another season or check your connection.</div>
            </div>
          </div>
        ) : (
          schedule.map((ev) => (
            <Row
              key={`${selectedSeason}-${ev.round}`}
              ev={ev}
              raceCached={isSessionCached(ev.round, 'R')}
              qualiCached={isSessionCached(ev.round, 'Q')}
              onHover={(on) => on && setHover(String(ev.round))}
              onLaunch={(type, refresh) => handleLaunchSession(selectedSeason, ev.round, type, ev.name, refresh)}
            />
          ))
        )}
      </section>

      </div>
      {stageCircuit && stageEv && (
        <CircuitStage circuit={stageCircuit} round={stageEv.round} date={stageEv.date} label={stageEv.name.replace(' Grand Prix', ' GP')} />
      )}
      </div>

      <footer className="outro" aria-hidden>
        <div className="checker outro-flag" />
        <div className="outro-band" data-parallax="-0.9">LIGHTS OUT<span>.</span> LIGHTS OUT<span>.</span> LIGHTS OUT<span>.</span></div>
      </footer>

      {activeLoad && (
        <SessionLoadModal
          year={activeLoad.year}
          round={activeLoad.round}
          type={activeLoad.type}
          eventName={activeLoad.eventName}
          refresh={activeLoad.refresh}
          isOpen={!!activeLoad}
          onClose={() => setActiveLoad(null)}
        />
      )}
    </div>
  );
};

/* ───────────────────────── pieces ───────────────────────── */

const MagLink: React.FC<{ onClick: () => void; children: React.ReactNode; testId?: string }> = ({ onClick, children, testId }) => {
  const ref = useMagnetic<HTMLButtonElement>(0.4, 60);
  return (
    <button ref={ref} className="h-link" onClick={onClick} data-testid={testId}>
      <span data-magnetic-inner>{children}</span>
    </button>
  );
};

const YearBtn: React.FC<{ year: number; active: boolean; onPick: () => void }> = ({ year, active, onPick }) => {
  const ref = useMagnetic<HTMLButtonElement>(0.3, 50);
  return (
    <button ref={ref} className="year-btn" aria-pressed={active} onClick={onPick} data-testid={`season-tab-${year}`}>
      <span data-magnetic-inner>{year}</span>
    </button>
  );
};

const ActBtn: React.FC<{ label: string; cached: boolean; q?: boolean; onClick: () => void; testId: string }> = ({ label, cached, q, onClick, testId }) => {
  const ref = useMagnetic<HTMLButtonElement>(0.32, 70);
  return (
    <button ref={ref} className={`act ${q ? 'q' : ''}`} onClick={onClick} data-testid={testId} aria-label={`${label} ${cached ? '(cached)' : '(download)'}`}>
      <span data-magnetic-inner>{label}<span className="sector" aria-hidden><i className={cached ? (q ? 'on2' : 'on1') : ''} /><i className={cached ? (q ? 'on2' : 'on1') : ''} /><i className={cached ? (q ? 'on2' : 'on1') : ''} /></span></span>
    </button>
  );
};

const Row: React.FC<{
  ev: RoundSummary; raceCached: boolean; qualiCached: boolean;
  onHover: (on: boolean) => void; onLaunch: (type: string, refresh?: boolean) => void;
}> = ({ ev, raceCached, qualiCached, onHover, onLaunch }) => {
  const [ref, seen] = useInView<HTMLDivElement>(0.2);
  const intro = useMotionStore((s) => s.introDone);
  return (
    <div
      ref={ref}
      className="row"
      data-testid={`race-card-round-${ev.round}`}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
    >
      <div className="row-pos"><b>{String(ev.round).padStart(2, '0')}</b></div>
      <div>
        <h3 className="row-name f1-name">
          <SplitRise text={ev.name.replace(' Grand Prix', ' GP')} play={seen && intro} step={22} />
        </h3>
        <div className="row-meta">
          <span>{ev.location ? `${ev.location}, ` : ''}{ev.country}</span>
          <span>{ev.date}</span>
        </div>
      </div>
      <div className="row-act">
        <button className="refresh" onClick={() => onLaunch('R', true)} title="Force refresh and re-download session data">↻ RE-DOWNLOAD</button>
        <ActBtn label="RACE" cached={raceCached} onClick={() => onLaunch('R')} testId={`launch-race-btn-${ev.round}`} />
        <ActBtn label="QUALI" q cached={qualiCached} onClick={() => onLaunch('Q')} testId={`launch-quali-btn-${ev.round}`} />
      </div>
    </div>
  );
};

/** Scroll progress drawn as a racing line down the right edge, with a car riding it. */
const SPINE = 'M14,0 C14,80 2,110 2,200 S26,300 26,400 S4,520 4,620 S24,760 24,860 S14,950 14,1000';
const Spine: React.FC<{ scroller: React.RefObject<HTMLDivElement | null> }> = ({ scroller }) => {
  const run = useRef<SVGPathElement>(null);
  const rail = useRef<SVGPathElement>(null);
  const car = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current; if (!el) return;
    const on = () => {
      const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      if (run.current) run.current.style.strokeDashoffset = String(1 - p);
      const r = rail.current; if (!r || !car.current) return;
      const pt = r.getPointAtLength(p * r.getTotalLength());
      car.current.style.left = `${(pt.x / 28) * 100}%`; car.current.style.top = `${pt.y / 10}%`;
    };
    on(); el.addEventListener('scroll', on, { passive: true }); return () => el.removeEventListener('scroll', on);
  }, [scroller]);
  return (
    <div className="spine" aria-hidden>
      <svg viewBox="0 0 28 1000" preserveAspectRatio="none">
        <path ref={rail} d={SPINE} className="rail" vectorEffect="non-scaling-stroke" />
        <path ref={run} d={SPINE} className="run" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 }} vectorEffect="non-scaling-stroke" />
      </svg>
      <div ref={car} className="spine-car" />
    </div>
  );
};

/** Scroll-driven parallax + velocity skew on every [data-parallax] element. */
function useScrollMotion(scroller: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = scroller.current; if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = [...el.querySelectorAll<HTMLElement>('[data-parallax]')];
    let last = el.scrollTop, vel = 0, raf = 0;
    const loop = () => {
      const y = el.scrollTop; vel = lerp(vel, y - last, 0.15); last = y;
      const skew = Math.max(-12, Math.min(12, vel * -0.35));
      items.forEach((it) => {
        const k = parseFloat(it.dataset.parallax ?? '0');
        const r = it.getBoundingClientRect();
        const isBand = it.classList.contains('hero-band') || it.classList.contains('outro-band');
        const x = isBand ? r.top * k * 1.2 : 0;
        const ty = isBand ? 0 : y * -k * 0.5;
        it.style.transform = `translate3d(${x.toFixed(1)}px, ${ty.toFixed(1)}px, 0) skewX(${skew.toFixed(2)}deg)`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [scroller]);
}
