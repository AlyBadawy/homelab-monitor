import clsx from 'clsx';
import { AlertTriangle, Database as DatabaseIcon } from 'lucide-react';
import type { DockerVolumeSummary } from '../lib/api';
import { fmtBytes, fmtRelative } from '../lib/format';

interface VolumesCardProps {
  endpointName: string;
  volumes: DockerVolumeSummary[];
  /** Unix ms of the last /system/df refresh; 0 when never. */
  sizesUpdatedAt: number;
  /** Last /system/df error, if any. */
  dfError?: string;
}

/**
 * One card per Docker endpoint listing its volumes.
 *
 * Columns on lg+: name · driver · stack · size · refcount.
 * Volumes in use (refCount > 0) come first; orphans are dimmed and grouped
 * under a divider so the "safe to prune" ones are visually distinct.
 *
 * Size/refCount come from the slower /system/df tick — until the first
 * refresh lands we show "—" rather than fake zeros. A "refreshed X ago"
 * line makes it obvious why size columns might be a bit stale.
 */
export function VolumesCard({
  endpointName,
  volumes,
  sizesUpdatedAt,
  dfError,
}: VolumesCardProps) {
  const { used, orphan } = splitVolumes(volumes);

  if (volumes.length === 0) {
    return (
      <div className="card">
        <div className="card-title flex items-center gap-2">
          <DatabaseIcon className="h-3 w-3" />
          VOLUMES · {endpointName}
        </div>
        <p className="mt-3 font-mono text-xs text-text-dim italic">
          no volumes reported
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <DatabaseIcon className="h-3 w-3" />
          VOLUMES · {endpointName}
          <span className="text-text-dim">· {volumes.length}</span>
        </div>
        {sizesUpdatedAt > 0 && !dfError && (
          <span className="font-mono text-[0.6rem] normal-case tracking-normal text-text-dim">
            sizes {fmtRelative(sizesUpdatedAt)}
          </span>
        )}
      </div>

      {dfError && (
        <div className="mt-2 flex items-center gap-2 font-mono text-[0.65rem] text-accent-amber">
          <AlertTriangle className="h-3 w-3" />
          <span className="break-all">sizes unavailable: {dfError}</span>
        </div>
      )}

      <div className="mt-3 space-y-1">
        {used.map((v) => (
          <VolumeRow key={v.name} v={v} dim={false} />
        ))}
        {orphan.length > 0 && used.length > 0 && (
          <div className="pt-2 mt-2 border-t border-border/60" />
        )}
        {orphan.map((v) => (
          <VolumeRow key={v.name} v={v} dim />
        ))}
      </div>
    </div>
  );
}

function VolumeRow({ v, dim }: { v: DockerVolumeSummary; dim: boolean }) {
  const refLabel =
    v.refCount == null ? '—' : v.refCount === 0 ? 'unused' : `${v.refCount}×`;

  return (
    <div
      className={clsx(
        'grid gap-x-3 gap-y-0.5 items-baseline',
        'grid-cols-[1fr_auto] lg:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1fr)_auto_auto]',
        dim && 'opacity-60',
      )}
    >
      <span className="font-mono text-xs text-text truncate" title={v.name}>
        {v.name}
      </span>

      {/* mobile-only size on the header row */}
      <span className="lg:hidden font-mono text-[0.65rem] text-text-muted justify-self-end">
        {fmtBytes(v.sizeBytes)}
      </span>

      {/* second row on mobile = meta; on lg+ these are columns */}
      <span
        className={clsx(
          'font-mono text-[0.65rem] uppercase tracking-[0.15em] text-text-dim',
          'col-span-2 lg:col-span-1',
        )}
      >
        {v.driver}
        {v.stack && (
          <span className="ml-2 normal-case tracking-normal text-accent-cyan">
            {v.stack}
          </span>
        )}
        {!v.stack && (
          <span className="ml-2 normal-case tracking-normal text-text-dim">
            unstacked
          </span>
        )}
      </span>
      <span className="hidden lg:inline font-mono text-[0.65rem] text-text-dim truncate" title={v.mountpoint}>
        {v.mountpoint}
      </span>
      <span className="hidden lg:inline font-mono text-[0.65rem] text-text-muted justify-self-end">
        {fmtBytes(v.sizeBytes)}
      </span>
      <span
        className={clsx(
          'hidden lg:inline font-mono text-[0.65rem] justify-self-end',
          v.refCount === 0 ? 'text-text-dim' : 'text-text-muted',
        )}
      >
        {refLabel}
      </span>
    </div>
  );
}

/** Split volumes by whether anything currently references them. */
function splitVolumes(volumes: DockerVolumeSummary[]): {
  used: DockerVolumeSummary[];
  orphan: DockerVolumeSummary[];
} {
  const used: DockerVolumeSummary[] = [];
  const orphan: DockerVolumeSummary[] = [];
  for (const v of volumes) {
    // refCount === 0 is a confirmed orphan; null (pre-first-df) stays with
    // "used" so we don't flash every volume into the orphan bucket on load.
    if (v.refCount === 0) orphan.push(v);
    else used.push(v);
  }
  const bySize = (a: DockerVolumeSummary, b: DockerVolumeSummary) =>
    (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1) || a.name.localeCompare(b.name);
  used.sort(bySize);
  orphan.sort(bySize);
  return { used, orphan };
}
