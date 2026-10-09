import React from 'react';
import { cn } from '@/lib/utils';

export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  clickable?: boolean;
  variant?: 'default' | 'accent' | 'insight';
}

export const Chip: React.FC<ChipProps> = ({
  className,
  active = false,
  clickable = false,
  variant = 'default',
  children,
  ...props
}) => {
  const variantStyles = {
    default: active
      ? 'bg-[var(--surface-4)] text-[var(--text-1)] border-[var(--border-strong)]'
      : 'bg-[var(--surface-2)] text-[var(--text-2)] border-[var(--border)] hover:bg-[var(--surface-3)]',
    accent: active
      ? 'bg-[var(--accent)] text-[var(--text-1)] border-[var(--accent)]'
      : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[rgba(225,6,0,0.3)]',
    insight: active
      ? 'bg-[var(--insight)] text-[var(--surface-0)] border-[var(--insight)] font-bold'
      : 'bg-[var(--insight-glow)] text-[var(--insight)] border-[rgba(45,212,191,0.3)]',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--r-pill)] text-xs font-medium border select-none transition-colors',
        clickable && 'cursor-pointer active:scale-95',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};
