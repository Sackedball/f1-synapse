import React, { useEffect, useRef } from 'react';
import { subscribePointer, lerp, pointer } from './pointer';
import './motion.css';

/**
 * Two-body cursor: a precise dot (instant) + a lagging ring (spring).
 * Elements opt in with data-cursor="link|view|drag|hide" and data-cursor-label="TEXT".
 * Ring stretches along its velocity vector like a motion-blurred wheel.
 */
export const Cursor: React.FC = () => {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    document.documentElement.classList.add('has-cursor');
    let rx = -100, ry = -100, raf = 0, mode = 'idle', down = false;

    const off = subscribePointer((x, y) => {
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const t = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-cursor], a, button, [role="button"], input');
      const next = t?.dataset.cursor ?? (t ? 'link' : 'idle');
      if (next !== mode) {
        mode = next;
        ring.current?.setAttribute('data-mode', mode);
        if (label.current) label.current.textContent = t?.dataset.cursorLabel ?? '';
      }
    });

    const loop = () => {
      rx = lerp(rx, pointer.x, 0.18);
      ry = lerp(ry, pointer.y, 0.18);
      const sp = Math.min(Math.hypot(pointer.vx, pointer.vy), 60);
      const ang = Math.atan2(pointer.vy, pointer.vx) * (180 / Math.PI);
      const stretch = 1 + sp / 90;
      if (ring.current)
        ring.current.style.transform =
          `translate3d(${rx}px, ${ry}px, 0) rotate(${ang}deg) scale(${(down ? 0.8 : 1) * stretch}, ${1 / Math.sqrt(stretch)})`;
      if (label.current) label.current.style.transform = `rotate(${-ang}deg) scale(${1 / stretch}, ${Math.sqrt(stretch)})`;
      pointer.vx *= 0.8; pointer.vy *= 0.8;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const dn = () => (down = true), up = () => (down = false);
    window.addEventListener('pointerdown', dn); window.addEventListener('pointerup', up);
    return () => {
      off(); cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', dn); window.removeEventListener('pointerup', up);
      document.documentElement.classList.remove('has-cursor');
    };
  }, []);

  return (
    <>
      <div ref={ring} className="cur-ring" data-mode="idle" aria-hidden><span ref={label} className="cur-label" /></div>
      <div ref={dot} className="cur-dot" aria-hidden />
    </>
  );
};
