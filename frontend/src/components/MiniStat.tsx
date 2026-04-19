import { type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import type { HistoryPoint } from '../lib/api';
import { Sparkline } from './Sparkline';

interface MiniStatProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Optional accent tint applied to the icon + value. */
  tone?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'muted';
  title?: string;
  /**
   * Optional 24h trend data drawn underneath the value, full width of the
   * chip. The sparkline inherits the tone's color. When omitted, the chip
   * stays at its original compact height.
   */
  sparklinePoints?: HistoryPoint[];
  /** Force a y-domain on the sparkline (e.g. [0, 100] for percentages). */
  sparklineDomain?: [number, number];
  /** Aria label for the sparkline. */
  sparklineAriaLabel?: string;
}

const TONE_MAP: Record<NonNullable<MiniStatProps['tone']>, string> = {
  cyan: 'text-accent-cyan',
  emerald: 'text-accent-emerald',
  amber: 'text-accent-amber',
  rose: 'text-accent-rose',
  muted: 'text-text-muted',
};

/**
 * Compact stat chip designed for the VM card's 2x2 mini-stats grid.
 * Icon + label on top row, value on the next row, optional 24h sparkline
 * at the bottom — all font-mono. Sparkline inherits the tone color so
 * amber/rose tones visually match "things are getting warm".
 */
export function MiniStat({
  icon: Icon,
  label,
  value,
  tone = 'muted',
  title,
  sparklinePoints,
  sparklineDomain,
  sparklineAriaLabel,
}: MiniStatProps) {
  const valueTone = tone === 'muted' ? 'text-text' : TONE_MAP[tone];
  const showSpark = !!sparklinePoints;
  return (
    <div
      className="rounded-md border border-border bg-bg-700/50 px-2 py-1.5"
      title={title}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={clsx('h-3 w-3', TONE_MAP[tone])} />
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
          {label}
        </span>
      </div>
      <div className={clsx('mt-0.5 font-mono text-xs font-medium', valueTone)}>
        {value}
      </div>
      {showSpark && (
        <Sparkline
          points={sparklinePoints}
          // Fluid width via Tailwind; SVG uses preserveAspectRatio="none".
          className={clsx('mt-1 w-full h-[18px]', valueTone)}
          stroke="currentColor"
          strokeWidth={1.25}
          domain={sparklineDomain}
          ariaLabel={sparklineAriaLabel ?? `${label} 24h trend`}
        />
      )}
    </div>
  );
}
