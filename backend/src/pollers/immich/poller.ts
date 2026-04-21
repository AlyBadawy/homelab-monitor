import { AppConfig } from "../../app/types";
import { recordSample } from "../../db";
import {
  replaceByPrefix,
  setImmichError,
  type ImmichDetails,
  type TargetSummary,
} from "../../state";
import { ImmichClient } from "./client";
import { buildDetails, deriveDisplayName } from "./helpers";

/**
 * Single-target poller for an Immich instance.
 *
 * Two admin API calls per tick:
 *   GET /api/server/statistics — totals + per-user breakdown.
 *   GET /api/jobs               — per-queue BullMQ counts.
 *
 * Both calls are issued in parallel with Promise.allSettled so a slow or
 * broken endpoint doesn't block the other half of the card. If *either*
 * succeeds, the tile shows as online with partial data; if both fail, the
 * tile goes offline and the amber banner surfaces the first error.
 */
export class ImmichPoller {
  private readonly cfg: AppConfig;
  private readonly client: ImmichClient;
  private readonly displayName: string;
  /** Stable target id for both the tile and every recordSample() call. */
  private readonly targetId = "app-immich";
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Unix ms of first successful poll — used to derive uptimeSec for the card. */
  private firstSeenOnlineAt: number | null = null;

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    this.client = new ImmichClient(cfg.immich);
    this.displayName = deriveDisplayName(cfg.immich.baseUrl);
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(
      () => void this.tick(),
      this.cfg.immich.pollIntervalMs,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const target = await this.pollOnce();
      replaceByPrefix(this.targetId, [target]);
    } finally {
      this.running = false;
    }
  }

  private async pollOnce(): Promise<TargetSummary> {
    const now = Date.now();
    const [statsRes, jobsRes] = await Promise.allSettled([
      this.client.getStatistics(),
      this.client.getJobs(),
    ]);

    const stats = statsRes.status === "fulfilled" ? statsRes.value : undefined;
    const jobs = jobsRes.status === "fulfilled" ? jobsRes.value : undefined;

    const errors: string[] = [];
    if (statsRes.status === "rejected") {
      errors.push(String(statsRes.reason?.message ?? statsRes.reason));
    }
    if (jobsRes.status === "rejected") {
      errors.push(String(jobsRes.reason?.message ?? jobsRes.reason));
    }

    // Both calls failed → tile is offline.
    if (!stats && !jobs) {
      const msg = errors.join(" | ");
      // eslint-disable-next-line no-console
      console.error("[immich] poll failed:", msg);
      setImmichError(msg);
      this.firstSeenOnlineAt = null;
      return {
        id: this.targetId,
        name: this.displayName,
        kind: "immich",
        status: "offline",
        cpuPct: null,
        memPct: null,
        diskPct: null,
        uptimeSec: null,
        url: this.cfg.immich.baseUrl,
        updatedAt: now,
        error: msg,
      };
    }

    // At least one succeeded — the card is online, partial data renders as "—".
    if (this.firstSeenOnlineAt == null) this.firstSeenOnlineAt = now;
    const uptimeSec = Math.round(
      (now - (this.firstSeenOnlineAt ?? now)) / 1000,
    );

    const details = buildDetails(stats, jobs);

    // Record the handful of trend metrics we promised in the v0.12 plan.
    this.recordHistory(details, now);

    // Partial failures still surface as a banner so the operator knows the
    // jobs grid or the per-user table is empty for a reason.
    setImmichError(errors.length > 0 ? errors.join(" | ") : null);

    return {
      id: this.targetId,
      name: this.displayName,
      kind: "immich",
      status: "online",
      // Immich doesn't report CPU/mem/disk for the app itself — leave null.
      cpuPct: null,
      memPct: null,
      diskPct: null,
      uptimeSec,
      url: this.cfg.immich.baseUrl,
      immich: details,
      updatedAt: now,
      // Non-fatal: keep the online status but expose the partial error on
      // the tile too. Useful for cases where /api/jobs is behind a different
      // auth/proxy rule than /api/server/statistics.
      error: errors.length > 0 ? errors.join(" | ") : undefined,
    };
  }

  private recordHistory(d: ImmichDetails, ts: number): void {
    const push = (metric: string, value: number | null) => {
      if (value != null && Number.isFinite(value)) {
        recordSample(this.targetId, metric, value, ts);
      }
    };
    push("photos_total", d.photosTotal);
    push("videos_total", d.videosTotal);
    push("library_bytes", d.libraryBytes);
    // jobsBacklog is a derived aggregate — always a finite number when jobs
    // succeeded, 0 when nothing is queued. Record it so the drawer can plot
    // sudden backlog spikes.
    if (d.jobs.length > 0) push("jobs_backlog", d.jobsBacklog);
  }
}
