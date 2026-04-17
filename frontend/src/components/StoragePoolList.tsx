import clsx from 'clsx';
import type { StoragePool } from '../lib/api';
import { fmtBytes } from '../lib/format';

interface StoragePoolListProps {
  pools: StoragePool[];
  max?: number;
}

function accentFor(v: number): string {
  if (v >= 90) return 'bg-accent-rose';
  if (v >= 75) return 'bg-accent-amber';
  return 'bg-accent-cyan';
}

export function StoragePoolList({ pools, max = 6 }: StoragePoolListProps) {
  if (pools.length === 0) {
    return (
      <div className="font-mono text-xs text-text-dim italic">
        no active storage pools
      </div>
    );
  }

  const shown = pools.slice(0, max);
  const hidden = pools.length - shown.length;

  return (
    <div className="space-y-2.5">
      {shown.map(p => {
        const pct = p.usedPct ?? 0;
        return (
          <div key={p.name}>
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-mono text-xs text-text truncate">
                  {p.name}
                </span>
                {p.type && (
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
                    {p.type}
                  </span>
                )}
              </div>
              <span className="font-mono text-[0.7rem] text-text-muted whitespace-nowrap">
                {fmtBytes(p.used)} / {fmtBytes(p.total)}
                <span className="text-text-dim">
                  {' · '}
                  {p.usedPct === null ? '—' : `${p.usedPct.toFixed(0)}%`}
                </span>
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-bg-700 overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-[width] duration-500',
                  p.usedPct === null ? 'bg-text-dim/40' : accentFor(pct),
                )}
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </div>
          </div>
        );
      })}
      {hidden > 0 && (
        <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
          +{hidden} more
        </div>
      )}
    </div>
  );
}
