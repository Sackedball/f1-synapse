import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DockviewReact, DockviewReadyEvent, DockviewApi } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import './dockviewTheme.css';

import { useSessionStore } from '@/stores/sessionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { PlaybackClock, PlaybackStatus } from '@/engine/PlaybackClock';
import { FrameStore } from '@/engine/FrameStore';
import { Snapshot, createSnapshot } from '@/engine/snapshot';
import { fetchChunk } from '@/api/frames';

import { AnalyticsContext } from './AnalysisContext';
import { DOCKVIEW_COMPONENTS } from './panelWrappers';
import { PANEL_REGISTRY, PanelDefinition } from './panelRegistry';
import { PRESET_NAMES, PresetName, applyPreset } from './presets';

import { RaceStrip } from '@/features/race-strip/RaceStrip';
import { RaceTimeline } from '@/features/timeline/RaceTimeline';
import { TransportControls } from '@/features/transport/TransportControls';
import { TraceLoader } from '@/motion/TraceLoader';
import '@/components/layout/race.css';
import './analysis.css';
import { ErrorState } from '@/components/ui/ErrorState';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

import {
  Layout,
  Plus,
  Download,
  ChevronDown,
} from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

export const AnalysisWorkspace: React.FC = () => {
  const { sid = 'suzuka-2026-r3' } = useParams<{ sid: string }>();
  const { meta, weather, events, laps, stints, raceControl, loading, error, loadSession } =
    useSessionStore();
  const { savedLayouts, activeLayout, saveLayout, setActiveLayout } = useSettingsStore();

  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('paused');
  const [playheadTime, setPlayheadTime] = useState(0);
  const [clockRate, setClockRate] = useState(1.0);
  const [clock, setClock] = useState<PlaybackClock | null>(null);
  const [store, setStore] = useState<FrameStore | null>(null);

  // Layout save/export dialogs
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [importExportModalOpen, setImportExportModalOpen] = useState(false);
  const [importExportJson, setImportExportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // References
  const clockRef = useRef<PlaybackClock | null>(null);
  const storeRef = useRef<FrameStore | null>(null);
  const snapshotRef = useRef<Snapshot | null>(null);

  useEffect(() => {
    loadSession(sid);
  }, [sid, loadSession]);

  useEffect(() => {
    if (!meta) return;

    const initialTime = useSessionStore.getState().lastRaceTime || 0;
    const newClock = new PlaybackClock({
      durationSec: meta.durationSec || meta.totalFrames / meta.fps,
      initialTime,
      initialRate: 1.0,
    });
    clockRef.current = newClock;
    if (typeof window !== 'undefined') {
      (window as Window & { __clock?: PlaybackClock }).__clock = newClock;
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

    snapshotRef.current = createSnapshot(Math.max(20, meta.drivers.length));
    newStore.loadChunk(0).catch(() => {});

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

  const liveSnapshot = useMemo(() => {
    if (!storeRef.current || !snapshotRef.current || !meta) return null;
    const ok = storeRef.current.sample(playheadTime, snapshotRef.current);
    if (!ok) return null;
    return snapshotRef.current;
  }, [playheadTime, meta]);

  const drivers = meta ? meta.drivers : [];
  const durationSec = meta ? meta.durationSec || meta.totalFrames / meta.fps : 120;
  const totalLaps = meta?.totalLaps || 53;

  // Dockview Ready
  const onReady = (event: DockviewReadyEvent) => {
    const api = event.api;
    setDockviewApi(api);

    // Load saved or preset layout
    if (savedLayouts[activeLayout]) {
      try {
        const layoutObj = JSON.parse(savedLayouts[activeLayout]);
        api.fromJSON(layoutObj);
        return;
      } catch {
        // Fallback to preset
      }
    }

    const initialPreset = (PRESET_NAMES.includes(activeLayout as PresetName)
      ? activeLayout
      : 'Race Engineer') as PresetName;
    applyPreset(api, initialPreset);
  };

  // Switch layout preset
  const handleSelectPreset = (name: PresetName) => {
    if (!dockviewApi) return;
    setActiveLayout(name);
    applyPreset(dockviewApi, name);
  };

  // Add individual panel
  const handleAddPanel = (def: PanelDefinition) => {
    if (!dockviewApi) return;
    const existing = dockviewApi.getPanel(def.id);
    if (existing) {
      existing.api.setActive();
      return;
    }
    dockviewApi.addPanel({
      id: def.id,
      component: def.id,
      title: def.title,
    });
  };

  // Export Layout
  const handleOpenExport = () => {
    if (!dockviewApi) return;
    try {
      const json = JSON.stringify(dockviewApi.toJSON(), null, 2);
      setImportExportJson(json);
      setImportError(null);
      setImportExportModalOpen(true);
    } catch {
      // ignore
    }
  };

  // Import Layout
  const handleApplyImport = () => {
    if (!dockviewApi) return;
    try {
      const parsed = JSON.parse(importExportJson);
      dockviewApi.fromJSON(parsed);
      setImportExportModalOpen(false);
      setImportError(null);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Invalid JSON layout');
    }
  };

  // Save Custom Layout
  const handleSaveCustomLayout = () => {
    if (!dockviewApi || !newLayoutName.trim()) return;
    try {
      const json = JSON.stringify(dockviewApi.toJSON());
      saveLayout(newLayoutName.trim(), json);
      setSaveModalOpen(false);
      setNewLayoutName('');
    } catch {
      // ignore
    }
  };

  if (loading) return <TraceLoader kicker={`TELEMETRY · ${sid.toUpperCase()}`} title={['Pulling', 'the traces']} />;

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

  const contextValue = {
    meta,
    drivers,
    snapshot: liveSnapshot,
    store,
    clock,
    laps,
    stints,
    raceControl,
    weather,
    totalLaps,
  };

  return (
    <AnalyticsContext.Provider value={contextValue}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--surface-0)] text-[var(--text-1)] select-none">
        {/* 1. Header with Tab Switcher */}
        <div className="relative ws-down">
          <RaceStrip
            meta={meta}
            snapshot={liveSnapshot}
            weather={weather}
            playheadTime={playheadTime}
            clockRate={clockRate}
            playbackStatus={playbackStatus}
            activeTab="analysis"
            sid={sid}
          />
        </div>

        {/* 2. Analytics Toolbar */}
        <div className="ws-fade h-10 px-4 bg-[var(--surface-2)] border-b border-[var(--border)] flex items-center justify-between text-xs font-mono z-10">
          {/* Left: View Switcher Tabs + Preset Dropdown */}
          <div className="flex items-center gap-3">
            {/* View Switcher Tabs */}
            <div className="flex items-center bg-[var(--surface-3)] p-0.5 rounded-xs border border-[var(--border)]">
              <Link
                to={`/race/${sid}`}
                className="px-2.5 py-1 rounded-xs text-[10px] font-bold text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
              >
                RACE VIEW
              </Link>
              <span className="px-2.5 py-1 rounded-xs text-[10px] font-bold bg-[var(--accent)] text-white shadow-xs">
                ANALYSIS
              </span>
            </div>

            <div className="w-[1px] h-4 bg-[var(--border)]" />

            {/* Layout Preset Buttons */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--text-3)] font-bold uppercase mr-1">
                PRESET:
              </span>
              {PRESET_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => handleSelectPreset(name)}
                  className={cn(
                    'px-2 py-0.5 rounded-xs text-[11px] transition-colors cursor-pointer',
                    activeLayout === name
                      ? 'bg-[var(--surface-4)] text-[var(--text-1)] font-bold border border-[var(--border-hi)]'
                      : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]',
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Add Panel & Layout Actions */}
          <div className="flex items-center gap-2">
            {/* Add Panel Launcher Popover */}
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="px-2.5 py-1 rounded-xs bg-[var(--surface-3)] hover:bg-[var(--surface-4)] border border-[var(--border)] text-[var(--text-1)] flex items-center gap-1.5 cursor-pointer font-bold text-[11px]"
                  title="Add an Analytics Panel"
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>ADD PANEL</span>
                  <ChevronDown className="w-3 h-3 text-[var(--text-3)]" />
                </button>
              </Popover.Trigger>

              <Popover.Portal>
                <Popover.Content
                  side="bottom"
                  align="end"
                  sideOffset={6}
                  className="bg-[var(--surface-2)] border border-[var(--border-hi)] rounded-[var(--r-md)] p-2 shadow-2xl z-50 flex flex-col gap-1 w-64 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="text-[10px] font-mono font-bold uppercase text-[var(--text-3)] px-2 py-1">
                    AVAILABLE PANELS (7)
                  </div>
                  <div className="space-y-1">
                    {Object.values(PANEL_REGISTRY).map((def) => {
                      const Icon = def.icon;
                      return (
                        <button
                          key={def.id}
                          type="button"
                          onClick={() => handleAddPanel(def)}
                          className="w-full px-2 py-1.5 rounded-xs flex items-center gap-2.5 text-left text-xs hover:bg-[var(--surface-3)] cursor-pointer text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors"
                        >
                          <Icon className="w-4 h-4 text-[var(--accent)] shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold truncate leading-tight">{def.title}</p>
                            <p className="text-[10px] text-[var(--text-3)] truncate font-sans">
                              {def.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>

            {/* Save Layout Button */}
            <button
              type="button"
              onClick={() => setSaveModalOpen(true)}
              className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer"
              title="Save current layout as preset"
            >
              <Layout className="w-4 h-4" />
            </button>

            {/* Export / Import JSON */}
            <button
              type="button"
              onClick={handleOpenExport}
              className="p-1 rounded-xs hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-1)] cursor-pointer"
              title="Export / Import Layout JSON"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3. Dockview Main Workspace */}
        <main className="an-wipe flex-1 relative overflow-hidden bg-[var(--surface-0)]">
          <DockviewReact
            components={DOCKVIEW_COMPONENTS}
            onReady={onReady}
            className="dockview-theme-f1 h-full w-full"
          />
        </main>

        {/* 4. Footer Timeline & Transport Rail */}
        <footer className="ws-up shrink-0 flex flex-col bg-[var(--surface-1)] border-t border-[var(--border)] z-30">
          <RaceTimeline
            clock={clock}
            durationSec={durationSec}
            events={events}
            drivers={drivers}
            laps={laps}
            totalLaps={totalLaps}
            playbackStatus={playbackStatus}
          />
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
          />
        </footer>

        {/* Save Layout Modal */}
        <Dialog open={saveModalOpen} onOpenChange={setSaveModalOpen}>
          <DialogContent className="max-w-sm bg-[var(--surface-1)] border-[var(--border-hi)] text-[var(--text-1)]">
            <DialogHeader>
              <DialogTitle className="text-sm font-display">SAVE LAYOUT PRESET</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <input
                type="text"
                value={newLayoutName}
                onChange={(e) => setNewLayoutName(e.target.value)}
                placeholder="Enter preset name..."
                className="w-full px-3 py-1.5 rounded-xs bg-[var(--surface-2)] border border-[var(--border)] text-xs font-mono text-[var(--text-1)] outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSaveModalOpen(false)}
                  className="px-3 py-1 text-xs font-mono text-[var(--text-3)] hover:text-[var(--text-1)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustomLayout}
                  className="px-3 py-1 text-xs font-mono font-bold bg-[var(--accent)] text-white rounded-xs"
                >
                  Save
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Import/Export Modal */}
        <Dialog open={importExportModalOpen} onOpenChange={setImportExportModalOpen}>
          <DialogContent className="max-w-lg bg-[var(--surface-1)] border-[var(--border-hi)] text-[var(--text-1)]">
            <DialogHeader>
              <DialogTitle className="text-sm font-display">LAYOUT JSON EXPORT / IMPORT</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <textarea
                value={importExportJson}
                onChange={(e) => setImportExportJson(e.target.value)}
                rows={12}
                className="w-full p-2.5 rounded-xs bg-[var(--surface-2)] border border-[var(--border)] text-[11px] font-mono text-[var(--text-1)] outline-none resize-none"
              />
              {importError && (
                <p className="text-xs font-mono text-[var(--danger)]">{importError}</p>
              )}
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-[var(--text-3)]">
                  Paste JSON and click Import to restore
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setImportExportModalOpen(false)}
                    className="px-3 py-1 text-xs font-mono text-[var(--text-3)] hover:text-[var(--text-1)]"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyImport}
                    className="px-3 py-1 text-xs font-mono font-bold bg-[var(--accent)] text-white rounded-xs"
                  >
                    Import JSON
                  </button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AnalyticsContext.Provider>
  );
};
