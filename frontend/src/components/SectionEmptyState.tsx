import { AlertTriangle } from 'lucide-react';

interface SectionEmptyStateProps {
  /**
   * Card-title label, e.g. "HYPERVISOR · NO DATA". Rendered in the usual
   * dimmed card-title style.
   */
  label: string;
  /** Last poller error message (e.g. apiErrors.proxmox). */
  pollerError?: string | null;
  /** Top-level /api/stats/summary fetch error. */
  fetchError?: string | null;
  /**
   * Fallback line shown when nothing is wrong but the poller has simply not
   * emitted a target yet — typically "integration disabled" or "not
   * configured".
   */
  idleMessage?: string;
}

/**
 * Dimmed placeholder card used by sections that used to hide themselves
 * when their underlying poller hadn't reported any targets. The section
 * header still renders above this, so the homepage layout never collapses.
 *
 * Precedence for what we surface:
 *   1. backend unreachable  → amber banner with /api/stats/summary error
 *   2. poller errored       → amber banner with the poller's last error
 *   3. idle / disabled      → muted "no data yet" line
 *
 * The amber styling matches the existing top-of-page apiErrors banners so
 * it reads as the same signal ("this poller is unhealthy") regardless of
 * where the user sees it.
 */
export function SectionEmptyState({
  label,
  pollerError,
  fetchError,
  idleMessage,
}: SectionEmptyStateProps) {
  const hasError = !!fetchError || !!pollerError;
  return (
    <div className="card opacity-70">
      <div className="card-title">{label}</div>

      {fetchError && (
        <div className="mt-3 rounded-md border border-accent-amber/40 bg-accent-amber/5 px-3 py-2">
          <div className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-accent-amber">
            <AlertTriangle className="h-3.5 w-3.5" />
            Backend unreachable
          </div>
          <p className="mt-1 font-mono text-xs text-text-muted break-all">
            {fetchError}
          </p>
        </div>
      )}

      {!fetchError && pollerError && (
        <div className="mt-3 rounded-md border border-accent-amber/40 bg-accent-amber/5 px-3 py-2">
          <div className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-accent-amber">
            <AlertTriangle className="h-3.5 w-3.5" />
            Poller error
          </div>
          <p className="mt-1 font-mono text-xs text-text-muted break-all">
            {pollerError}
          </p>
        </div>
      )}

      {!hasError && (
        <p className="mt-3 font-mono text-xs text-text-dim italic">
          {idleMessage ?? 'no data reported yet'}
        </p>
      )}
    </div>
  );
}
