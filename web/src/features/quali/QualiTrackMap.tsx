import React, { useMemo } from 'react';
import { TrackGeometry } from '@/api/types';

export interface DriverMapMarker {
  code: string;
  color: string;
  x: number;
  y: number;
}

export interface QualiTrackMapProps {
  track: TrackGeometry | null;
  drivers: DriverMapMarker[];
  cursorDist?: number;
  className?: string;
}

export const QualiTrackMap: React.FC<QualiTrackMapProps> = ({
  track,
  drivers,
  className = '',
}) => {
  // Compute SVG viewBox from track bounds
  const viewBox = useMemo(() => {
    if (!track || !track.bounds) {
      return '-3000 -3000 6000 6000';
    }
    const { minX, minY, maxX, maxY } = track.bounds;
    const padding = 300;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;
    return `${minX - padding} ${minY - padding} ${width} ${height}`;
  }, [track]);

  // SVG path string from centerline
  const pathD = useMemo(() => {
    if (!track || !track.centerline || track.centerline.length === 0) return '';
    const [first, ...rest] = track.centerline;
    let d = `M ${first[0]} ${first[1]}`;
    for (const pt of rest) {
      d += ` L ${pt[0]} ${pt[1]}`;
    }
    d += ' Z';
    return d;
  }, [track]);

  return (
    <div className={`relative w-full h-full flex items-center justify-center ${className}`}>
      <svg
        viewBox={viewBox}
        className="w-full h-full max-h-[360px] overflow-visible"
        style={{ transform: 'scaleY(-1)' }} // Invert Y to match Cartesian orientation
      >
        {/* Track Outline Background Glow */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth="32"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Track Centerline */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Start / Finish line indicator */}
        {track?.centerline?.[0] && (
          <circle
            cx={track.centerline[0][0]}
            cy={track.centerline[0][1]}
            r="16"
            fill="var(--accent)"
          />
        )}

        {/* Driver Positions */}
        {drivers.map((drv) => (
          <g key={drv.code} transform={`translate(${drv.x}, ${drv.y})`}>
            {/* Halo pulse */}
            <circle r="44" fill={drv.color} opacity="0.25" />
            {/* Outer disc */}
            <circle r="28" fill="var(--surface-0)" stroke={drv.color} strokeWidth="6" />
            {/* Driver Code text (un-flipped) */}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="20"
              fontFamily="var(--font-mono)"
              fontWeight="900"
              fill="var(--text-1)"
              transform="scale(1, -1)"
            >
              {drv.code}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
