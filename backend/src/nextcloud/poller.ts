import type { AppConfig } from '../config';
import { recordSample } from '../db';
import {
  replaceByPrefix,
  setNextcloudError,
  type NextcloudDetails,
  type TargetSummary,
} from '../state';
import { NextcloudClient } from './client';
import type { NcServerInfoData } from './types';

/**
 * Single-target poller for a Nextcloud instance.
 *
 * One API call per tick: GET /ocs/v2.php/apps/serverinfo/api/v1/info
 * with the monitoring token. Everything we surface on the card comes from
 * that response.
 *
 * Error handling:
 *   - On upstream failure, we keep the tile visible with status='offline'
 *     and an `error` string (matching the behaviour of every other poller),
 *     and publish the error message via setNextcloudError() so an amber
 *     banner shows in the UI.
 *   - Last successful details are *not* retained after a failure — the
 *     card should show "—" rather than stale numbers.
 */
export class NextcloudPoller {
  private readonly cfg: AppConfig;
  private readonly client: NextcloudClient;
  /** Sourced once from the configured baseUrl so we don't re-parse per tick. */
  private readonly displayName: string;
  /** Stable target id used for both the tile and every recordSample() call. */
  private readonly targetId = 'app-nextcloud';
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** Unix ms when we first saw this instance online — used to derive uptimeSec for the card header. */
  private firstSeenOnlineAt: number | null = null;

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    this.client = new NextcloudClient(cfg.nextcloud);
    this.displayName = deriveDisplayName(cfg.nextcloud.baseUrl);
  }

  /** Direct access used by routes/index so callers can push the tile into state. */
  getTargetId(): string {
    return this.targetId;
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(
      () => void this.tick(),
      this.cfg.nextcloud.pollIntervalMs,
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
      // Single-target prefix: the id *is* the prefix. If this poller later
      // supports multiple NC instances, move this to a shared `app-nextcloud-`
      // prefix with per-instance suffixes.
      replaceByPrefix(this.targetId, [target]);
    } finally {
      this.running = false;
    }
  }

  private async pollOnce(): Promise<TargetSummary> {
    const now = Date.now();
    try {
      const info = await this.client.getServerInfo();
      setNextcloudError(null);

      if (this.firstSeenOnlineAt == null) this.firstSeenOnlineAt = now;
      const uptimeSec = Math.round(
        (now - (this.firstSeenOnlineAt ?? now)) / 1000,
      );

      const details = buildDetails(info);
      this.recordHistory(details, now);

      return {
        id: this.targetId,
        name: this.displayName,
        kind: 'nextcloud',
        status: 'online',
        // We deliberately leave cpuPct/memPct/diskPct null — NC's cpuload is
        // a 1/5/15-min loadavg triple, not a %, and we don't want to invent
        // an apples-to-oranges comparison with other tiles.
        cpuPct: null,
        memPct: null,
        diskPct: null,
        uptimeSec,
        url: this.cfg.nextcloud.baseUrl,
        nextcloud: details,
        updatedAt: now,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[nextcloud] poll failed:', msg);
      setNextcloudError(msg);
      this.firstSeenOnlineAt = null;
      return {
        id: this.targetId,
        name: this.displayName,
        kind: 'nextcloud',
        status: 'offline',
        cpuPct: null,
        memPct: null,
        diskPct: null,
        uptimeSec: null,
        url: this.cfg.nextcloud.baseUrl,
        updatedAt: now,
        error: msg,
      };
    }
  }

  private recordHistory(d: NextcloudDetails, ts: number): void {
    const push = (metric: string, value: number | null) => {
      if (value != null && Number.isFinite(value)) {
        recordSample(this.targetId, metric, value, ts);
      }
    };
    push('active_users_5m', d.activeUsers5m);
    push('active_users_1h', d.activeUsers1h);
    push('active_users_24h', d.activeUsers24h);
    push('storage_free_bytes', d.storageFreeBytes);
    push('files_count', d.filesCount);
  }
}

/* ---------------- helpers ---------------- */

/**
 * Parse the serverinfo payload into the card-ready shape. Every field is
 * nullable so a stripped-down response (older NC, custom theme, etc.)
 * doesn't throw — it just renders "—" in the UI.
 */
function buildDetails(info: NcServerInfoData): NextcloudDetails {
  const sys = info.nextcloud?.system;
  const stor = info.nextcloud?.storage;
  const shr = info.nextcloud?.shares;
  const au = info.activeUsers;

  // NC reports `freespace` in bytes. Values ≤ 0 are a "couldn't compute"
  // sentinel on some platforms — normalize to null so charts treat it as
  // missing data instead of plotting a fake zero.
  const freespace = sys?.freespace;
  const storageFreeBytes =
    typeof freespace === 'number' && freespace > 0 ? freespace : null;

  return {
    version: sys?.version ?? null,
    activeUsers5m: nullIfUndef(au?.last5minutes),
    activeUsers1h: nullIfUndef(au?.last1hour),
    activeUsers24h: nullIfUndef(au?.last24hours),
    totalUsers: nullIfUndef(stor?.num_users),
    filesCount: nullIfUndef(stor?.num_files),
    storageFreeBytes,
    sharesCount: nullIfUndef(shr?.num_shares),
    appsWithUpdates: nullIfUndef(sys?.apps?.num_updates_available),
  };
}

function nullIfUndef(v: number | undefined | null): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Pull a human-friendly display name from the configured base URL. Example:
 *   https://nextcloud.alybadawy.com/    →  "nextcloud.alybadawy.com"
 * Falls back to a plain "Nextcloud" when parsing fails.
 */
function deriveDisplayName(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return u.hostname || 'Nextcloud';
  } catch {
    return 'Nextcloud';
  }
}
