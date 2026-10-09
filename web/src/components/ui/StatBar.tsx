import React from 'react';
import { cn } from '@/lib/utils';

export interface StatBarProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: number; // 0 to 100
  max?: number;
  unit?: string;
  variant?: 'throttle' | 'brake' | 'default' | 'insight';
}

export const StatBar: React.FC<StatBarProps> = ({
  label,
  value,
  max = 100,
  unit = '%',
  variant = 'default',
  className,
  ...props
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const variantStyles = {
    throttle: 'bg-[var(--success)]',
    brake: 'bg-[var(--danger)]',
    default: 'bg-[var(--accent)]',
    insight: 'bg-[var(--insight)]',
  };

  return (
    <div className={cn('flex flex-col gap-1 w-full select-none', className)} {...props}>
      <div className="flex justify-between items-center text-[10px] font-mono">
        <span className="text-[var(--text-3)] uppercase font-semibold">{label}</span>
        <span className="text-[var(--text-1)] font-bold tabular-nums">
          {Math.round(value)}
          {unit}
        </span>
      </div>

      <div className="h-1.5 w-full bg-[var(--surface-4)] rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-75', variantStyles[variant])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
