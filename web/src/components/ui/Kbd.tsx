import React from 'react';
import { cn } from '@/lib/utils';

export type KbdProps = React.HTMLAttributes<HTMLElement>;

export const Kbd: React.FC<KbdProps> = ({ className, children, ...props }) => {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-[var(--r-xs)] border border-[var(--border)] bg-[var(--surface-3)] text-[10px] font-mono font-bold text-[var(--text-2)] shadow-xs select-none',
        className,
      )}
      {...props}
    >
      {children}
    </kbd>
  );
};
