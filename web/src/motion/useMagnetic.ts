import { useEffect, useRef } from 'react';
import { subscribePointer, lerp, prefersReduced } from './pointer';

/**
 * Magnetic pull: element drifts toward the pointer inside `radius`,
 * and springs back with inertia when released. Inner content can
 * counter-drift via [data-magnetic-inner] for a layered parallax feel.
 */
export function useMagnetic<T extends HTMLElement>(strength = 0.35, radius = 90) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced() || window.matchMedia('(pointer: coarse)').matches) return;
    const inner = el.querySelector<HTMLElement>('[data-magnetic-inner]');
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, running = false;

    const tick = () => {
      cx = lerp(cx, tx, 0.16);
      cy = lerp(cy, ty, 0.16);
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      if (inner) inner.style.transform = `translate3d(${(cx * 0.4).toFixed(2)}px, ${(cy * 0.4).toFixed(2)}px, 0)`;
      if (Math.abs(cx - tx) > 0.05 || Math.abs(cy - ty) > 0.05) raf = requestAnimationFrame(tick);
      else running = false;
    };
    const kick = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };

    const off = subscribePointer((x, y) => {
      const r = el.getBoundingClientRect();
      const mx = r.left + r.width / 2, my = r.top + r.height / 2;
      const dx = x - mx, dy = y - my;
      const d = Math.hypot(dx, dy);
      const reach = radius + Math.max(r.width, r.height) / 2;
      if (d < reach) { tx = dx * strength; ty = dy * strength; el.dataset.magnetic = 'on'; }
      else if (tx !== 0 || ty !== 0) { tx = 0; ty = 0; delete el.dataset.magnetic; }
      else return;
      kick();
    });
    return () => { off(); cancelAnimationFrame(raf); };
  }, [strength, radius]);

  return ref;
}
