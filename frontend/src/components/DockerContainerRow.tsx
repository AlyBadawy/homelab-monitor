import clsx from 'clsx';
import { Box, Expand } from 'lucide-react';
import type { TargetSummary } from '../lib/api';
import { StatusPill } from './StatusPill';
import { Sparkline } from './Sparkline';
import { useHistory } from '../lib/useHistory';
import { fmtRate, fmtUptime } from '../lib/format';
import { useMemo } from 'react';

interface DockerContainerRowProps {
  target: TargetSummary;
  onSelect?: (t: TargetSummary) => void;
}

/**
 * Two-line container row used inside a Docker stack subsection.
 *
 *   line 1 — uptime · cpu · mem
 *   line 2 — net in · net out · net rate sparkline (in + out, last 24h)
 *
 * The row is clickable — it opens the same detail drawer as the full card,
 * which owns full metric charts. Keeps the Docker section dense so dozens
 * of containers fit on one page without scrolling into oblivion.
 */
export function DockerContainerRow({
  target,
  onSelect,
}: DockerContainerRowProps) {
  const clickable = !!onSelect;

  // Net history drives the inline 24h sparkline. A single target fetch keeps
  // the per-row cost cheap; React batches these across the stack grid so
  // rendering 50 containers doesn't flood the backend.
  const { series } = useHistory(target.id, ['net_in_bps', 'net_out_bps'], {
    points: 90,
    refreshMs: 30_000,
  });

  const netInPoints = series.net_in_bps ?? [];
  const netOutPoints = series.net_out_bps ?? [];

  const netDomain = useMemo<[number, number] | undefined>(() => {
    if (netInPoints.length < 2 && netOutPoints.length < 2) return undefined;
    let max = 0;
    for (const p of netInPoints) if (p.value > max) max = p.value;
    for (const p of netOutPoints) if (p.value > max) max = p.value;
    if (max <= 0) return [0, 1];
    return [0, max];
  }, [netInPoints, netOutPoints]);

  const handleOpen = () => onSelect?.(target);

  return (
    <div
      className={clsx(
        'group rounded-md border border-border bg-bg-800/60 px-3 py-2',
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
      {/* Header: icon + name + status */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="h-3 w-3 shrink-0 text-accent-cyan" />
          <span
            className="truncate font-mono text-xs font-medium text-text"
            title={target.name}
          >
            {target.name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill status={target.status} />
          {clickable && (
            <Expand
              className="h-3.5 w-3.5 text-text-dim opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
        </div>
      </div>

      {/* Line 1: uptime · cpu · mem */}
      <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[0.65rem]">
        <Cell label="Uptime" value={fmtUptime(target.uptimeSec)} />
        <Cell label="CPU" value={pctLabel(target.cpuPct)} />
        <Cell label="Mem" value={pctLabel(target.memPct)} />
      </div>

      {/* Line 2: net in · net out · net rate sparkline */}
      <div className="mt-1 grid grid-cols-[auto_auto_1fr] items-center gap-3 font-mono text-[0.65rem]">
        <Cell
          label="Net in"
          value={fmtRate(target.netInBps)}
          accent="cyan"
        />
        <Cell
          label="Net out"
          value={fmtRate(target.netOutBps)}
          accent="emerald"
        />
        <div className="relative h-5 w-full min-w-[80px]">
          <div className="absolute inset-0">
            <Sparkline
              points={netInPoints}
              width={400}
              height={20}
              baselineZero
              domain={netDomain}
              stroke="#22d3ee"
              fill="rgba(34, 211, 238, 0.10)"
              strokeWidth={1}
              className="h-full w-full"
              ariaLabel="Network in history"
            />
          </div>
          <div className="absolute inset-0">
            <Sparkline
              points={netOutPoints}
              width={400}
              height={20}
              baselineZero
              domain={netDomain}
              stroke="#34d399"
              strokeWidth={1}
              className="h-full w-full"
              ariaLabel="Network out history"
            />
          </div>
        </div>
      </div>

      {target.error && (
        <div className="mt-2 rounded-md border border-accent-rose/30 bg-accent-rose/5 px-2 py-1 font-mono text-[0.65rem] text-accent-rose">
          {target.error}
        </div>
      )}
    </div>
  );
}

function pctLabel(v: number | null): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v.toFixed(0)}%`;
}

function Cell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'cyan' | 'emerald';
}) {
  const valueCls =
    accent === 'cyan'
      ? 'text-accent-cyan'
      : accent === 'emerald'
        ? 'text-accent-emerald'
        : 'text-text-muted';
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="uppercase tracking-[0.15em] text-text-dim">{label}</span>
      <span className={clsx('truncate text-right', valueCls)}>{value}</span>
    </div>
  );
}
