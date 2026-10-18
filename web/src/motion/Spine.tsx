import React, { useEffect, useRef } from 'react';
import { lerp, prefersReduced } from './pointer';

/** Scroll progress drawn as a racing line down the right edge, with a car riding it. */
const SPINE = 'M14,0 C14,80 2,110 2,200 S26,300 26,400 S4,520 4,620 S24,760 24,860 S14,950 14,1000';

export const Spine: React.FC<{ scroller: React.RefObject<HTMLDivElement | null> }> = ({ scroller }) => {
  const run = useRef<SVGPathElement>(null);
  const rail = useRef<SVGPathElement>(null);
  const car = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const on = () => {
      const p = el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);
      if (run.current) run.current.style.strokeDashoffset = String(1 - p);
      const r = rail.current;
      if (!r || !car.current) return;
      const pt = r.getPointAtLength(p * r.getTotalLength());
      car.current.style.left = `${(pt.x / 28) * 100}%`;
      car.current.style.top = `${pt.y / 10}%`;
    };
    on();
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [scroller]);

  return (
    <div className="spine" aria-hidden>
      <svg viewBox="0 0 28 1000" preserveAspectRatio="none">
        <path ref={rail} d={SPINE} className="rail" vectorEffect="non-scaling-stroke" />
        <path
          ref={run}
          d={SPINE}
          className="run"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div ref={car} className="spine-car" />
    </div>
  );
};

/** Scroll-driven parallax + velocity skew on every [data-parallax] element. */
export function useScrollMotion(scroller: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = scroller.current;
    if (!el || prefersReduced()) return;
    const items = [...el.querySelectorAll<HTMLElement>('[data-parallax]')];
    let last = el.scrollTop,
      vel = 0,
      raf = 0;
    const loop = () => {
      const y = el.scrollTop;
      vel = lerp(vel, y - last, 0.15);
      last = y;
      const skew = Math.max(-12, Math.min(12, vel * -0.35));
      items.forEach((it) => {
        const k = parseFloat(it.dataset.parallax ?? '0');
        const r = it.getBoundingClientRect();
        const isBand = it.classList.contains('hero-band') || it.classList.contains('outro-band');
        const x = isBand ? r.top * k * 1.2 : 0;
        const ty = isBand ? 0 : y * -k * 0.5;
        it.style.transform = `translate3d(${x.toFixed(1)}px, ${ty.toFixed(1)}px, 0) skewX(${skew.toFixed(2)}deg)`;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scroller]);
}
