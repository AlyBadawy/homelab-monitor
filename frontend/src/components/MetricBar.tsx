import clsx from 'clsx';

interface MetricBarProps {
  label: string;
  value: number | null;
}

function accentFor(v: number): string {
  if (v >= 90) return 'bg-accent-rose';
  if (v >= 75) return 'bg-accent-amber';
  return 'bg-accent-cyan';
}

export function MetricBar({ label, value }: MetricBarProps) {
  const display = value === null ? '—' : `${value.toFixed(0)}%`;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
          {label}
        </span>
        <span className="font-mono text-xs text-text-muted">{display}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-bg-700 overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-500',
            value === null ? 'bg-text-dim/40' : accentFor(pct),
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
