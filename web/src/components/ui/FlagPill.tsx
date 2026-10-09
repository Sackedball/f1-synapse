import React from 'react';
import { cn } from '@/lib/utils';
import { Flag, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';

export type FlagStatus =
  | 'green'
  | 'yellow'
  | 'red'
  | 'sc'
  | 'vsc'
  | 'GREEN'
  | 'YELLOW'
  | 'RED'
  | 'SC'
  | 'VSC'
  | number;

export interface FlagPillProps extends React.HTMLAttributes<HTMLDivElement> {
  status: FlagStatus;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

function normalizeStatus(s: FlagStatus): 'green' | 'yellow' | 'red' | 'sc' | 'vsc' {
  if (typeof s === 'number') {
    switch (s) {
      case 0:
        return 'green';
      case 1:
        return 'yellow';
      case 2:
        return 'sc';
      case 3:
        return 'red';
      case 4:
      case 5:
      case 6:
      case 7:
        return 'vsc';
      default:
        return 'green';
    }
  }
  const lower = String(s).toLowerCase();
  if (lower === 'yellow' || lower === 'red' || lower === 'sc' || lower === 'vsc') {
    return lower as 'yellow' | 'red' | 'sc' | 'vsc';
  }
  return 'green';
}

export const FlagPill: React.FC<FlagPillProps> = ({
  status,
  label,
  showIcon = true,
  className,
  ...props
}) => {
  const norm = normalizeStatus(status);

  const config = {
    green: {
      defaultLabel: 'TRACK CLEAR',
      bg: 'bg-[rgba(46,204,113,0.15)]',
      border: 'border-[rgba(46,204,113,0.35)]',
      text: 'text-[var(--flag-green)]',
      dot: 'bg-[var(--flag-green)]',
      icon: Flag,
    },
    yellow: {
      defaultLabel: 'YELLOW FLAG',
      bg: 'bg-[rgba(255,215,0,0.15)]',
      border: 'border-[rgba(255,215,0,0.35)]',
      text: 'text-[var(--flag-yellow)]',
      dot: 'bg-[var(--flag-yellow)]',
      icon: AlertTriangle,
    },
    sc: {
      defaultLabel: 'SAFETY CAR',
      bg: 'bg-[rgba(255,140,0,0.18)]',
      border: 'border-[rgba(255,140,0,0.4)]',
      text: 'text-[var(--flag-sc)]',
      dot: 'bg-[var(--flag-sc)]',
      icon: ShieldAlert,
    },
    vsc: {
      defaultLabel: 'VIRTUAL SC',
      bg: 'bg-[rgba(200,130,58,0.18)]',
      border: 'border-[rgba(200,130,58,0.4)]',
      text: 'text-[var(--flag-vsc)]',
      dot: 'bg-[var(--flag-vsc)]',
      icon: ShieldAlert,
    },
    red: {
      defaultLabel: 'RED FLAG',
      bg: 'bg-[rgba(231,76,60,0.2)]',
      border: 'border-[rgba(231,76,60,0.4)]',
      text: 'text-[var(--flag-red)]',
      dot: 'bg-[var(--flag-red)]',
      icon: AlertTriangle,
    },
  };

  const item = config[norm];
  const IconComponent = item.icon;
  const displayLabel = label ?? item.defaultLabel;
  const colorblind = useSettingsStore((s) => s.colorblindMode);

  const getPatternStyle = () => {
    if (!colorblind) return undefined;
    switch (norm) {
      case 'yellow':
        return {
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,215,0,0.18) 4px, rgba(255,215,0,0.18) 8px)',
        };
      case 'red':
        return {
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(231,76,60,0.18) 4px, rgba(231,76,60,0.18) 8px), repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(231,76,60,0.18) 4px, rgba(231,76,60,0.18) 8px)',
        };
      case 'green':
        return {
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(46,204,113,0.15) 4px, rgba(46,204,113,0.15) 8px)',
        };
      case 'sc':
      case 'vsc':
        return {
          backgroundImage:
            'repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,140,0,0.18) 3px, rgba(255,140,0,0.18) 6px)',
        };
      default:
        return undefined;
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={getPatternStyle()}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1 rounded-[var(--r-pill)] border text-xs font-mono font-bold tracking-wider uppercase select-none transition-colors shadow-sm',
        item.bg,
        item.border,
        item.text,
        className,
      )}
      {...props}
    >
      <span className={cn('w-2 h-2 rounded-full animate-pulse', item.dot)} />
      {showIcon && <IconComponent className="w-3.5 h-3.5" />}
      <span>{displayLabel}</span>
    </div>
  );
};
