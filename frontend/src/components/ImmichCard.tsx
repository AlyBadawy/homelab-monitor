import {
  Image as ImageIcon,
  Film,
  HardDrive,
  Users,
  Expand,
  AlertTriangle,
  PauseCircle,
} from "lucide-react";
import clsx from "clsx";
import type { ImmichJobQueue, TargetSummary } from "../lib/api";
import { StatusPill } from "./StatusPill";
import { MiniStat } from "./MiniStat";
import { useHistory } from "../lib/useHistory";
import { fmtBytes } from "../lib/format";

interface ImmichCardProps {
  target: TargetSummary;
  /** Open the detail drawer when the user clicks the card. */
  onSelect?: (target: TargetSummary) => void;
}

/**
 * Immich-specific card. Like NextcloudCard, Immich doesn't expose its own
 * CPU/mem/disk, so we skip the usual MetricBar stack and focus on what
 * matters to an Immich operator: library totals, per-user breakdown, and
 * the live job-queue grid.
 *
 * Layout:
 *   [ icon + IMMICH + hostname ]               [ backlog chip + status ]
 *   [ url ]
 *   [ 2x2 MiniStat grid: Photos | Videos | Library Size | Users ]
 *   [ Top-5 per-user table ]
 *   [ Per-queue grid — ALL queues, no filtering ]
 *   [ error banner, if any ]
 */
