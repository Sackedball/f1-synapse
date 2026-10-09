import React, { useState, useEffect } from 'react';
import { Slider, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/api/client';
import { showSuccessToast, showErrorToast } from '@/utils/toast';
import { PageNav, Reveal, BigTitle, Choice, Switch } from '@/motion/PageKit';
import { useMagnetic } from '@/motion/useMagnetic';
import { Count } from '@/motion/Kinetic';

const SECTIONS = [
  { id: 'storage', n: '01', t: 'STORAGE' },
  { id: 'display', n: '02', t: 'DISPLAY' },
  { id: 'access', n: '03', t: 'ACCESS' },
  { id: 'keys', n: '04', t: 'KEYS' },
  { id: 'about', n: '05', t: 'ABOUT' },
];

const PBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'ghost' | 'danger' }> = ({ tone, className = '', children, ...r }) => {
  const ref = useMagnetic<HTMLButtonElement>(0.3, 60);
  return <button ref={ref} className={`pbtn ${tone ?? ''} ${className}`} {...r}><span data-magnetic-inner>{children}</span></button>;
};

export const SettingsPage: React.FC = () => {
  const root = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('storage');
  const settings = useSettingsStore();

  // Local form state for backend paths
  const [cacheLoc, setCacheLoc] = useState(settings.cacheLocation);
  const [dataLoc, setDataLoc] = useState(settings.computedDataLocation);
  const [cacheSizeMb, setCacheSizeMb] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Clear cache confirmation modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  useEffect(() => {
    const el = root.current; if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { root: el, rootMargin: '-40% 0px -50% 0px' });
    SECTIONS.forEach((x) => { const n = el.querySelector('#' + x.id); if (n) io.observe(n); });
    return () => io.disconnect();
  }, []);

  const setStoreCache = settings.setCacheLocation;
  const setStoreData = settings.setComputedDataLocation;

  // Load current settings from backend
  useEffect(() => {
    let active = true;
    api
      .getSettings()
      .then((res) => {
        if (!active) return;
        setCacheLoc(res.cacheLocation);
        setDataLoc(res.computedDataLocation);
        setCacheSizeMb(res.cacheSizeMb);
        setStoreCache(res.cacheLocation);
        setStoreData(res.computedDataLocation);
      })
      .catch((err) => {
        console.warn('Failed to fetch settings from backend:', err);
      });
    return () => {
      active = false;
    };
  }, [setStoreCache, setStoreData]);

  const handleSavePaths = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const res = await api.updateSettings({
        cacheLocation: cacheLoc,
        computedDataLocation: dataLoc,
      });
      setCacheLoc(res.cacheLocation);
      setDataLoc(res.computedDataLocation);
      setCacheSizeMb(res.cacheSizeMb);
      setStoreCache(res.cacheLocation);
      setStoreData(res.computedDataLocation);
      setSaveStatus({ type: 'success', message: 'Storage paths validated and saved.' });
      showSuccessToast('Storage paths validated and saved.');
    } catch (err: unknown) {
      const errObj = err as { detail?: { message?: string }; message?: string };
      const msg = errObj?.detail?.message || errObj?.message || 'Failed to update paths. Check that directories exist.';
      setSaveStatus({ type: 'error', message: msg });
      showErrorToast('Failed to update settings', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      const res = await api.clearCache();
      setClearMessage(res.message);
      setCacheSizeMb(0);
      showSuccessToast(res.message || 'Cache cleared successfully');
      setTimeout(() => {
        setShowClearModal(false);
        setClearMessage(null);
      }, 1500);
    } catch (err: unknown) {
      const errObj = err as { message?: string };
      const msg = errObj?.message || 'Failed to clear cache.';
      setClearMessage(msg);
      showErrorToast('Failed to clear cache', msg);
    } finally {
      setIsClearing(false);
    }
  };


  const keyRows: [string, string[]][] = [
    ['Play / pause replay', ['Space']],
    ['Step 5 seconds', ['←', '→']],
    ['Fine step 1 second', ['Shift', '→']],
    ['Playback speed', ['1', '2', '3', '4']],
    ['Restart session', ['R']],
    ['Command palette', ['Ctrl', 'K']],
  ];

  return (
    <div ref={root} className="pg h-screen w-screen overflow-y-auto overflow-x-hidden">
      <PageNav section="SETTINGS" backTestId="settings-back-btn" />
      <nav className="pg-rail" aria-label="Sections">
        {SECTIONS.map((x) => (
          <button key={x.id} aria-current={active === x.id} data-cursor="link"
            onClick={() => root.current?.querySelector('#' + x.id)?.scrollIntoView({ behavior: 'smooth' })}>{x.n} {x.t}</button>
        ))}
      </nav>

      <BigTitle text="Settings" sub="Where the data lives, how it reads, and how it moves. Changes apply instantly." />

      {/* 01 */}
      <section id="storage" className="sec">
        <div className="sec-k"><b>01</b>DATA & CACHE<div style={{ marginTop: 12 }}><Count to={cacheSizeMb} pad={1} /> MB ON DISK</div></div>
        <Reveal>
          <div className="field">
            <label htmlFor="cache-path">FastF1 cache directory</label>
            <input id="cache-path" className="line-in" value={cacheLoc} onChange={(e) => setCacheLoc(e.target.value)} placeholder=".fastf1-cache" data-testid="cache-path-input" />
            <p className="hint">Local directory FastF1 uses for raw timing and telemetry pickles.</p>
          </div>
          <div className="field">
            <label htmlFor="data-path">Computed data directory</label>
            <input id="data-path" className="line-in" value={dataLoc} onChange={(e) => setDataLoc(e.target.value)} placeholder="computed_data" data-testid="data-path-input" />
            <p className="hint">Processed 25 Hz columnar arrays and extracted session event databases.</p>
          </div>
          {saveStatus && <div className={`msg ${saveStatus.type === 'success' ? 'ok' : 'bad'}`} data-testid="save-status-msg" role="status" style={{ marginTop: 24 }}>{saveStatus.message}</div>}
          <div className="field-row" style={{ paddingTop: 32 }}>
            <PBtn onClick={handleSavePaths} disabled={isSaving} data-testid="save-paths-btn">{isSaving ? 'Saving…' : 'Save paths'}</PBtn>
            <PBtn tone="danger" className="ghost" onClick={() => setShowClearModal(true)} data-testid="open-clear-cache-modal-btn">Clear cache files</PBtn>
          </div>
        </Reveal>
      </section>

      {/* 02 */}
      <section id="display" className="sec">
        <div className="sec-k"><b>02</b>DISPLAY & UNITS</div>
        <Reveal>
          <div className="field">
            <span className="lbl">Units</span>
            <Choice label="Measurement units" value={settings.units} onChange={settings.setUnits}
              options={[{ value: 'metric', label: 'Metric · km/h °C' }, { value: 'imperial', label: 'Imperial · mph °F' }]} />
            <p className="hint">Applies to the tower, delta charts, context panel and track overlays.</p>
          </div>
          <div className="field">
            <span className="lbl">Density</span>
            <Choice label="UI density" value={settings.density} onChange={settings.setDensity}
              options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
            <p className="hint">Row padding and spacing on timing towers and leaderboards.</p>
          </div>
          <div className="field">
            <div className="field-row"><span className="lbl">Motion trails</span><span style={{ font: '800 clamp(28px,4vw,56px)/1 var(--font-display)', color: 'var(--accent-bright)' }}>{settings.trailsLength}<small style={{ fontSize: 12, marginLeft: 8, opacity: .6 }}>FRAMES</small></span></div>
            <Slider min={5} max={50} step={5} value={[settings.trailsLength]} onValueChange={(v) => settings.setTrailsLength(v[0])} />
          </div>
          <div className="field field-row">
            <div><span className="lbl">Performance mode</span><p className="hint">Disables track drop-shadows and trims background rendering.</p></div>
            <Switch label="Performance mode" checked={settings.performanceMode} onChange={settings.setPerformanceMode} />
          </div>
        </Reveal>
      </section>

      {/* 03 */}
      <section id="access" className="sec">
        <div className="sec-k"><b>03</b>ACCESSIBILITY</div>
        <Reveal>
          <div className="field field-row">
            <div><span className="lbl">Reduced motion</span><p className="hint">Calms transitions, cursor, intro and spring animations.</p></div>
            <Switch label="Reduced motion" checked={settings.reducedMotion} onChange={settings.setReducedMotion} />
          </div>
          <div className="field field-row">
            <div><span className="lbl">Colorblind-safe</span><p className="hint">Higher-contrast flags, sector colours and compound badges.</p></div>
            <Switch label="Colorblind-safe mode" checked={settings.colorblindMode} onChange={settings.setColorblindMode} />
          </div>
        </Reveal>
      </section>

      {/* 04 */}
      <section id="keys" className="sec">
        <div className="sec-k"><b>04</b>KEYBOARD</div>
        <Reveal>
          <div className="keys">
            {keyRows.map(([l, ks]) => (
              <div key={l} className="key-row"><span>{l}</span><span>{ks.map((k) => <span key={k} className="cap">{k}</span>)}</span></div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* 05 */}
      <section id="about" className="sec" style={{ paddingBottom: '16vh' }}>
        <div className="sec-k"><b>05</b>ABOUT</div>
        <Reveal>
          <p style={{ font: '800 clamp(24px,3.4vw,52px)/1.05 var(--font-display)', textTransform: 'uppercase', letterSpacing: '-.02em', maxWidth: '18ch' }}>F1 Synapse v1.0.0</p>
          <p className="hint" style={{ marginTop: 24 }}>Broadcast-quality telemetry replay and predictive race analytics. Data via FastF1 and OpenF1. Formula 1 and F1 are trademarks of Formula One Licensing B.V.; this is an unofficial viewer, not endorsed by Formula 1 companies.</p>
          <p className="hint" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 16 }}>F1SC Binary Stream 25 Hz · PixiJS v8 · Columnar buffers</p>
        </Reveal>
      </section>

      <Dialog open={showClearModal} onOpenChange={setShowClearModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Clear FastF1 cache files</DialogTitle></DialogHeader>
          <div className="space-y-4 text-xs text-[var(--text-2)]">
            <p>This deletes cached SQLite tables and pickles from <code className="text-[var(--accent)]">{cacheLoc}</code>. Next loads will re-download from the internet.</p>
            {clearMessage && <div className="p-2.5 bg-[var(--surface-3)] border border-[var(--border)] rounded font-mono">{clearMessage}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <PBtn tone="ghost" onClick={() => setShowClearModal(false)} disabled={isClearing}>Cancel</PBtn>
              <PBtn tone="danger" onClick={handleClearCache} disabled={isClearing} data-testid="confirm-clear-cache-btn">{isClearing ? 'Clearing…' : 'Confirm clear'}</PBtn>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
