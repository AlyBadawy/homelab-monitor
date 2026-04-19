import { useMemo } from 'react';
import clsx from 'clsx';
import { HardDrive } from 'lucide-react';
import type { UnasDrive } from '../lib/api';
import { fmtBytes } from '../lib/format';
import { useHistory } from '../lib/useHistory';
import { Sparkline } from './Sparkline';

interface DrivesTableProps {
  /** The UNAS target id (always 'unas' in current setup, but passed in for
   *  future flexibility / test isolation). */
  targetId: string;
  drives: UnasDrive[];
}

function healthTone(h: UnasDrive['health']): { text: string; className: string } {
  if (h === 'PASSED') {
    return { text: 'PASSED', className: 'text-accent-emerald' };
  }
  if (h === 'FAILED') {
    return { text: 'FAILED', className: 'text-accent-rose' };
  }
  return { text: '—', className: 'text-text-dim' };
}

function tempTone(t: number | null): string {
  if (t === null) return 'text-text-dim';
  if (t >= 55) return 'text-accent-rose';
  if (t >= 45) return 'text-accent-amber';
  return 'text-text-muted';
}

function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h >= 24 * 365) return `${(h / (24 * 365)).toFixed(1)}y`;
  if (h >= 24) return `${Math.round(h / 24)}d`;
  return `${h}h`;
}

/**
 * Slugify `/dev/sda` → `sda`, matching the backend's slugifyDevice in
 * unas/poller.ts. Drive temp history is stored under the metric name
 * `drive:<slug>:temp_c` so we need the same slug here to fetch it.
 */
function slugifyDevice(device: string): string {
  return device.replace(/^\/dev\//, '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

/**
 * Per-drive row for the UNAS card. Keeps the drive's device path + model on
 * the left and small health/temp (with 24h sparkline)/hours stats on the
 * right so the row reads well even when the card is narrow.
 *
 * The 24h temp sparkline is intentionally inline — a flat line across 24h
 * is the expected case for an idle homelab drive (SMART attr 194 often
 * only ticks every few minutes, and drives at thermal equilibrium hold ±1°C).
 */
export function DrivesTable({ targetId, drives }: DrivesTableProps) {
  // Build one metric per drive (`drive:<slug>:temp_c`) for a single batched
  // history fetch. If the drive list is empty, useHistory will no-op.
  const metrics = useMemo(
    () => drives.map((d) => `drive:${slugifyDevice(d.device)}:temp_c`),
    [drives],
  );
  const { series } = useHistory(targetId, metrics, {
    points: 96,        // 24h at ~15 min buckets — plenty for a small sparkline
    refreshMs: 60_000, // temps change slowly; refresh less often than summary
  });

  if (drives.length === 0) {
    return (
      <div className="font-mono text-xs text-text-dim italic">
        no drives detected
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {drives.map((d) => {
        const health = healthTone(d.health);
        const metricKey = `drive:${slugifyDevice(d.device)}:temp_c`;
        const points = series[metricKey] ?? [];
        return (
          <div
            key={d.device}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-700/30 px-2 py-1.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <HardDrive className="h-3.5 w-3.5 text-accent-cyan shrink-0" />
              <div className="min-w-0">
                <div className="font-mono text-xs text-text truncate">
                  {d.device}
                  {d.capacityBytes !== null && (
                    <span className="ml-2 text-text-dim">
                      {fmtBytes(d.capacityBytes)}
                    </span>
                  )}
                </div>
                {d.model && (
                  <div className="font-mono text-[0.65rem] text-text-dim truncate">
                    {d.model}
                  </div>
                )}
                {d.serial && (
                  <div
                    className="font-mono text-[0.65rem] text-text-dim truncate"
                    title="Serial number"
                  >
                    sn: {d.serial}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 font-mono text-[0.7rem]">
              <span
                className={clsx('font-semibold tracking-wide', health.className)}
                title="SMART overall-health self-assessment"
              >
                {health.text}
              </span>
              <div
                className="flex items-center gap-1.5"
                title={
                  points.length > 0
                    ? `${points.length} temp samples over the last 24h`
                    : 'Temp history not available yet'
                }
              >
                <span
                  className={clsx('tabular-nums w-10 text-right', tempTone(d.temperatureC))}
                >
                  {d.temperatureC === null ? '—' : `${d.temperatureC}°C`}
                </span>
                <Sparkline
                  points={points}
                  width={72}
                  height={16}
                  stroke="currentColor"
                  fill="rgba(34, 211, 238, 0.12)"
                  strokeWidth={1.25}
                  className={clsx('h-4 w-[72px]', tempTone(d.temperatureC))}
                  ariaLabel="24h temperature"
                />
              </div>
              <span className="text-text-dim" title="Power-on hours">
                {fmtHours(d.powerOnHours)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