export function ImmichCard({ target, onSelect }: ImmichCardProps) {
  const im = target.immich;

  // 24h history for the three library totals + aggregate backlog. Matches
  // the metrics recorded by ImmichPoller.recordHistory.
  const { series } = useHistory(
    target.id,
    ["photos_total", "videos_total", "library_bytes", "jobs_backlog"],
    { points: 120, refreshMs: 30_000 },
  );

  const photosPoints = series.photos_total ?? [];
  const videosPoints = series.videos_total ?? [];
  const libraryPoints = series.library_bytes ?? [];

  const clickable = !!onSelect;
  const handleOpen = () => onSelect?.(target);

  const jobsBacklog = im?.jobsBacklog ?? 0;
  const jobsFailed = im?.jobsFailed ?? 0;
  // Header chip tone follows the same "keep the worst color" rule as the
  // queue grid: rose > amber > muted.
  const backlogTone: "rose" | "amber" | "muted" =
    jobsFailed > 0 ? "rose" : jobsBacklog > 0 ? "amber" : "muted";
  const backlogToneClass: Record<typeof backlogTone, string> = {
    rose: "border-accent-rose/40 text-accent-rose bg-accent-rose/5",
    amber: "border-accent-amber/40 text-accent-amber bg-accent-amber/5",
    muted: "border-border text-text-muted bg-bg-700/50",
  };

  const topUsers = (im?.users ?? []).slice(0, 5);

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
            <ImageIcon className="h-4 w-4" />
          </div>
          <div>
            <div className="card-title">IMMICH</div>
            <div className="font-semibold text-text">{target.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "rounded border px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.14em]",
              backlogToneClass[backlogTone],
            )}
            title={
              jobsFailed > 0
                ? `${jobsFailed.toLocaleString()} failed job(s), ${jobsBacklog.toLocaleString()} queued`
                : `${jobsBacklog.toLocaleString()} queued job(s)`
            }
          >
            Jobs {jobsBacklog.toLocaleString()}
          </span>
          <StatusPill status={target.status} />
          {clickable && (
            <Expand
              className="h-3.5 w-3.5 text-text-dim opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
        </div>
      </div>

      {target.url && (
        <div className="mb-3">
          <div
            className="font-mono text-[0.7rem] text-text-dim truncate"
            title={target.url}
          >
            {target.url}
          </div>
        </div>
      )}

      {/* Primary row: library totals + user count. */}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat
          icon={ImageIcon}
          label="Photos"
          value={fmtCount(im?.photosTotal ?? null)}
          tone="cyan"
          title="Total photos across the library"
          sparklinePoints={photosPoints}
          sparklineAriaLabel="Photos total 24h trend"
        />
        <MiniStat
          icon={Film}
          label="Videos"
          value={fmtCount(im?.videosTotal ?? null)}
          tone="emerald"
          title="Total videos across the library"
          sparklinePoints={videosPoints}
          sparklineAriaLabel="Videos total 24h trend"
        />
        <MiniStat
          icon={HardDrive}
          label="Library"
          value={fmtBytes(im?.libraryBytes ?? null)}
          tone="muted"
          title="Total bytes used across photos + videos + sidecar"
          sparklinePoints={libraryPoints}
          sparklineAriaLabel="Library bytes 24h trend"
        />
        <MiniStat
          icon={Users}
          label="Users"
          value={fmtCount(im?.userCount ?? null)}
          tone="muted"
          title="Registered users on this Immich instance"
        />
      </div>

      {/* Top-5 per-user table. Only shown when the server gave us a breakdown. */}
      {topUsers.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-bg-700/30 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-2 py-1">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
              Top Users
            </div>
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
              {im?.userCount ? `${topUsers.length} / ${im.userCount}` : ""}
            </div>
          </div>
          <table className="w-full font-mono text-[0.7rem]">
            <thead>
              <tr className="text-text-dim">
                <th className="px-2 py-1 text-left font-normal">User</th>
                <th className="px-2 py-1 text-right font-normal">Photos</th>
                <th className="px-2 py-1 text-right font-normal">Videos</th>
                <th className="px-2 py-1 text-right font-normal">Usage</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.map((u, i) => (
                <tr
                  key={`${u.label}-${i}`}
                  className="border-t border-border/60"
                >
                  <td
                    className="max-w-[120px] truncate px-2 py-1 text-text"
                    title={u.label}
                  >
                    {u.label}
                  </td>
                  <td className="px-2 py-1 text-right text-text-muted">
                    {fmtCount(u.photos)}
                  </td>
                  <td className="px-2 py-1 text-right text-text-muted">
                    {fmtCount(u.videos)}
                  </td>
                  <td className="px-2 py-1 text-right text-text">
                    {fmtBytes(u.usageBytes ?? null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-queue grid — ALL queues, no filtering. Each chip shows the
          queue name + three BullMQ counts. Rose tint when any queue has
          failures; amber when anything is active/waiting. */}
      {im?.jobs && im.jobs.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
              Queues
            </div>
            {jobsFailed > 0 && (
              <div className="flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-accent-rose">
                <AlertTriangle className="h-3 w-3" />
                {jobsFailed.toLocaleString()} failed
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5">
            {im.jobs.map((q) => (
              <QueueChip key={q.name} queue={q} />
            ))}
          </div>
        </div>
      )}

      {target.error && (
        <div className="mt-3 rounded-md border border-accent-rose/30 bg-accent-rose/5 px-2 py-1.5 font-mono text-[0.7rem] text-accent-rose break-all">
          {target.error}
        </div>
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

interface QueueChipProps {
  queue: ImmichJobQueue;
}

/**
 * Compact chip for a single BullMQ queue. Tone follows the "worst wins"
 * rule: rose if any failures, amber if anything queued/running, muted
 * otherwise. A pause icon appears when the admin has paused the queue.
 */
function QueueChip({ queue }: QueueChipProps) {
  const failed = queue.failed;
  const busy = queue.active + queue.waiting;
  const tone: "rose" | "amber" | "muted" =
    failed > 0 ? "rose" : busy > 0 ? "amber" : "muted";

  const toneClass: Record<typeof tone, string> = {
    rose: "border-accent-rose/40 bg-accent-rose/5",
    amber: "border-accent-amber/40 bg-accent-amber/5",
    muted: "border-border bg-bg-700/50",
  };

  return (
    <div
      className={clsx("rounded-md border px-2 py-1.5", toneClass[tone])}
      title={
        `${queue.name}\n` +
        `active ${queue.active} · waiting ${queue.waiting} · failed ${queue.failed}` +
        (queue.paused ? " · paused" : "")
      }
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className="truncate font-mono text-[0.65rem] uppercase tracking-[0.12em] text-text"
          title={queue.name}
        >
          {humanizeQueueName(queue.name)}
        </span>
        {queue.paused && (
          <PauseCircle
            className="h-3 w-3 shrink-0 text-text-dim"
            aria-label="Queue paused"
          />
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-2 font-mono text-[0.65rem]">
        <span
          className={clsx(
            queue.active > 0 ? "text-accent-cyan" : "text-text-dim",
          )}
          title="active"
        >
          ▶ {queue.active}
        </span>
        <span
          className={clsx(
            queue.waiting > 0 ? "text-accent-amber" : "text-text-dim",
          )}
          title="waiting"
        >
          ◌ {queue.waiting}
        </span>
        <span
          className={clsx(
            queue.failed > 0 ? "text-accent-rose" : "text-text-dim",
          )}
          title="failed"
        >
          ✕ {queue.failed}
        </span>
      </div>
    </div>
  );
}

/**
 * Turn Immich's camelCase queue names (e.g. `thumbnailGeneration`) into
 * a more readable short form for the chip header. We upper-case it so the
 * chip stays visually consistent with the rest of the card's font-mono
 * uppercase labels.
 */
function humanizeQueueName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

/**
 * Format small integer counters with thousands separators; fall back to "—"
 * for missing values so the chips stay aligned.
 */
function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString();
}
