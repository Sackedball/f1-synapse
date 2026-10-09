import React from 'react';
import { cn } from '@/lib/utils';

export interface DriverChipProps extends React.HTMLAttributes<HTMLDivElement> {
  code: string;
  number?: number;
  teamColor?: string;
  position?: number;
  active?: boolean;
}

export const DriverChip: React.FC<DriverChipProps> = ({
  code,
  number,
  teamColor,
  position,
  active = false,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--r-sm)] border text-xs font-medium select-none cursor-pointer transition-colors',
        active
          ? 'bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--text-1)]'
          : 'bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)]',
        className,
      )}
      {...props}
    >
      {/* Team Color Pill */}
      {teamColor && (
        <span
          className="w-1.5 h-3.5 rounded-xs shrink-0"
          style={{ backgroundColor: teamColor }}
        />
      )}

      {position !== undefined && (
        <span className="font-mono text-[10px] text-[var(--text-3)] font-bold">
          P{position}
        </span>
      )}

      <span className="font-display font-bold tracking-wide">{code}</span>

      {number !== undefined && (
        <span className="font-mono text-[10px] text-[var(--text-3)]">
          #{number}
        </span>
      )}
    </div>
  );
};
