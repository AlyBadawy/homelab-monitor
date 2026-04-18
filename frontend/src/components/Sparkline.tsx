import { useMemo } from 'react';
import clsx from 'clsx';
import type { HistoryPoint } from '../lib/api';

export interface SparklineProps {
  points: HistoryPoint[];
  width?: number;
  height?: number;
  /** Stroke color. Accepts any valid CSS color / Tailwind arbitrary value. */
  stroke?: string;
  /** Optional area fill under the line. Use a translucent color. */
  fill?: string;
  /** Stroke width in px. */
  strokeWidth?: number;
  /** Force a y-domain. Defaults to [min, max] of data. */
  domain?: [number, number];
  /** Pin the y-domain lower bound to 0 (common for %/rate). */
  baselineZero?: boolean;
  className?: string;
  /** Aria label for screen readers. */
  ariaLabel?: string;
}

/**
 * Hand-rolled SVG sparkline — no external chart deps.
 * Designed to be drop-in inside a tight card row (default 18px tall).
 * Points must be sorted by ts ascending.
 */
export function Sparkline({
  points,
  width = 160,
  height = 18,
  stroke = 'currentColor',
  fill,
  strokeWidth = 1.25,
  domain,
  baselineZero = false,
  className,
  ariaLabel,
}: SparklineProps) {
  const { d, area } = useMemo(
    () => computePath(points, width, height, domain, baselineZero),
    [points, width, height, domain, baselineZero],
  );

  if (points.length < 2) {
    // When the caller supplies width/height classes (e.g. `w-full h-[22px]`),
    // those win; otherwise fall back to the pixel defaults via inline style.
    const hasSizingClass = !!className && /\b(w-|h-)/.test(className);
    return (
      <div
        className={clsx(
          'flex items-center justify-end font-mono text-[0.55rem] uppercase tracking-[0.16em] text-text-dim/60',
          className,
        )}
        style={hasSizingClass ? undefined : { width, height }}
        aria-label={ariaLabel ?? 'no history yet'}
      >
        collecting…
      </div>
    );
  }

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {fill && area && <path d={area} fill={fill} stroke="none" />}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Build an SVG path string for a line and an area-under-line fill.
 * Returns empty strings if there are not enough points.
 */
export function computePath(
  points: HistoryPoint[],
  width: number,
  height: number,
  domain?: [number, number],
  baselineZero = false,
): { d: string; area: string } {
  if (points.length < 2) return { d: '', area: '' };

  const firstTs = points[0].ts;
  const lastTs = points[points.length - 1].ts;
  const tSpan = lastTs - firstTs || 1;

  let minV = Infinity;
  let maxV = -Infinity;
  if (domain) {
    [minV, maxV] = domain;
  } else {
    for (const p of points) {
      if (p.value < minV) minV = p.value;
      if (p.value > maxV) maxV = p.value;
    }
    if (baselineZero && minV > 0) minV = 0;
    // Guard against a flat series rendering as a line at y=NaN.
    if (minV === maxV) {
      maxV = minV + 1;
    }
  }
  const vSpan = maxV - minV || 1;

  const pad = 1;
  const usableH = Math.max(0, height - pad * 2);

  let d = '';
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const x = ((p.ts - firstTs) / tSpan) * width;
    const yNorm = (p.value - minV) / vSpan;
    const y = pad + (1 - Math.max(0, Math.min(1, yNorm))) * usableH;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
  }
  d = d.trim();

  // Area = line + closure along the bottom.
  const area = `${d} L ${width.toFixed(2)} ${(height - pad).toFixed(2)} L 0 ${(height - pad).toFixed(2)} Z`;

  return { d, area };
}
