import React from 'react';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-[var(--r-md)] border border-dashed border-[var(--border)] bg-[var(--surface-1)]',
        className,
      )}
      {...props}
    >
      <div className="text-[var(--text-3)] mb-3">
        {icon || <Inbox className="w-8 h-8 opacity-60" />}
      </div>
      <h4 className="font-display font-bold text-sm text-[var(--text-1)] mb-1">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-[var(--text-3)] max-w-xs mb-4">
          {description}
        </p>
      )}
      {action}
    </div>
  );
};
