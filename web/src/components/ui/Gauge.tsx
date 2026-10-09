import React from 'react';
import { cn } from '@/lib/utils';

export interface GaugeProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  unit?: string;
  variant?: 'accent' | 'success' | 'warning' | 'insight';
}

export const Gauge: React.FC<GaugeProps> = ({
  value,
  min = 0,
  max = 350,
  label = 'SPEED',
  unit = 'km/h',
  variant = 'accent',
  className,
  ...props
}) => {
  const percentage = Math.min(1, Math.max(0, (value - min) / (max - min)));

  // SVG arc math (semi-circle from -180 deg to 0 deg)
  const radius = 42;
  const strokeWidth = 8;
  const circumference = Math.PI * radius; // Half-circle
  const strokeDashoffset = circumference * (1 - percentage);

  const colorStyles = {
    accent: 'stroke-[var(--accent)] text-[var(--accent)]',
    success: 'stroke-[var(--success)] text-[var(--success)]',
    warning: 'stroke-[var(--warning)] text-[var(--warning)]',
    insight: 'stroke-[var(--insight)] text-[var(--insight)]',
  };

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-2 rounded-[var(--r-md)] bg-[var(--surface-2)] border border-[var(--border)] select-none',
        className,
      )}
      {...props}
    >
      <div className="relative w-28 h-16 flex items-center justify-center">
        <svg viewBox="0 0 100 60" className="w-full h-full overflow-visible">
          {/* Background track */}
          <path
            d="M 8 52 A 42 42 0 0 1 92 52"
            fill="none"
            stroke="var(--surface-4)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Active arc fill */}
          <path
            d="M 8 52 A 42 42 0 0 1 92 52"
            fill="none"
            className={cn('transition-all duration-[var(--dur-base)]', colorStyles[variant].split(' ')[0])}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>

        {/* Center reading */}
        <div className="absolute bottom-1 flex flex-col items-center">
          <span className="font-mono text-xl font-bold leading-none tabular-nums text-[var(--text-1)]">
            {Math.round(value)}
          </span>
          <span className="text-[9px] font-mono text-[var(--text-3)] uppercase tracking-wider">
            {unit}
          </span>
        </div>
      </div>

      <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-[var(--text-3)] mt-1">
        {label}
      </span>
    </div>
  );
};
