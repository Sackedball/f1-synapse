import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { RaceStrip } from '@/features/race-strip/RaceStrip';
import { TimingTower } from '@/features/timing-tower/TimingTower';
import { TrackCanvas } from '@/features/track-canvas/TrackCanvas';
import { ContextPanel } from '@/features/context-panel/ContextPanel';
import { RaceTimeline } from '@/features/timeline/RaceTimeline';
import { TransportControls } from '@/features/transport/TransportControls';
import { KeyMomentsDrawer } from '@/features/key-moments/KeyMomentsDrawer';
import { ShortcutsModal } from '@/features/shortcuts/ShortcutsModal';
import { CommandPalette } from '@/features/command-palette/CommandPalette';
import { SplitRise } from '@/motion/Kinetic';
import './race.css';
import { ErrorState } from '@/components/ui/ErrorState';
import { PlaybackClock, PlaybackStatus } from '@/engine/PlaybackClock';
import { FrameStore } from '@/engine/FrameStore';
import { Snapshot, createSnapshot } from '@/engine/snapshot';
import { fetchChunk } from '@/api/frames';
import { useSessionStore, useUiStore, useSelectionStore } from '@/stores';
import { downloadWorkspaceSnapshot } from '@/utils/exportSnapshot';
import { showToast, showSuccessToast, showErrorToast } from '@/utils/toast';

/** Pre-race loader: a 20-slot starting grid whose boxes light in staggered pairs. */
const FormationLoader: React.FC<{ sid: string }> = ({ sid }) => (
  <div className="formation h-screen w-screen overflow-hidden relative text-[var(--paper)]" role="status" aria-label="Loading session">
    <div className="formation-grid" aria-hidden>
      {Array.from({ length: 20 }).map((_, i) => (
        <i key={i} style={{ ['--i' as string]: i, ['--row' as string]: i % 2 }} />
      ))}
    </div>
    <div className="formation-copy">
      <div className="formation-k">FORMATION LAP · {sid.toUpperCase()}</div>
      <h1><SplitRise text="Warming" step={40} /><br /><SplitRise text="the tyres" delay={260} step={40} /></h1>
    </div>
  </div>
);

