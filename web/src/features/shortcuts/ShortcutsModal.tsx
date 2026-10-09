import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Kbd,
} from '@/components';
import { Keyboard } from 'lucide-react';

export interface ShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ open, onOpenChange }) => {
  const sections = [
    {
      title: 'PLAYBACK & TRANSPORT',
      items: [
        { keys: [<Kbd key="space">SPACE</Kbd>], desc: 'Play / Pause replay' },
        {
          keys: [<Kbd key="l">←</Kbd>, <span key="slash">/</span>, <Kbd key="r">→</Kbd>],
          desc: 'Jump ±10 seconds',
        },
        {
          keys: [
            <Kbd key="shift">SHIFT</Kbd>,
            <span key="plus">+</span>,
            <Kbd key="l">←</Kbd>,
            <span key="slash">/</span>,
            <Kbd key="r">→</Kbd>,
          ],
          desc: 'Jump ±1 lap',
        },
        {
          keys: [<Kbd key="u">↑</Kbd>, <span key="slash">/</span>, <Kbd key="d">↓</Kbd>],
          desc: 'Double / Halve playback speed',
        },
        {
          keys: [
            <Kbd key="1">1</Kbd>,
            <span key="dash">–</span>,
            <Kbd key="4">4</Kbd>,
          ],
          desc: 'Speed presets (1×, 2×, 4×, 8×)',
        },
        { keys: [<Kbd key="r">R</Kbd>], desc: 'Restart replay to T+0' },
      ],
    },
    {
      title: 'NAVIGATION & KEY MOMENTS',
      items: [
        {
          keys: [<Kbd key="j">J</Kbd>, <span key="slash">/</span>, <Kbd key="k">K</Kbd>],
          desc: 'Next / Previous key moment',
        },
        {
          keys: [<Kbd key="cmd">Ctrl / ⌘</Kbd>, <span key="plus">+</span>, <Kbd key="k">K</Kbd>],
          desc: 'Open Command Palette',
        },
      ],
    },
    {
      title: 'VIEW & CANVAS CONTROLS',
      items: [
        { keys: [<Kbd key="d">D</Kbd>], desc: 'Toggle DRS detection zones' },
        { keys: [<Kbd key="l">L</Kbd>], desc: 'Toggle driver labels on track' },
        {
          keys: [<Kbd key="shift">SHIFT</Kbd>, <span key="plus">+</span>, <Kbd key="l">L</Kbd>],
          desc: 'Toggle label mode (code / car number)',
        },
        { keys: [<Kbd key="f">F</Kbd>], desc: 'Toggle driver focus mode' },
        { keys: [<Kbd key="b">B</Kbd>], desc: 'Toggle timeline bar' },
        { keys: [<Kbd key="fps">`</Kbd>], desc: 'Toggle FPS overlay' },
      ],
    },
    {
      title: 'GENERAL',
      items: [
        {
          keys: [<Kbd key="h">H</Kbd>, <span key="slash">/</span>, <Kbd key="q">?</Kbd>],
          desc: 'Show this keyboard shortcuts guide',
        },
        { keys: [<Kbd key="esc">ESC</Kbd>], desc: 'Clear selection / Close active modal' },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[var(--surface-1)] border-[var(--border-hi)] text-[var(--text-1)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-display tracking-wider">
            <Keyboard className="w-4 h-4 text-[var(--accent)]" />
            <span>KEYBOARD SHORTCUTS REFERENCE</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2 max-h-[70vh] overflow-y-auto pr-1">
          {sections.map((sec, sIdx) => (
            <div key={sIdx} className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-3)]">
                {sec.title}
              </span>
              <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-[var(--r-md)] divide-y divide-[var(--border)]">
                {sec.items.map((item, iIdx) => (
                  <div
                    key={iIdx}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-1 shrink-0">{item.keys}</div>
                    <span className="text-[var(--text-2)] font-sans text-right">
                      {item.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
