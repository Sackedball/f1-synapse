import React from 'react';
import { SplitRise } from './Kinetic';
import './trace.css';

const TRACES = [
  'M0,90 C60,20 120,160 200,80 S320,10 400,90 S520,170 600,60 S720,40 800,100',
  'M0,120 C80,120 90,40 180,50 S300,150 380,110 S520,30 610,90 S740,150 800,60',
  'M0,60 C50,100 130,100 190,130 S310,60 390,40 S530,120 620,140 S730,60 800,80',
  'M0,140 L90,140 L110,60 L200,60 L220,150 L330,150 L350,50 L470,50 L490,130 L610,130 L630,70 L800,70',
];

/** Four telemetry channels draw themselves across the screen while a scan line sweeps. */
export const TraceLoader: React.FC<{ title: [string, string]; kicker: string }> = ({ title, kicker }) => (
  <div className="trace-loader h-screen w-screen overflow-hidden relative" role="status" aria-label="Loading">
    <svg className="trace-svg" viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden>
      {TRACES.map((d, i) => (
        <path key={i} d={d} pathLength={1} className={`trace-p trace-p${i}`} style={{ animationDelay: `${i * 260}ms` }} />
      ))}
    </svg>
    <i className="trace-scan" aria-hidden />
    <div className="trace-copy">
      <div className="trace-k">{kicker}</div>
      <h1><SplitRise text={title[0]} step={38} /><br /><SplitRise text={title[1]} delay={240} step={38} /></h1>
    </div>
  </div>
);
