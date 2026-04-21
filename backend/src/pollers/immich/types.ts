/**
 * Minimal typings for the subset of Immich's API we consume.
 *
 * Endpoints:
 *   GET /api/server/statistics   (admin key required)
 *   GET /api/jobs                (admin key required)
 *
 * Auth:
 *   Header `x-api-key: <admin api key>`.
 *
 * Everything is defensively optional: Immich has reshaped both endpoints
 * multiple times between major versions (e.g. `usage` vs `usageByUser`,
 * the addition of `notifications` and `duplicateDetection` queues), and
 * we want stale servers to just render "—" rather than throw.
 */

/* ---------- /api/server/statistics ---------- */

export interface ImmichUserUsageRaw {
  /** User UUID. */
  userId?: string;
  /** Display name or email — field name has drifted across versions. */
  userName?: string;
  userEmail?: string;
  /** Count of photos owned by this user. */
  photos?: number;
  /** Count of videos owned by this user. */
  videos?: number;
  /** Total bytes used (photos + videos + sidecar). */
  usage?: number;
  /** Breakdown of `usage`. */
  usagePhotos?: number;
  usageVideos?: number;
  /**
   * Per-user quota ceiling in bytes. `null`/missing = no quota.
   * We expose it in the card so over-quota users are obvious.
   */
  quotaSizeInBytes?: number | null;
}

export interface ImmichServerStatistics {
  photos?: number;
  videos?: number;
  usage?: number;
  usagePhotos?: number;
  usageVideos?: number;
  /**
   * Per-user breakdown. Immich always returns an array (even for a
   * single-user deployment). Older servers sometimes omit it.
   */
  usageByUser?: ImmichUserUsageRaw[];
}

/* ---------- /api/jobs ---------- */

/**
 * Shape of a single queue's status. Immich returns a record keyed by
 * queue name (e.g. `thumbnailGeneration`). `jobCounts` is the BullMQ-style
 * count breakdown; `queueStatus` tells us if the queue is paused.
 */
export interface ImmichJobCounts {
  active?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  waiting?: number;
  paused?: number;
}

export interface ImmichQueueStatus {
  isActive?: boolean;
  isPaused?: boolean;
}

export interface ImmichJobQueueRaw {
  jobCounts?: ImmichJobCounts;
  queueStatus?: ImmichQueueStatus;
}

/**
 * The /api/jobs response is a plain object keyed by queue name. We model it
 * as a record so adding new queues (Immich adds them between minor releases)
 * doesn't require a type change.
 */
export type ImmichJobsResponse = Record<string, ImmichJobQueueRaw>;

export interface ImmichConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  insecureTls: boolean;
  pollIntervalMs: number;
}
