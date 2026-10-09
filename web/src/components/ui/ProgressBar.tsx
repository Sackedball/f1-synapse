import React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

export interface ProgressBarProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  value?: number;
  progress?: number;
  height?: number | string;
  variant?: 'accent' | 'default' | 'success' | 'warning' | 'danger';
  animated?: boolean;
  indicatorClassName?: string;
}

const VARIANT_COLORS: Record<string, string> = {
  accent: 'bg-[var(--accent)]',
  default: 'bg-[var(--accent)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger: 'bg-[var(--danger)]',
};

export const ProgressBar = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  ProgressBarProps
>(
  (
    {
      className,
      value,
      progress,
      height,
      variant = 'accent',
      animated,
      indicatorClassName,
      style,
      ...props
    },
    ref,
  ) => {
    // Normalize percentage from either `value` (0-100) or `progress` (0.0-1.0 or 0-100)
    let raw = 0;
    if (value !== undefined) {
      raw = value;
    } else if (progress !== undefined) {
      raw = progress <= 1.0 && progress > 0 ? progress * 100 : progress;
    }
    const pct = Math.min(100, Math.max(0, raw));

    const heightStyle = height !== undefined
      ? { height: typeof height === 'number' ? `${height}px` : height }
      : {};

    return (
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-4)]',
          className,
        )}
        style={{ ...heightStyle, ...style }}
        value={pct}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            'h-full w-full flex-1 transition-all duration-300 ease-out',
            VARIANT_COLORS[variant] || VARIANT_COLORS.accent,
            animated && 'animate-pulse',
            indicatorClassName,
          )}
          style={{ transform: `translateX(-${100 - pct}%)` }}
        />
      </ProgressPrimitive.Root>
    );
  },
);

ProgressBar.displayName = ProgressPrimitive.Root.displayName;
