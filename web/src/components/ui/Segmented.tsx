import React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
}

export interface SegmentedProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex items-center bg-[var(--surface-1)] p-0.5 rounded-[var(--r-md)] border border-[var(--border)] select-none',
        className,
      )}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-[var(--r-sm)] font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
              size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-xs',
              isSelected
                ? 'bg-[var(--surface-3)] text-[var(--text-1)] shadow-xs font-semibold'
                : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)]',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
