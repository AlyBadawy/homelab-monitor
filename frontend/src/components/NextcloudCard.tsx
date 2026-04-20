import {
  Cloud,
  Users,
  HardDrive,
  Files,
  Share2,
  Package,
  Clock,
  Expand,
} from "lucide-react";
import type { TargetSummary } from "../lib/api";
import { StatusPill } from "./StatusPill";
import { MiniStat } from "./MiniStat";
import { useHistory } from "../lib/useHistory";
import { fmtBytes, fmtUptime } from "../lib/format";

interface NextcloudCardProps {
  target: TargetSummary;
  /** Open the detail drawer when the user clicks the card. */
  onSelect?: (target: TargetSummary) => void;
}

/**
 * Nextcloud-specific card. Nextcloud doesn't report a meaningful CPU% / mem%
 * pair, so we skip the usual MetricBar stack and go straight to the domain
 * metrics that matter for a NC admin: storage free, files count, active
 * users, total users, shares, and apps-with-updates.
 *
 * Layout:
 *   [ icon + NEXTCLOUD label + hostname ]           [ status pill ]
 *   [ version + url ]
 *   [ 2x2 MiniStat grid: Storage Free | Files
 *                        Active 5m   | Active 1h ]
 *   [ 2x2 MiniStat grid: Users | Shares
 *                        Updates | Uptime ]
 */
export function NextcloudCard({ target, onSelect }: NextcloudCardProps) {
  const nc = target.nextcloud;

  // 24h trends for the sparklines inside the top four chips. These live on
  // our SQLite history DB — recorded by NextcloudPoller.recordHistory.
  const { series } = useHistory(
    target.id,
    ["storage_free_bytes", "files_count", "active_users_5m", "active_users_1h"],
    { points: 120, refreshMs: 30_000 },
  );

  const storagePoints = series.storage_free_bytes ?? [];
  const filesPoints = series.files_count ?? [];
  const active5mPoints = series.active_users_5m ?? [];
  const active1hPoints = series.active_users_1h ?? [];

  const clickable = !!onSelect;
  const handleOpen = () => onSelect?.(target);

  const updates = nc?.appsWithUpdates ?? null;
  const updatesTone: "muted" | "amber" = (updates ?? 0) > 0 ? "amber" : "muted";

  return (
    <div
      className={`card group ${
        clickable ? "cursor-pointer focus-within:border-border-strong" : ""
      }`}
      onClick={clickable ? handleOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOpen();
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Open history for ${target.name}` : undefined}
    >
      <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l border-t border-accent-cyan/60 rounded-tl-xl" />
      <span className="pointer-events-none absolute right-0 bottom-0 h-3 w-3 border-r border-b border-accent-cyan/30 rounded-br-xl" />

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-border bg-bg-700 p-2 text-accent-cyan">
            <Cloud className="h-4 w-4" />
          </div>
          <div className="card-title">NEXTCLOUD</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={target.status} />
          {clickable && (
            <Expand
              className="h-3.5 w-3.5 text-text-dim opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
        </div>
      </div>

      {(target.url || nc?.version) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {target.url ? (
            <div
              className="font-mono text-[0.7rem] text-text-dim truncate"
              title={target.url}
            >
              {target.url}
            </div>
          ) : (
            <span />
          )}
          {nc?.version && (
            <span
              className="shrink-0 rounded border border-border bg-bg-700/50 px-1.5 py-0.5 font-mono text-[0.65rem] text-text-muted"
              title="Nextcloud server version"
            >
              v{nc.version}
            </span>
          )}
        </div>
      )}

      {/* Primary row: storage free + file count + active-user windows. */}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat
          icon={HardDrive}
          label="Storage Free"
          value={fmtBytes(nc?.storageFreeBytes ?? null)}
          tone="cyan"
          title="Free bytes on the NC data partition"
          sparklinePoints={storagePoints}
          sparklineAriaLabel="Storage free 24h trend"
        />
        <MiniStat
          icon={Files}
          label="Files"
          value={fmtCount(nc?.filesCount ?? null)}
          tone="muted"
          title="Total files aggregated across every user home"
          sparklinePoints={filesPoints}
          sparklineAriaLabel="File count 24h trend"
        />
        <MiniStat
          icon={Users}
          label="Active · 5m"
          value={fmtCount(nc?.activeUsers5m ?? null)}
          tone="emerald"
          title="Registered users seen in the last 5 minutes"
          sparklinePoints={active5mPoints}
          sparklineAriaLabel="Active users 5m trend"
        />
        <MiniStat
          icon={Users}
          label="Active · 1h"
          value={fmtCount(nc?.activeUsers1h ?? null)}
          tone="emerald"
          title="Registered users seen in the last hour"
          sparklinePoints={active1hPoints}
          sparklineAriaLabel="Active users 1h trend"
        />
      </div>

      {/* Secondary row: static counters. No sparklines — these drift slowly
          and adding tiny flat lines would just be visual noise. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <MiniStat
          icon={Users}
          label="Users"
          value={fmtCount(nc?.totalUsers ?? null)}
          tone="muted"
          title="Total registered users (enabled + disabled)"
        />
        <MiniStat
          icon={Share2}
          label="Shares"
          value={fmtCount(nc?.sharesCount ?? null)}
          tone="muted"
          title="Active outbound shares across all types"
        />
        <MiniStat
          icon={Package}
          label="Updates"
          value={fmtCount(updates)}
          tone={updatesTone}
          title="Installed apps with an update available"
        />
        <MiniStat
          icon={Clock}
          label="Uptime"
          value={fmtUptime(target.uptimeSec)}
          tone="muted"
          title="Time since the monitor first saw this instance online"
        />
      </div>

      {target.error && (
        <div className="mt-3 rounded-md border border-accent-rose/30 bg-accent-rose/5 px-2 py-1.5 font-mono text-[0.7rem] text-accent-rose">
          {target.error}
        </div>
      )}
    </div>
  );
}

/**
 * Format small integer counters with thousands separators; fall back to "—"
 * for missing values so the chips stay aligned.
 */
function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}
