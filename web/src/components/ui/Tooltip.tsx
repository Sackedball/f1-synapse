import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-3)] px-2.5 py-1 text-xs text-[var(--text-1)] shadow-md animate-in fade-in-0 zoom-in-95',
      className,
    )}
    {...props}
  />
));

TooltipContent.displayName = TooltipPrimitive.Content.displayName;
