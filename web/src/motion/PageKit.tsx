import React, { useLayoutEffect, useRef, useState } from 'react';
import { Wordmark } from '@/components/ui/Wordmark';
import { useCurtain } from './Curtain';
import { useMagnetic } from './useMagnetic';
import { SplitRise, ProximityText, useInView } from './Kinetic';
import { useMotionStore } from './store';
import './page.css';

/** Fixed, blend-inverted top bar shared by editorial pages. */
export const PageNav: React.FC<{ section: string; backTestId?: string; to?: string | number; children?: React.ReactNode }> = ({ section, backTestId, to = '/', children }) => {
  const go = useCurtain();
  const ref = useMagnetic<HTMLButtonElement>(0.4, 60);
  return (
    <header className="pg-nav">
      <div className="flex items-center gap-2">
        <button ref={ref} className="pg-back" onClick={() => go(to, to === '/' ? 'Home' : 'Back')} data-testid={backTestId} aria-label="Back">
          <span data-magnetic-inner>← BACK</span>
        </button>
        <Wordmark size="sm" />
      </div>
      <div className="flex items-center gap-2"><span className="pg-crumb">{section}</span>{children}</div>
    </header>
  );
};

/** Masked rise for blocks: content slides up out of a clip when scrolled into view. */
export const Reveal: React.FC<{ children: React.ReactNode; delay?: number; className?: string }> = ({ children, delay = 0, className = '' }) => {
  const [ref, seen] = useInView<HTMLDivElement>(0.02);
  return (
    <div ref={ref} className={`reveal ${seen ? 'reveal-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
};

/** Giant page title with interactive proximity glyphs, telemetry badge and F1 slash. */
export const BigTitle: React.FC<{ text: string; sub?: string; tag?: string; live?: string }> = ({
  text,
  sub,
  tag = 'SYSTEM PREFERENCES',
  live = '25 Hz SYNC',
}) => {
  return (
    <div className="pg-title">
      <div className="pg-top-meta">
        <span className="tab">{tag}</span>
        <span className="pg-live"><i /> {live}</span>
      </div>
      <h1 data-parallax="0.1">
        <ProximityText text={text.toUpperCase()} radius={240} className="f1-i" />
      </h1>
      {sub && <p>{sub}</p>}
    </div>
  );
};

/** Sliding-pill single choice. The pill physically travels between options. */
export function Choice<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el) setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, options.length]);
  return (
    <div ref={wrap} className="choice" role="radiogroup" aria-label={label}>
      <i style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Pill switch with an overshooting thumb. */
export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button role="switch" aria-checked={checked} aria-label={label} className="sw" onClick={() => onChange(!checked)}><i /></button>
);
