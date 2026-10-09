import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { HomePage } from './features/home/HomePage';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { TraceLoader } from './motion/TraceLoader';
import { useSettingsStore } from './stores/settingsStore';
import { Cursor } from './motion/Cursor';
import { Intro } from './motion/Intro';
import { CurtainProvider } from './motion/Curtain';
import { useMotionStore } from './motion/store';

// Code-split heavy routes to hit initial bundle budget (< 400KB gzip)
const QualifyingPage = lazy(() =>
  import('./features/quali/QualifyingPage').then((m) => ({ default: m.QualifyingPage }))
);
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);
const RaceWorkspace = lazy(() =>
  import('./components/layout/RaceWorkspace').then((m) => ({ default: m.RaceWorkspace }))
);
const AnalysisWorkspace = lazy(() =>
  import('./features/analytics/AnalysisWorkspace').then((m) => ({ default: m.AnalysisWorkspace }))
);
const DevGallery = lazy(() =>
  import('./pages/DevGallery').then((m) => ({ default: m.DevGallery }))
);

const RouteLoadingFallback: React.FC = () => <TraceLoader kicker="F1 SYNAPSE" title={['Loading', 'engine']} />;

export const App: React.FC = () => {
  const density = useSettingsStore((s) => s.density);
  const setIntroDone = useMotionStore((s) => s.setIntroDone);
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion);

  // Sync density attribute and system prefers-reduced-motion
  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);

    const handler = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [setReducedMotion]);

  return (
    <ErrorBoundary>
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors
        toastOptions={{
          style: {
            background: 'var(--surface-3)',
            color: 'var(--text-1)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-sans)',
          },
        }}
      />
      <Cursor />
      <Intro onDone={setIntroDone} />
      <BrowserRouter>
        <CurtainProvider>
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/quali/:sid" element={<QualifyingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/race/:sid" element={<RaceWorkspace />} />
            <Route path="/analysis/:sid" element={<AnalysisWorkspace />} />
            <Route path="/dev/gallery" element={<DevGallery />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </CurtainProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};
