import React from 'react';
import { cn } from '@/lib/utils';
import { X, ChevronDown } from 'lucide-react';
import { Button } from './Button';

export interface PanelHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  onClose?: () => void;
  onCollapse?: () => void;
  isCollapsed?: boolean;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({
  title,
  badge,
  actions,
  onClose,
  onCollapse,
  isCollapsed = false,
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-3.5 py-2.5 bg-[var(--surface-2)] border-b border-[var(--border)] select-none min-h-[40px]',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-display font-bold text-xs uppercase tracking-wider text-[var(--text-1)]">
          {title}
        </h3>
        {badge}
      </div>

      <div className="flex items-center gap-1.5">
        {actions}
        {children}

        {onCollapse && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCollapse}
            aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
            className="w-6 h-6 p-0 text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 transition-transform duration-[var(--dur-base)]',
                isCollapsed && '-rotate-90',
              )}
            />
          </Button>
        )}

        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close panel"
            className="w-6 h-6 p-0 text-[var(--text-3)] hover:text-[var(--text-1)]"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
