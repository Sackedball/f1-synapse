import React, { useEffect, useState } from 'react';
import { prefersReduced } from './pointer';

const LINE = 'M 20,150 C 90,150 110,60 190,70 S 300,150 360,110 S 470,30 560,60 S 640,140 700,100 L 780,100';
const KEY = 'synapse.intro.v1';

/**
 * Lights-out intro: five red gantry lights ignite in sequence, a racing line
 * is drawn through the frame while a counter climbs, then the lights die and
 * the screen splits open along a hard diagonal to reveal the app.
 */
export const Intro: React.FC<{ onDone?: () => void }> = ({ onDone }) => {
  const skip = prefersReduced() || sessionStorage.getItem(KEY) === '1';
  const [phase, setPhase] = useState<'run' | 'open' | 'gone'>(skip ? 'gone' : 'run');
  const [n, setN] = useState(0);
  const [lights, setLights] = useState(0);
  const [prog, setProg] = useState(0);

  useEffect(() => {
    if (skip) { onDone?.(); return; }
    const total = 2300; const t0 = performance.now(); let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / total);
      const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
      setN(Math.round(e * 100)); setProg(e); setLights(Math.min(5, Math.floor(p * 6.2)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else { setLights(0); setTimeout(() => setPhase('open'), 260); setTimeout(() => { setPhase('gone'); sessionStorage.setItem(KEY, '1'); onDone?.(); }, 1250); }
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [skip, onDone]);

  if (phase === 'gone') return null;
  return (
    <div className={`intro ${phase === 'open' ? 'intro-open' : ''}`} aria-hidden>
      <div className="intro-half intro-a"><Body n={n} lights={lights} prog={prog} /></div>
      <div className="intro-half intro-b"><Body n={n} lights={lights} prog={prog} /></div>
    </div>
  );
};

const Body: React.FC<{ n: number; lights: number; prog: number }> = ({ n, lights, prog }) => (
  <div className="intro-body">
    <div className="intro-lights">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={i < lights ? 'on' : ''} />)}</div>
    <svg viewBox="0 0 800 200" className="intro-line">
      <path d={LINE} className="intro-ghost" />
      <path d={LINE} className="intro-draw" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1 - prog }} />
    </svg>
    <div className="kerb intro-kerb" />
    <div className="intro-num">{String(n).padStart(3, '0')}</div>
    <div className="intro-tag">F1 SYNAPSE — TELEMETRY ONLINE</div>
  </div>
);
