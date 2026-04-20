import { Box, Cpu } from 'lucide-react';
import clsx from 'clsx';
import type { TargetSummary } from '../lib/api';
import { StatusPill } from './StatusPill';
import { MetricBar } from './MetricBar';
import { fmtRate, fmtUptime } from '../lib/format';

interface MiniVmCardProps {
  target: TargetSummary;
  onSelect?: (t: TargetSummary) => void;
}

/**
 * Compact VM / LXC card used inside the Hypervisor section grid.
 *
 * Strips the full TargetCard down to the essentials so many VMs fit into
 * the same row: icon + name + status on the header, CPU + memory bars,
 * and a four-up uptime/net row. The full metrics + 24h charts are still
 * available — click the card to open the detail drawer.
 */
export function MiniVmCard({ target, onSelect }: MiniVmCardProps) {
  const Icon = target.kind === 'vm' ? Cpu : Box;
  const clickable = !!onSelect;
  const handleOpen = () => onSelect?.(target);
  return (
    <div
      className={clsx(
        'rounded-md border border-border bg-bg-800/60 p-3',
        'flex flex-col gap-2',
        clickable &&
          'cursor-pointer transition-colors hover:border-border-strong focus-within:border-border-strong',
      )}
      onClick={clickable ? handleOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpen();
              }
            }
          : undefined
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Open history for ${target.name}` : undefined}
      title={target.error}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-3 w-3 shrink-0 text-accent-cyan" />
          <span
            className="truncate font-mono text-xs font-medium text-text"
            title={target.name}
          >
            {target.name}
          </span>
        </div>
        <StatusPill status={target.status} />
      </div>

      {/* Bars */}
      <div className="space-y-2">
        <MetricBar label="CPU" value={target.cpuPct} />
        <MetricBar label="Memory" value={target.memPct} />
      </div>

      {/* Net + uptime strip */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 pt-1 mt-1 border-t border-border/60 font-mono text-[0.6rem] uppercase tracking-[0.15em]">
        <span className="text-text-dim">Up</span>
        <span className="text-right text-text-muted">
          {fmtUptime(target.uptimeSec)}
        </span>
        <span className="text-text-dim">
          <span className="text-accent-cyan">↓</span> In
        </span>
        <span className="text-right text-text-muted">
          {fmtRate(target.netInBps)}
        </span>
        <span className="text-text-dim">
          <span className="text-accent-emerald">↑</span> Out
        </span>
        <span className="text-right text-text-muted">
          {fmtRate(target.netOutBps)}
        </span>
      </div>
    </div>
  );
}
