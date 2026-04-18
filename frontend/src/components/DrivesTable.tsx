import clsx from 'clsx';
import { HardDrive } from 'lucide-react';
import type { UnasDrive } from '../lib/api';
import { fmtBytes } from '../lib/format';

interface DrivesTableProps {
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
 * Per-drive row for the UNAS card. Keeps the drive's device path + model on
 * the left and the small health/temp/hours stats on the right so the row
 * reads well even when the card is narrow.
 */
export function DrivesTable({ drives }: DrivesTableProps) {
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
        return (
          <div
            key={d.device}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-700/30 px-2 py-1.5"
            title={d.serial ? `serial: ${d.serial}` : undefined}
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
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 font-mono text-[0.7rem]">
              <span
                className={clsx('font-semibold tracking-wide', health.className)}
                title="SMART overall-health self-assessment"
              >
                {health.text}
              </span>
              <span className={tempTone(d.temperatureC)} title="Temperature">
                {d.temperatureC === null ? '—' : `${d.temperatureC}°C`}
              </span>
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
