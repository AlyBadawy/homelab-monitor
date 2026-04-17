import clsx from 'clsx';

interface MetricBarProps {
  label: string;
  value: number | null;
  /** Optional reason shown as a subtitle when value is null. */
  unavailableReason?: string;
}

function accentFor(v: number): string {
  if (v >= 90) return 'bg-accent-rose';
  if (v >= 75) return 'bg-accent-amber';
  return 'bg-accent-cyan';
}

export function MetricBar({
  label,
  value,
  unavailableReason,
}: MetricBarProps) {
  const hasValue = value !== null && Number.isFinite(value);
  const display = hasValue ? `${(value as number).toFixed(0)}%` : '—';
  const pct = hasValue ? Math.max(0, Math.min(100, value as number)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
          {label}
        </span>
        <span
          className="font-mono text-xs text-text-muted"
          title={!hasValue ? unavailableReason : undefined}
        >
          {display}
          {!hasValue && unavailableReason && (
            <span className="ml-2 text-text-dim text-[0.65rem] uppercase tracking-[0.18em]">
              {unavailableReason}
            </span>
          )}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-bg-700 overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-[width] duration-500',
            !hasValue ? 'bg-text-dim/40' : accentFor(pct),
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
