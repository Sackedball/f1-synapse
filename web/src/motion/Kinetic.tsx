import React, { useEffect, useRef, useState } from 'react';
import { lerp, prefersReduced, subscribePointer } from './pointer';

export function useInView<T extends Element>(threshold = 0.15, once = true) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); if (once) io.disconnect(); } else if (!once) setSeen(false);
    }, { threshold });
    io.observe(el); return () => io.disconnect();
  }, [threshold, once]);
  return [ref, seen] as const;
}

/** Masked per-character rise. Each glyph slides up from behind a clip with a stagger. */
export const SplitRise: React.FC<{ text: string; delay?: number; step?: number; className?: string; play?: boolean }> = ({
  text, delay = 0, step = 28, className = '', play = true,
}) => (
  <span className={`split ${play ? 'split-in' : ''} ${className}`} aria-label={text}>
    {[...text].map((c, i) => (
      <span key={i} className="split-mask" aria-hidden>
        <span className="split-char" style={{ transitionDelay: `${delay + i * step}ms` }}>{c === ' ' ? '\u00A0' : c}</span>
      </span>
    ))}
  </span>
);

/**
 * Glyphs react to the pointer: nearby letters lift, skew and swell,
 * trailing off with distance — like a wave passing through the word.
 */
export const ProximityText: React.FC<{ text: string; className?: string; radius?: number }> = ({ text, className = '', radius = 180 }) => {
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = root.current; if (!el || prefersReduced()) return;
    const chars = [...el.querySelectorAll<HTMLElement>('[data-c]')];
    const cur = chars.map(() => 0), tgt = chars.map(() => 0);
    let raf = 0, run = false;
    const loop = () => {
      let live = false;
      chars.forEach((c, i) => {
        cur[i] = lerp(cur[i], tgt[i], 0.14);
        if (Math.abs(cur[i] - tgt[i]) > 0.002) live = true;
        const k = cur[i];
        c.style.transform = `translateY(${(-k * 14).toFixed(2)}px) skewX(${(-k * 14).toFixed(2)}deg) scale(${(1 + k * 0.18).toFixed(3)})`;
        c.style.color = k > 0.5 ? 'var(--accent)' : '';
      });
      if (live) raf = requestAnimationFrame(loop); else run = false;
    };
    const off = subscribePointer((x, y) => {
      chars.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
        tgt[i] = Math.max(0, 1 - d / radius) ** 2;
      });
      if (!run) { run = true; raf = requestAnimationFrame(loop); }
    });
    return () => { off(); cancelAnimationFrame(raf); };
  }, [radius]);
  return (
    <span ref={root} className={className} aria-label={text}>
      {[...text].map((c, i) => <span key={i} data-c aria-hidden className="inline-block will-change-transform">{c === ' ' ? '\u00A0' : c}</span>)}
    </span>
  );
};

/** Count-up odometer for numerals. */
export const Count: React.FC<{ to: number; ms?: number; pad?: number }> = ({ to, ms = 900, pad = 2 }) => {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (prefersReduced()) { setV(to); return; }
    const t0 = performance.now(); let raf = 0;
    const f = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(Math.round(to * (1 - (1 - p) ** 4))); if (p < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <>{String(v).padStart(pad, '0')}</>;
};

const GLYPHS = '0123456789:.';
/** Digits tumble like a split-flap board, locking left-to-right onto the final value. */
export const Scramble: React.FC<{ text: string; play?: boolean; ms?: number; className?: string }> = ({ text, play = true, ms = 1100, className }) => {
  const [out, setOut] = useState(prefersReduced() ? text : text.replace(/\d/g, '0'));
  useEffect(() => {
    if (!play || prefersReduced()) { setOut(text); return; }
    const t0 = performance.now(); let raf = 0;
    const f = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const lock = Math.floor(p * text.length);
      setOut([...text].map((c, i) => (i < lock || !/[\d]/.test(c) ? c : GLYPHS[Math.floor(Math.random() * 10)])).join(''));
      if (p < 1) raf = requestAnimationFrame(f); else setOut(text);
    };
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
  }, [text, play, ms]);
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{out}</span>;
};
