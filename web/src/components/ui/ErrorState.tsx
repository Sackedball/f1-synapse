import React from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
  ...props
}) => {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center p-6 text-center rounded-[var(--r-md)] border border-[rgba(255,77,79,0.3)] bg-[rgba(255,77,79,0.06)]',
        className,
      )}
      {...props}
    >
      <AlertCircle className="w-8 h-8 text-[var(--danger)] mb-2" />
      <h4 className="font-display font-bold text-sm text-[var(--text-1)] mb-1">
        {title}
      </h4>
      <p className="text-xs text-[var(--text-2)] max-w-sm mb-4 font-mono">
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </Button>
      )}
    </div>
  );
};
