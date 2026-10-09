import React from 'react';
import { Wordmark, Button, Card, Badge } from '@/components';
import { Play, LayoutGrid, Cpu } from 'lucide-react';

export const Home: React.FC = () => {
  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text-1)] flex flex-col items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-8 text-center">
        {/* Brand */}
        <div className="space-y-3 flex flex-col items-center">
          <Wordmark size="lg" />
          <Badge variant="insight" dot>BROADCAST TELEMETRY & RACE REPLAY ENGINE</Badge>
          <p className="text-sm text-[var(--text-2)] max-w-md mx-auto">
            High-fidelity Formula 1 session visualization powered by vectorized columnar frame stores and hardware-accelerated canvas rendering.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
          <Card className="p-5 flex flex-col justify-between hover:border-[var(--accent)] transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-2 text-[var(--accent)] font-bold text-xs uppercase font-mono">
                <Play className="w-3.5 h-3.5" />
                Featured Session
              </div>
              <h3 className="font-display font-bold text-base text-[var(--text-1)] mb-1">
                Japanese Grand Prix 2024
              </h3>
              <p className="text-xs text-[var(--text-3)] mb-4">
                Suzuka International Racing Course (5.807 km). Verified binary fixture playback.
              </p>
            </div>
            <a href="/race/suzuka-2026-r3?fixture=suzuka-2026-r3">
              <Button variant="primary" size="sm" className="w-full gap-2">
                <Play className="w-3.5 h-3.5 fill-current" />
                Launch Replay
              </Button>
            </a>
          </Card>

          <Card className="p-5 flex flex-col justify-between hover:border-[var(--insight)] transition-colors">
            <div>
              <div className="flex items-center gap-2 mb-2 text-[var(--insight)] font-bold text-xs uppercase font-mono">
                <LayoutGrid className="w-3.5 h-3.5" />
                Design System
              </div>
              <h3 className="font-display font-bold text-base text-[var(--text-1)] mb-1">
                Component Gallery
              </h3>
              <p className="text-xs text-[var(--text-3)] mb-4">
                Comprehensive visual verification of all design tokens, UI components, and states.
              </p>
            </div>
            <a href="/dev/gallery">
              <Button variant="secondary" size="sm" className="w-full gap-2">
                <LayoutGrid className="w-3.5 h-3.5" />
                Open /dev/gallery
              </Button>
            </a>
          </Card>
        </div>

        {/* Engine specs banner */}
        <div className="flex items-center justify-center gap-6 text-[11px] font-mono text-[var(--text-3)] border-t border-[var(--border)] pt-4">
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-[var(--success)]" /> 25 FPS Interpolated Clock
          </span>
          <span>•</span>
          <span>Zero-Allocation Sampling</span>
          <span>•</span>
          <span>F1SC Binary Stream</span>
        </div>
      </div>
    </div>
  );
};
