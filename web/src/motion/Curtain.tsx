import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { prefersReduced } from './pointer';

type Go = (to: string | number, label?: string) => void;
const Ctx = createContext<Go>(() => {});
export const useCurtain = () => useContext(Ctx);

const STRIPS = 6;

/**
 * Route transition: six skewed shutters slam up from the floor covering the
 * page (staggered like a pit-lane gate), the route swaps underneath, then
 * the shutters lift away. A destination label rides across the cover.
 */
export const CurtainProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'idle' | 'in' | 'out'>('idle');
  const [label, setLabel] = useState('');
  const busy = useRef(false);

  const go = useCallback<Go>((to, text = '') => {
    if (busy.current) return;
    if (prefersReduced()) { navigate(to as never); return; }
    busy.current = true; setLabel(text); setPhase('in');
    setTimeout(() => { navigate(to as never); setPhase('out'); }, 720);
    setTimeout(() => { setPhase('idle'); busy.current = false; }, 1500);
  }, [navigate]);

  return (
    <Ctx.Provider value={go}>
      {children}
      <div className={`curtain curtain-${phase}`} aria-hidden>
        {Array.from({ length: STRIPS }).map((_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}
        <div className="curtain-label">{label}</div>
      </div>
    </Ctx.Provider>
  );
};
