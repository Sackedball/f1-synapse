import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'best' | 'insight';
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  dot = false,
  children,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-[var(--surface-3)] text-[var(--text-2)] border-[var(--border)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]',
    success: 'bg-[rgba(0,210,106,0.15)] text-[var(--success)] border-[var(--success)]',
    warning: 'bg-[rgba(255,214,0,0.15)] text-[var(--warning)] border-[var(--warning)]',
    danger: 'bg-[rgba(255,77,79,0.15)] text-[var(--danger)] border-[var(--danger)]',
    best: 'bg-[rgba(177,56,221,0.15)] text-[var(--best)] border-[var(--best)]',
    insight: 'bg-[var(--insight-glow)] text-[var(--insight)] border-[rgba(45,212,191,0.4)]',
  };

  const dotStyles = {
    default: 'bg-[var(--text-3)]',
    accent: 'bg-[var(--accent)]',
    success: 'bg-[var(--success)]',
    warning: 'bg-[var(--warning)]',
    danger: 'bg-[var(--danger)]',
    best: 'bg-[var(--best)]',
    insight: 'bg-[var(--insight)]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--r-sm)] text-[11px] font-mono font-semibold border',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotStyles[variant])} />}
      {children}
    </span>
  );
};
