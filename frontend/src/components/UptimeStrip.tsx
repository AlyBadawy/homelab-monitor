import { useMemo } from 'react';
import clsx from 'clsx';
import type { HistoryPoint } from '../lib/api';

export interface UptimeStripProps {
  /** http_up samples over the last 24h (value 0 = down, 1 = up). */
  points: HistoryPoint[];
  /** Number of buckets across the 24h window. Default 48 = 30-minute buckets. */
  buckets?: number;
  /** Width in px. */
  width?: number;
  /** Height in px. */
  height?: number;
  /** Window length in ms. Default 24h. */
  windowMs?: number;
  className?: string;
}

interface Bucket {
  /** Number of samples in this bucket. 0 = no data. */
  count: number;
  /** Mean availability (0..1) across samples in the bucket. */
  mean: number;
}

/**
 * Status-page style strip: bins the 24h `http_up` samples into equal-width
 * buckets and paints each bucket by its mean availability.
 *
 *   no data  → dim gray
 *   mean = 1 → emerald (fully up)
 *   mean = 0 → rose (fully down)
 *   mixed    → amber (partial outage)
 *
 * Designed to sit next to an availability % badge — the badge tells the
 * headline number, the strip tells the "when did it dip".
 */
export function UptimeStrip({
  points,
  buckets = 48,
  width = 144,
  height = 14,
  windowMs = 24 * 60 * 60 * 1000,
  className,
}: UptimeStripProps) {
  const bins = useMemo(
    () => bucketize(points, buckets, windowMs),
    [points, buckets, windowMs],
  );

  // Gap between bars is 1px — drop it on very narrow strips so we don't
  // lose half the pixels to gutters.
  const gap = buckets > 24 ? 1 : 0;
  const barW = Math.max(1, (width - gap * (buckets - 1)) / buckets);

  return (
    <svg
      className={clsx('block', className)}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label="24 hour uptime strip"
      role="img"
    >
      {bins.map((b, i) => {
        const x = i * (barW + gap);
        return (
          <rect
            key={i}
            x={x}
            y={0}
            width={barW}
            height={height}
            rx={0.5}
            className={fillClassFor(b)}
          />
        );
      })}
    </svg>
  );
}

/** Compute the overall availability across the window (0..1, or null if no data). */
export function availabilityPct(points: HistoryPoint[]): number | null {
  if (points.length === 0) return null;
  let sum = 0;
  for (const p of points) sum += p.value;
  return sum / points.length;
}

function fillClassFor(b: Bucket): string {
  if (b.count === 0) return 'fill-bg-700';
  // Treat ≥ 99.5% as healthy to avoid a single slow sample recoloring a bucket.
  if (b.mean >= 0.995) return 'fill-accent-emerald/80';
  if (b.mean <= 0.005) return 'fill-accent-rose/80';
  return 'fill-accent-amber/80';
}

/**
 * Bin points into N equal-width buckets over the last `windowMs` ms
 * (now - windowMs → now). Samples older than the window are dropped.
 */
function bucketize(
  points: HistoryPoint[],
  buckets: number,
  windowMs: number,
): Bucket[] {
  const now = Date.now();
  const start = now - windowMs;
  const bucketMs = windowMs / buckets;

  const bins: Bucket[] = Array.from({ length: buckets }, () => ({ count: 0, mean: 0 }));
  // Use running sums to keep the loop branchless.
  const sums = new Array<number>(buckets).fill(0);

  for (const p of points) {
    if (p.ts < start || p.ts > now) continue;
    let idx = Math.floor((p.ts - start) / bucketMs);
    if (idx < 0) idx = 0;
    if (idx >= buckets) idx = buckets - 1;
    bins[idx].count += 1;
    sums[idx] += p.value;
  }
  for (let i = 0; i < buckets; i++) {
    if (bins[i].count > 0) bins[i].mean = sums[i] / bins[i].count;
  }
  return bins;
}
