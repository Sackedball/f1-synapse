import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size = 'md',
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] cursor-pointer';

    const variantStyles = {
      primary:
        'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-1)] border border-[var(--accent)] shadow-sm',
      secondary:
        'bg-[var(--surface-3)] hover:bg-[var(--surface-4)] text-[var(--text-1)] border border-[var(--border)] hover:border-[var(--border-strong)]',
      ghost:
        'bg-transparent hover:bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text-1)] border border-transparent',
      icon:
        'bg-[var(--surface-3)] hover:bg-[var(--surface-4)] text-[var(--text-2)] hover:text-[var(--text-1)] border border-[var(--border)] rounded-full',
      danger:
        'bg-[var(--danger)] hover:opacity-90 text-[var(--text-1)] border border-[var(--danger)]',
    };

    const sizeStyles = {
      sm: variant === 'icon' ? 'w-7 h-7 p-0' : 'text-xs px-2.5 py-1 rounded-[var(--r-sm)] gap-1.5',
      md: variant === 'icon' ? 'w-9 h-9 p-0' : 'text-sm px-3.5 py-1.5 rounded-[var(--r-md)] gap-2',
      lg: variant === 'icon' ? 'w-11 h-11 p-0' : 'text-base px-5 py-2.5 rounded-[var(--r-md)] gap-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
