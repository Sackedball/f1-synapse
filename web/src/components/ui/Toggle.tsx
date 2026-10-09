import React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export interface ToggleProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  label?: string;
}

export const Toggle = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  ToggleProps
>(({ className, label, id, ...props }, ref) => {
  const switchId = id || (label ? `toggle-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="inline-flex items-center gap-2">
      <SwitchPrimitives.Root
        ref={ref}
        id={switchId}
        aria-label={props['aria-label'] || label || 'Toggle switch'}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-0)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'bg-[var(--surface-4)] data-[state=checked]:bg-[var(--accent)]',
          className,
        )}
        {...props}
      >
        <SwitchPrimitives.Thumb
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-[var(--text-1)] shadow-lg ring-0 transition-transform',
            'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
          )}
        />
      </SwitchPrimitives.Root>
      {label && (
        <label
          htmlFor={switchId}
          className="text-xs font-medium text-[var(--text-2)] cursor-pointer select-none"
        >
          {label}
        </label>
      )}
    </div>
  );
});

Toggle.displayName = 'Toggle';
