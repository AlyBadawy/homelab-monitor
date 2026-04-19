import { useEffect } from 'react';
import { X, RefreshCw } from 'lucide-react';
import type { TargetSummary } from '../lib/api';
import { useHistory } from '../lib/useHistory';
import { HistoryChart, type HistoryChartSeries } from './HistoryChart';
import { StatusPill } from './StatusPill';
import { fmtRate, fmtUptime } from '../lib/format';

interface DetailDrawerProps {
  target: TargetSummary | null;
  onClose: () => void;
}

/**
 * Full-screen overlay showing 24h charts for every metric we track on the
 * selected target. Lazy-loads — no history is fetched until the drawer opens.
 */
export function DetailDrawer({ target, onClose }: DetailDrawerProps) {
  // Lock body scroll while open.
  useEffect(() => {
    if (!target) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [target, onClose]);

  const metrics = target
    ? computeMetricsForTarget(target)
    : [];

  const { series, loading, error, generatedAt, refresh } = useHistory(
    target?.id ?? '',
    metrics,
    {
      // Enough resolution for a wide chart; tooltips are still accurate.
      points: 400,
      enabled: !!target,
      refreshMs: 30_000,
    },
  );

  if (!target) return null;

  const isHost = target.kind === 'proxmox-host';
  const isUnas = target.kind === 'unas';
  const isService = target.kind === 'service';
  const hasStoragePools = isHost || isUnas;
  const hasNet =
    target.netInBps !== undefined && target.netOutBps !== undefined;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-bg-900/80 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${target.name} history`}
    >
      <div
        className="relative w-full max-w-5xl rounded-xl border border-border-strong bg-bg-800 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="pointer-events-none absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-accent-cyan/60 rounded-tl-xl" />
        <span className="pointer-events-none absolute right-0 bottom-0 h-4 w-4 border-r-2 border-b-2 border-accent-cyan/30 rounded-br-xl" />

        {/* Header — min-w-0 on the left cluster lets long target names truncate
            instead of pushing the action buttons off the edge on mobile. */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <div className="card-title">
              {target.kind.toUpperCase()} · 24H HISTORY
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="truncate text-lg font-semibold text-text">
                {target.name}
              </h2>
              <StatusPill status={target.status} />
            </div>
            <div className="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-text-dim">
              uptime {fmtUptime(target.uptimeSec)}
              {generatedAt && (
                <span className="ml-3 text-text-dim/80">
                  · samples as of{' '}
                  {new Date(generatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={refresh}
              disabled={loading}
              className="rounded-md border border-border p-1.5 text-text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
              title="Refresh"
              aria-label="Refresh history"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-border p-1.5 text-text-muted transition-colors hover:border-border-strong hover:text-text"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Charts — tighter padding on mobile so charts get the most space. */}
        <div className="grid gap-3 p-3 sm:p-4">
          {error && (
            <div className="rounded-md border border-accent-rose/40 bg-accent-rose/5 px-3 py-2 font-mono text-xs text-accent-rose">
              {error}
            </div>
          )}

          {!isService && (
            <>
              <HistoryChart
                title="CPU"
                hint="percent · 24h"
                baselineZero
                ceiling={100}
                series={[
                  {
                    key: 'cpu_pct',
                    label: 'CPU',
                    points: series.cpu_pct ?? [],
                    stroke: '#22d3ee',
                    fill: 'rgba(34, 211, 238, 0.10)',
                    format: (v) => `${v.toFixed(1)}%`,
                  },
                ]}
              />

              <HistoryChart
                title="Memory"
                hint="percent · 24h"
                baselineZero
                ceiling={100}
                series={[
                  {
                    key: 'mem_pct',
                    label: 'Memory',
                    points: series.mem_pct ?? [],
                    stroke: '#34d399',
                    fill: 'rgba(52, 211, 153, 0.10)',
                    format: (v) => `${v.toFixed(1)}%`,
                  },
                ]}
              />
            </>
          )}

          {isService && (
            <>
              <HistoryChart
                title="Latency"
                hint="ms · 24h"
                baselineZero
                series={[
                  {
                    key: 'http_latency_ms',
                    label: 'Latency',
                    points: series.http_latency_ms ?? [],
                    stroke: '#a78bfa',
                    fill: 'rgba(167, 139, 250, 0.10)',
                    format: (v) => `${Math.round(v)} ms`,
                  },
                ]}
              />
              <HistoryChart
                title="Availability"
                hint="up/down · 24h"
                baselineZero
                ceiling={1}
                series={[
                  {
                    key: 'http_up',
                    label: 'Up',
                    points: series.http_up ?? [],
                    stroke: '#34d399',
                    fill: 'rgba(52, 211, 153, 0.10)',
                    format: (v) => (v >= 0.5 ? 'UP' : 'DOWN'),
                  },
                ]}
              />
            </>
          )}

          {hasNet && (
            <HistoryChart
              title="Network"
              hint="rate · 24h"
              baselineZero
              series={netSeries(series)}
            />
          )}

          {/* Host CPU temperature — only present on proxmox-host and unas.
              We don't gate this on `length > 0` so the chart always appears
              on those kinds; HistoryChart renders its own "collecting…"
              placeholder when there are <2 samples yet. */}
          {(isHost || isUnas) && (
            <HistoryChart
              title="CPU Temperature"
              hint="°C · 24h"
              baselineZero={false}
              series={[
                {
                  key: 'cpu_temp_c',
                  label: 'CPU Temp',
                  points: series.cpu_temp_c ?? [],
                  stroke: '#f97316',
                  fill: 'rgba(249, 115, 22, 0.10)',
                  format: (v) => `${v.toFixed(0)}°C`,
                },
              ]}
            />
          )}

          {!isHost && !isUnas && series.disk_pct && series.disk_pct.length > 0 && (
            <HistoryChart
              title="Disk"
              hint="percent · 24h"
              baselineZero
              ceiling={100}
              series={[
                {
                  key: 'disk_pct',
                  label: 'Disk',
                  points: series.disk_pct ?? [],
                  stroke: '#f59e0b',
                  fill: 'rgba(245, 158, 11, 0.10)',
                  format: (v) => `${v.toFixed(1)}%`,
                },
              ]}
            />
          )}

          {hasStoragePools &&
            storagePoolSeries(target, series).map((chart) => (
              <HistoryChart
                key={chart.key}
                title={chart.title}
                hint="percent · 24h"
                baselineZero
                ceiling={100}
                series={[chart.series]}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

function computeMetricsForTarget(target: TargetSummary): string[] {
  if (target.kind === 'service') {
    return ['http_latency_ms', 'http_up'];
  }
  const base = ['cpu_pct', 'mem_pct'];
  if (target.kind === 'vm' || target.kind === 'container') {
    base.push('disk_pct', 'net_in_bps', 'net_out_bps');
  }
  if (target.kind === 'docker-container') {
    // Docker has no exposed rootfs %, so we skip disk_pct.
    base.push('net_in_bps', 'net_out_bps');
  }
  if (target.kind === 'proxmox-host') {
    base.push('cpu_temp_c');
    for (const pool of target.storages ?? []) {
      base.push(`storage:${pool.name}:used_pct`);
    }
  }
  if (target.kind === 'unas') {
    base.push('rootfs_pct', 'cpu_temp_c');
    for (const pool of target.storages ?? []) {
      base.push(`storage:${pool.name}:used_pct`);
    }
  }
  return base;
}

function netSeries(
  series: Record<string, { ts: number; value: number }[]>,
): HistoryChartSeries[] {
  return [
    {
      key: 'net_in_bps',
      label: 'In',
      points: series.net_in_bps ?? [],
      stroke: '#22d3ee',
      format: (v) => fmtRate(v),
    },
    {
      key: 'net_out_bps',
      label: 'Out',
      points: series.net_out_bps ?? [],
      stroke: '#34d399',
      format: (v) => fmtRate(v),
    },
  ];
}

function storagePoolSeries(
  target: TargetSummary,
  series: Record<string, { ts: number; value: number }[]>,
): Array<{
  key: string;
  title: string;
  series: HistoryChartSeries;
}> {
  const pools = target.storages ?? [];
  return pools
    .map((pool) => {
      const metric = `storage:${pool.name}:used_pct`;
      const points = series[metric] ?? [];
      if (points.length < 2) return null;
      return {
        key: metric,
        title: `Storage · ${pool.name}`,
        series: {
          key: metric,
          label: pool.name,
          points,
          stroke: '#a78bfa',
          fill: 'rgba(167, 139, 250, 0.10)',
          format: (v: number) => `${v.toFixed(1)}%`,
        } as HistoryChartSeries,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
