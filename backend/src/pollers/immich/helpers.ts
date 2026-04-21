import { ImmichDetails, ImmichJobQueue, ImmichUserUsage } from "../../state";
import { intOrZero } from "../../utils/intOrZero";
import { nullIfUndef } from "../../utils/nullIfUndef";
import {
  ImmichJobsResponse,
  ImmichServerStatistics,
  ImmichUserUsageRaw,
} from "./types";

export function buildDetails(
  stats: ImmichServerStatistics | undefined,
  jobs: ImmichJobsResponse | undefined,
): ImmichDetails {
  const users = (stats?.usageByUser ?? [])
    .map(mapUserRow)
    .sort((a, b) => (b.usageBytes ?? 0) - (a.usageBytes ?? 0));

  const jobQueues: ImmichJobQueue[] = jobs
    ? Object.entries(jobs).map(([name, raw]) => ({
        name,
        active: intOrZero(raw?.jobCounts?.active),
        waiting: intOrZero(raw?.jobCounts?.waiting),
        failed: intOrZero(raw?.jobCounts?.failed),
        paused: Boolean(raw?.queueStatus?.isPaused),
      }))
    : [];

  // We keep a stable, alphabetical queue order so the grid doesn't visually
  // reshuffle every tick when counts change.
  jobQueues.sort((a, b) => a.name.localeCompare(b.name));

  const jobsBacklog = jobQueues.reduce(
    (acc, q) => acc + q.active + q.waiting,
    0,
  );
  const jobsFailed = jobQueues.reduce((acc, q) => acc + q.failed, 0);

  return {
    photosTotal: nullIfUndef(stats?.photos),
    videosTotal: nullIfUndef(stats?.videos),
    libraryBytes: nullIfUndef(stats?.usage),
    libraryPhotoBytes: nullIfUndef(stats?.usagePhotos),
    libraryVideoBytes: nullIfUndef(stats?.usageVideos),
    userCount: stats?.usageByUser ? stats.usageByUser.length : null,
    users,
    jobs: jobQueues,
    jobsBacklog,
    jobsFailed,
  };
}

export function mapUserRow(row: ImmichUserUsageRaw): ImmichUserUsage {
  // Prefer display name → email → truncated id so the table always has
  // *something* in the first column.
  const label =
    (row.userName && row.userName.trim()) ||
    (row.userEmail && row.userEmail.trim()) ||
    (row.userId ? row.userId.slice(0, 8) : "unknown");
  return {
    label,
    photos: nullIfUndef(row.photos),
    videos: nullIfUndef(row.videos),
    usageBytes: nullIfUndef(row.usage),
    quotaBytes:
      row.quotaSizeInBytes == null ? null : Number(row.quotaSizeInBytes),
  };
}

/**
 * Pull a human-friendly display name from the configured base URL. Example:
 *   https://immich.alybadawy.com/   →  "immich.alybadawy.com"
 */
export function deriveDisplayName(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return u.hostname || "Immich";
  } catch {
    return "Immich";
  }
}