export const RaceWorkspace: React.FC = () => {
  const { sid = 'suzuka-2026-r3' } = useParams<{ sid: string }>();
  const { meta, track, weather, events, laps, loading, error, loadSession } = useSessionStore();
  const {
    showProgressBar,
    toggleLabels,
    toggleLabelMode,
    toggleDrsZones,
    toggleProgressBar,
    toggleFocusMode,
    toggleFps,
  } = useUiStore();
  const { clearSelection, selectMomentDrivers } = useSelectionStore();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [keyMomentsOpen, setKeyMomentsOpen] = useState(false);

  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('paused');
  const [playheadTime, setPlayheadTime] = useState(0);
  const [dataVersion, setDataVersion] = useState(0);
  const [clockRate, setClockRate] = useState(1.0);
  const [clock, setClock] = useState<PlaybackClock | null>(null);
  const [store, setStore] = useState<FrameStore | null>(null);

  // References for PlaybackClock and FrameStore
  const clockRef = useRef<PlaybackClock | null>(null);
  const storeRef = useRef<FrameStore | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);

  // Initialize session and engine
  useEffect(() => {
    loadSession(sid);
  }, [sid, loadSession]);

  // When session metadata arrives, instantiate PlaybackClock and FrameStore
  useEffect(() => {
    if (!meta) return;

    const initialTime = useSessionStore.getState().lastRaceTime || 0;
    const newClock = new PlaybackClock({
      durationSec: meta.durationSec || (meta.totalFrames / meta.fps),
      initialTime,
      initialRate: 1.0,
    });
    clockRef.current = newClock;
    if (typeof window !== 'undefined') {
      (window as Window & { __clock?: PlaybackClock; __stores?: unknown }).__clock = newClock;
      (window as Window & { __clock?: PlaybackClock; __stores?: unknown }).__stores = {
        ui: useUiStore,
        selection: useSelectionStore,
      };
    }

    const newStore = new FrameStore({
      sid,
      totalFrames: meta.totalFrames,
      fps: meta.fps,
      chunkSize: meta.chunkSize,
      fetchChunk: (s, k) => fetchChunk(s, k),
      onBufferingChange: (buffering) => {
        newClock.setBuffering(buffering);
      },
    });
    storeRef.current = newStore;

    setClock(newClock);
    setStore(newStore);

    // Preallocate snapshot for UI sampling
    snapshotRef.current = createSnapshot(Math.max(20, meta.drivers.length));

    // Prefetch chunk 0 immediately and trigger initial UI update
    newStore.loadChunk(0).then(() => {
      setDataVersion((v) => v + 1);
    }).catch((err) => {
      console.warn('Initial chunk prefetch notice:', err);
    });

    // Throttled UI subscription (10 Hz)
    const unsubThrottled = newClock.subscribeThrottled((t, status) => {
      setPlayheadTime(t);
      useSessionStore.getState().setLastRaceTime(t);
      setPlaybackStatus(status);
      setClockRate(newClock.rate);
      newStore.prefetchAhead(t, newClock.rate);
    }, 10);

    return () => {
      unsubThrottled();
      newClock.destroy();
      clockRef.current = null;
      storeRef.current = null;
      setClock(null);
      setStore(null);
    };
  }, [meta, sid]);

  // Sample snapshot for TimingTower and ContextPanel at 10 Hz
  const liveSnapshot = useMemo(() => {
    // dataVersion triggers re-evaluation when chunk 0 arrives
    if (dataVersion < 0) return null;
    if (!storeRef.current || !snapshotRef.current || !meta) return null;
    const ok = storeRef.current.sample(playheadTime, snapshotRef.current);
    if (!ok) return null;
    return snapshotRef.current;
  }, [playheadTime, meta, dataVersion]);

  const durationSec = meta ? meta.durationSec || meta.totalFrames / meta.fps : 120;
  const totalLaps = meta?.totalLaps || 53;

  // Key moments navigation helpers
  const handleNextMoment = useCallback(() => {
    const clk = clockRef.current;
    if (!clk || !events || events.length === 0) return;
    const next = events.find((e) => e.t > clk.currentTime + 0.5);
    if (next) {
      clk.seek(Math.max(0, next.t - 3));
      if (next.drivers && next.drivers.length > 0) {
        selectMomentDrivers(next.drivers, 4);
      }
    }
  }, [events, selectMomentDrivers]);

  const handlePrevMoment = useCallback(() => {
    const clk = clockRef.current;
    if (!clk || !events || events.length === 0) return;
    const prev = [...events].reverse().find((e) => e.t < clk.currentTime - 0.5);
    if (prev) {
      clk.seek(Math.max(0, prev.t - 3));
      if (prev.drivers && prev.drivers.length > 0) {
        selectMomentDrivers(prev.drivers, 4);
      }
    }
  }, [events, selectMomentDrivers]);

  const handleStepLap = useCallback((direction: -1 | 1) => {
    const clk = clockRef.current;
    if (!clk || durationSec <= 0) return;
    const avgLapTime = durationSec / Math.max(1, totalLaps);
    const currentEstLap = Math.floor(clk.currentTime / avgLapTime);
    const targetLap = Math.max(0, Math.min(totalLaps - 1, currentEstLap + direction));
    clk.seek(targetLap * avgLapTime);
  }, [durationSec, totalLaps]);

  const [isExporting, setIsExporting] = useState(false);
  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    showToast('Exporting workspace snapshot...');
    try {
      const avgLapTime = durationSec / Math.max(1, totalLaps);
      const estLap = Math.min(totalLaps, Math.floor(playheadTime / Math.max(1, avgLapTime)) + 1);
      const filename = await downloadWorkspaceSnapshot({
        eventName: meta?.sessionName || sid,
        lap: estLap,
        timeSeconds: playheadTime,
      });
      showSuccessToast(`Saved snapshot: ${filename}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showErrorToast('Failed to export snapshot', msg);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, meta?.sessionName, sid, totalLaps, durationSec, playheadTime]);

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const clockInstance = clockRef.current;

      // Don't intercept typing in inputs or textareas
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      // Command palette trigger: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Escape: Close overlays or clear selection
      if (e.code === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
        if (keyMomentsOpen) {
          setKeyMomentsOpen(false);
          return;
        }
        clearSelection();
        return;
      }

      if (!clockInstance) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          clockInstance.toggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            handleStepLap(-1);
          } else {
            clockInstance.stepSeconds(-10);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            handleStepLap(1);
          } else {
            clockInstance.stepSeconds(10);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          clockInstance.setRate(Math.min(32, clockInstance.rate * 2));
          setClockRate(clockInstance.rate);
          break;
        case 'ArrowDown':
          e.preventDefault();
          clockInstance.setRate(Math.max(0.25, clockInstance.rate / 2));
          setClockRate(clockInstance.rate);
          break;
        case 'Digit1':
          clockInstance.setRate(1);
          setClockRate(1);
          break;
        case 'Digit2':
          clockInstance.setRate(2);
          setClockRate(2);
          break;
        case 'Digit3':
          clockInstance.setRate(4);
          setClockRate(4);
          break;
        case 'Digit4':
          clockInstance.setRate(8);
          setClockRate(8);
          break;
        case 'KeyR':
          clockInstance.restart();
          break;
        case 'KeyD':
          toggleDrsZones();
          break;
        case 'KeyB':
          toggleProgressBar();
          break;
        case 'KeyF':
          toggleFocusMode();
          break;
        case 'KeyL':
          if (e.shiftKey) {
            toggleLabelMode();
          } else {
            toggleLabels();
          }
          break;
        case 'KeyJ':
          e.preventDefault();
          handleNextMoment();
          break;
        case 'KeyK':
          e.preventDefault();
          handlePrevMoment();
          break;
        case 'Backquote':
          toggleFps();
          break;
        case 'KeyP':
          e.preventDefault();
          handleExport();
          break;
        case 'KeyH':
        case 'Slash':
          if (e.code === 'Slash' && !e.shiftKey) return; // Only '?'
          e.preventDefault();
          setShortcutsOpen((prev) => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    commandPaletteOpen,
    shortcutsOpen,
    keyMomentsOpen,
    toggleDrsZones,
    toggleProgressBar,
    toggleFocusMode,
    toggleLabels,
    toggleLabelMode,
    toggleFps,
    clearSelection,
    handleNextMoment,
    handlePrevMoment,
    handleStepLap,
    handleExport,
  ]);

  if (loading) return <FormationLoader sid={sid} />;

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--surface-0)] p-6">
        <ErrorState
          title="Failed to Load Session"
          message={error}
          onRetry={() => loadSession(sid)}
        />
      </div>
    );
  }

  const drivers = meta ? meta.drivers : [];

  return (
    <div
      id="race-workspace-root"
      className="race-workspace ws flex flex-col h-screen w-screen overflow-hidden bg-[var(--surface-0)] text-[var(--text-1)] select-none"
    >
      {/* 1. Race Strip Header (56px) */}
      <div className="ws-down"><RaceStrip
        meta={meta}
        snapshot={liveSnapshot}
        weather={weather}
        playheadTime={playheadTime}
        clockRate={clockRate}
        playbackStatus={playbackStatus}
        activeTab="race"
        sid={sid}
        onOpenHelp={() => setShortcutsOpen(true)}
      /></div>

      {/* 2. Middle Row: Timing Tower (320px) | Canvas (1fr) | Context Panel (360px) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Timing Tower */}
        <div className="ws-left scan shrink-0 w-72 lg:w-80 panel-focus-highlight border-r border-[var(--border)] h-full overflow-hidden">
          <TimingTower
            drivers={drivers}
            snapshot={liveSnapshot}
            totalLaps={totalLaps}
          />
        </div>

        {/* Canvas Viewport */}
        <main data-cursor="hide" className="ws-fade flex-1 relative bg-[var(--surface-0)] overflow-hidden h-full panel-focus-highlight">
          <TrackCanvas
            clock={clock}
            store={store}
            track={track}
            drivers={drivers}
            circuitName={meta?.circuitName}
            className="w-full h-full"
          />
        </main>

        {/* Context Panel (Collapsible on screens < 1280px) */}
        <div className="ws-right scan hidden xl:block w-[340px] 2xl:w-[360px] shrink-0 panel-focus-highlight border-l border-[var(--border)] h-full overflow-hidden">
          <ContextPanel
            drivers={drivers}
            snapshot={liveSnapshot}
            store={store}
            weather={weather}
            totalLaps={totalLaps}
            clock={clock}
            events={events}
            onOpenAllMoments={() => setKeyMomentsOpen(true)}
          />
        </div>
      </div>

      {/* 3. Footer Timeline Rail & Transport Controls */}
      <footer className="ws-up shrink-0 flex flex-col bg-[var(--surface-1)] border-t border-[var(--border)] z-30">
        {showProgressBar && (
          <RaceTimeline
            clock={clock}
            durationSec={durationSec}
            events={events}
            drivers={drivers}
            laps={laps}
            totalLaps={totalLaps}
            playbackStatus={playbackStatus}
            onEventSelect={(ev) => {
              if (ev.drivers && ev.drivers.length > 0) {
                selectMomentDrivers(ev.drivers, 4);
              }
            }}
          />
        )}
        <TransportControls
          clock={clock}
          durationSec={durationSec}
          playbackStatus={playbackStatus}
          rate={clockRate}
          onRateChange={(r) => {
            if (clock) {
              clock.setRate(r);
              setClockRate(r);
            }
          }}
          laps={laps}
          totalLaps={totalLaps}
          onToggleKeyMoments={() => setKeyMomentsOpen((o) => !o)}
          keyMomentsOpen={keyMomentsOpen}
          onExport={handleExport}
          isExporting={isExporting}
        />
      </footer>

      {/* Key Moments Drawer */}
      <KeyMomentsDrawer
        open={keyMomentsOpen}
        onClose={() => setKeyMomentsOpen(false)}
        events={events}
        clock={clock}
        drivers={drivers}
        currentTime={playheadTime}
      />

      {/* Keyboard Shortcuts Reference Dialog */}
      <ShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

      {/* Command Palette (Ctrl/Cmd+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        clock={clock}
        drivers={drivers}
        events={events}
        totalLaps={totalLaps}
        durationSec={durationSec}
        onOpenMoments={() => setKeyMomentsOpen(true)}
        onOpenHelp={() => setShortcutsOpen(true)}
      />
    </div>
  );
};
