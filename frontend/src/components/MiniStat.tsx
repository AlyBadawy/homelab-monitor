import { type LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface MiniStatProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Optional accent tint applied to the icon + value. */
  tone?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'muted';
  title?: string;
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
 * Icon + label on top row, value on bottom row — all font-mono.
 */
export function MiniStat({
  icon: Icon,
  label,
  value,
  tone = 'muted',
  title,
}: MiniStatProps) {
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
      <div
        className={clsx(
          'mt-0.5 font-mono text-xs font-medium',
          tone === 'muted' ? 'text-text' : TONE_MAP[tone],
        )}
      >
        {value}
      </div>
    </div>
  );
}
