/** Single shared pointer tracker — one window listener for the whole app. */
export const pointer = { x: -100, y: -100, vx: 0, vy: 0, active: false };

type Sub = (x: number, y: number) => void;
const subs = new Set<Sub>();
let bound = false;

export function subscribePointer(fn: Sub): () => void {
  if (!bound && typeof window !== 'undefined') {
    bound = true;
    window.addEventListener(
      'pointermove',
      (e) => {
        pointer.vx = e.clientX - pointer.x;
        pointer.vy = e.clientY - pointer.y;
        pointer.x = e.clientX;
        pointer.y = e.clientY;
        pointer.active = true;
        subs.forEach((s) => s(e.clientX, e.clientY));
      },
      { passive: true },
    );
  }
  subs.add(fn);
  return () => subs.delete(fn);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
