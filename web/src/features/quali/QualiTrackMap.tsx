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
    const padding = Math.max(maxX - minX, maxY - minY) * 0.08;
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

  // Scale dimensions proportionally to track width
  const scaleDims = useMemo(() => {
    if (!track || !track.bounds) {
      return { outline: 220, center: 70, finish: 120, halo: 320, disc: 200, stroke: 40, text: 160 };
    }
    const { minX, maxX } = track.bounds;
    const width = maxX - minX;
    const base = width * 0.018;
    return {
      outline: Math.max(36, base * 1.8),
      center: Math.max(14, base * 0.75),
      finish: Math.max(20, base * 1.2),
      halo: Math.max(50, base * 3.0),
      disc: Math.max(30, base * 1.8),
      stroke: Math.max(6, base * 0.4),
      text: Math.max(20, base * 1.3),
    };
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
            strokeWidth={scaleDims.outline}
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
            strokeWidth={scaleDims.center}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Start / Finish line indicator */}
        {track?.centerline?.[0] && (
          <circle
            cx={track.centerline[0][0]}
            cy={track.centerline[0][1]}
            r={scaleDims.finish}
            fill="var(--accent)"
          />
        )}

        {/* Driver Positions */}
        {drivers.map((drv) => (
          <g key={drv.code} transform={`translate(${drv.x}, ${drv.y})`}>
            {/* Halo pulse */}
            <circle r={scaleDims.halo} fill={drv.color} opacity="0.35" />
            {/* Outer disc */}
            <circle r={scaleDims.disc} fill="var(--surface-0)" stroke={drv.color} strokeWidth={scaleDims.stroke} />
            {/* Driver Code text (un-flipped) */}
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={scaleDims.text}
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
