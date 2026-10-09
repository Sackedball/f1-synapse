import React from 'react';
import { cn } from '@/lib/utils';

export interface SparklineProps extends React.SVGAttributes<SVGSVGElement> {
  data: number[];
  width?: number;
  height?: number;
  color?: string; // CSS color string (defaults to accent or insight)
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 32,
  color = 'var(--insight)',
  className,
  ...props
}) => {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} className={cn('overflow-visible', className)} {...props} />
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * (width - 4) + 2;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      {...props}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
