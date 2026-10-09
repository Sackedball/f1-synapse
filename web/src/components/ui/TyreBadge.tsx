import React from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';

export type TyreCompound = 'S' | 'M' | 'H' | 'I' | 'W' | 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET';

export interface TyreBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  compound: TyreCompound | number;
  tyreLife?: number;
  size?: 'sm' | 'md' | 'lg';
}

function normalizeCompound(c: TyreCompound | number): 'S' | 'M' | 'H' | 'I' | 'W' {
  if (typeof c === 'number') {
    switch (c) {
      case 0:
        return 'S';
      case 1:
        return 'M';
      case 2:
        return 'H';
      case 3:
        return 'I';
      case 4:
        return 'W';
      default:
        return 'M';
    }
  }
  const upper = c.toUpperCase();
  if (upper.startsWith('S')) return 'S';
  if (upper.startsWith('M')) return 'M';
  if (upper.startsWith('H')) return 'H';
  if (upper.startsWith('I')) return 'I';
  if (upper.startsWith('W')) return 'W';
  return 'M';
}

export const TyreBadge: React.FC<TyreBadgeProps> = ({
  compound,
  tyreLife,
  size = 'md',
  className,
  ...props
}) => {
  const norm = normalizeCompound(compound);

  const styleMap = {
    S: {
      bg: 'bg-[var(--tyre-soft)]',
      text: 'text-white',
      border: 'border-[var(--tyre-soft)]',
    },
    M: {
      bg: 'bg-[var(--tyre-medium)]',
      text: 'text-neutral-900',
      border: 'border-[var(--tyre-medium)]',
    },
    H: {
      bg: 'bg-[var(--tyre-hard)]',
      text: 'text-neutral-900',
      border: 'border-[var(--tyre-hard)]',
    },
    I: {
      bg: 'bg-[var(--tyre-inter)]',
      text: 'text-white',
      border: 'border-[var(--tyre-inter)]',
    },
    W: {
      bg: 'bg-[var(--tyre-wet)]',
      text: 'text-white',
      border: 'border-[var(--tyre-wet)]',
    },
  };

  const sizeStyles = {
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-6 h-6 text-xs',
    lg: 'w-8 h-8 text-sm',
  };

  const cStyle = styleMap[norm];
  const colorblind = useSettingsStore((s) => s.colorblindMode);

  // Distinct shapes for colorblind mode
  const getShapeClass = () => {
    if (!colorblind) return 'rounded-full';
    switch (norm) {
      case 'S':
        return 'rounded-full'; // circle
      case 'M':
        return 'rounded-[2px]'; // square
      case 'H':
        return 'rounded-[1px] rotate-45'; // diamond
      case 'I':
        return 'rounded-t-full rounded-b-[2px]'; // arch
      case 'W':
        return 'rounded-b-full rounded-t-[2px]'; // drop
      default:
        return 'rounded-full';
    }
  };

  return (
    <div
      role="img"
      aria-label={`Compound ${norm}${tyreLife !== undefined ? ` (${tyreLife} laps)` : ''}`}
      className={cn('relative inline-flex items-center', className)}
      {...props}
    >
      <div
        className={cn(
          'flex items-center justify-center font-bold font-sans shadow-inner select-none transition-all',
          getShapeClass(),
          cStyle.bg,
          cStyle.text,
          sizeStyles[size],
        )}
        title={`Compound: ${norm}${tyreLife !== undefined ? ` (${tyreLife} laps)` : ''}`}
      >
        <span className={cn(colorblind && norm === 'H' ? '-rotate-45' : '')}>
          {norm}
        </span>
      </div>

      {tyreLife !== undefined && (
        <span className="absolute -bottom-1 -right-2 text-[9px] font-mono font-bold bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)] px-1 rounded-[var(--r-pill)] leading-tight shadow-sm">
          {tyreLife}
        </span>
      )}
    </div>
  );
};
