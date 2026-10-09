import React from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, elevated = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-1)] relative overflow-hidden',
          'before:absolute before:inset-0 before:pointer-events-none before:bg-[linear-gradient(180deg,rgba(255,255,255,0.03),transparent)]',
          elevated && 'shadow-[0_8px_24px_rgba(0,0,0,0.5)] border-[var(--border-strong)]',
          className,
        )}
        {...props}
      >
        <div className="relative z-1">{children}</div>
      </div>
    );
  },
);

Card.displayName = 'Card';
