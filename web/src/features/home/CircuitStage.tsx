import React, { useEffect, useMemo, useRef } from 'react';
import type { CircuitData } from './circuits';
import { prefersReduced } from '@/motion/pointer';

const GRID = [
  '#3671c6', '#3671c6', '#e8002d', '#e8002d', '#ff8000', '#ff8000', '#27f4d2', '#27f4d2', '#229971', '#229971',
  '#0093cc', '#0093cc', '#6692ff', '#6692ff', '#52e252', '#52e252', '#b6babd', '#b6babd', '#64c4ff', '#64c4ff',
];

/**
 * Broadcast track-map graphic: asphalt, sector-coloured edge, start/finish line and
 * a full 20-car field circulating. Swapping circuit redraws the outline and re-forms the grid.
 */
export const CircuitStage: React.FC<{ circuit: CircuitData; round: number; date: string; label: string }> = ({ circuit, round, date, label }) => {
  const path = useRef<SVGPathElement>(null);
  const cars = useRef<(SVGGElement | null)[]>([]);
  const line = useRef<SVGGElement>(null);

  useEffect(() => {
    const p = path.current; if (!p) return;
    const len = p.getTotalLength();
    const a = p.getPointAtLength(0), b = p.getPointAtLength(Math.min(2, len));
    line.current?.setAttribute('transform', `translate(${a.x} ${a.y}) rotate(${(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI})`);
    const still = prefersReduced();
    let raf = 0; const t0 = performance.now();
    const loop = (t: number) => {
      const el = (t - t0) / 1000;
      cars.current.forEach((g, i) => {
        if (!g) return;
        // grid forms behind the line, then the field spreads out by pace
        const spread = Math.min(1, el / 3.2);
        const pace = 1 + ((i * 7) % 5) * 0.0045;
        const f = (((el * 0.052 * pace) - (i * 0.0135) * (0.25 + 0.75 * spread)) % 1 + 1) % 1;
        const pt = p.getPointAtLength(f * len);
        g.setAttribute('transform', `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)})`);
      });
      if (!still) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [circuit.id]);

  const ticks = useMemo(() => Array.from({ length: 28 }), []);
  return (
    <aside className="stage" aria-label={`${circuit.circuitName} track map`}>
      <div className="stage-grid" aria-hidden>{ticks.map((_, i) => <i key={i} />)}</div>
      <svg key={circuit.id} viewBox={circuit.viewBox} className="stage-svg" aria-hidden>
        <path d={circuit.svgPath} className="st-glow" />
        <path d={circuit.svgPath} className="st-asphalt" />
        <path ref={path} d={circuit.svgPath} className="st-center" />
        {[0, 1, 2].map((s) => (
          <path key={s} d={circuit.svgPath} pathLength={1} className={`st-sector s${s + 1}`} strokeDasharray="0.3333 1" strokeDashoffset={-s / 3} />
        ))}
        <g ref={line} className="st-line">
          <rect x="-0.8" y="-3" width="1.6" height="6" />
        </g>
        {GRID.map((c, i) => (
          <g key={i} ref={(el) => { cars.current[i] = el; }}>
            <circle r="1.9" fill={c} className="car" />
          </g>
        ))}
      </svg>
      <div className="stage-card">
        <div className="stage-top"><span className="tab">R{String(round).padStart(2, '0')}</span><span className="stage-date">{date}</span></div>
        <div className="stage-name">{label}</div>
        <div className="stage-circuit">{circuit.circuitName}</div>
        <dl className="stage-stats">
          <div><dt>LENGTH</dt><dd>{circuit.lengthKm.replace(' KM', '')}<small>KM</small></dd></div>
          <div><dt>TURNS</dt><dd>{circuit.turns}</dd></div>
          <div><dt>LAPS</dt><dd>{circuit.laps}</dd></div>
        </dl>
      </div>
    </aside>
  );
};
