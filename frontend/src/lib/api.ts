/**
 * Thin API client. Frontend talks only to its own origin at /api/*.
 * In dev, Vite proxies /api → backend. In prod, nginx does the same.
 */

export type TargetKind =
  | 'proxmox-host'
  | 'vm'
  | 'container'
  | 'docker-container'
  | 'database'
  | 'storage'
  | 'unas'
  | 'service'
  | 'nextcloud'
  | 'immich';

export type TargetStatus = 'online' | 'offline' | 'unknown';

export interface StoragePoolBackup {
  status: 'ok' | 'error';
  entryCount: number;
  vmCount: number;
  error?: string;
}

export interface StoragePool {
  name: string;
  type: string | null;
  used: number | null;
  total: number | null;
  usedPct: number | null;
  /** RAID level ('raid1', 'raid5', ...) — UNAS pools only. */
  raidLevel?: string | null;
  /** Total devices expected in the array (N in "[N/M]"). */
  raidDevices?: number | null;
  /** Devices currently in sync (M in "[N/M]"). M < N ⇒ degraded. */
  raidInSync?: number | null;
  /** User share names inside this pool (UNAS only). */
  shares?: string[] | null;
  /** Backup metadata for this pool, or null if it isn't a backup target. */
  backup: StoragePoolBackup | null;
}

export interface UnasDrive {
  device: string;
  model: string | null;
  serial: string | null;
  firmware: string | null;
  health: 'PASSED' | 'FAILED' | null;
  temperatureC: number | null;
  powerOnHours: number | null;
  capacityBytes: number | null;
  smartErrorBits: number | null;
}

/**
 * Nextcloud rich details — only populated on kind='nextcloud'.
 * Every number may be null if the upstream serverinfo response omitted it.
 */
export interface NextcloudDetails {
  version: string | null;
  activeUsers5m: number | null;
  activeUsers1h: number | null;
  activeUsers24h: number | null;
  totalUsers: number | null;
  filesCount: number | null;
  storageFreeBytes: number | null;
  sharesCount: number | null;
  appsWithUpdates: number | null;
}

/** Per-user row in the Immich top-N table. */
export interface ImmichUserUsage {
  label: string;
  photos: number | null;
  videos: number | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

/** One queue's snapshot in the Immich per-queue grid. */
export interface ImmichJobQueue {
  name: string;
  active: number;
  waiting: number;
  failed: number;
  paused: boolean;
}

/**
 * Immich rich details — only populated on kind='immich'.
 */
export interface ImmichDetails {
  photosTotal: number | null;
  videosTotal: number | null;
  libraryBytes: number | null;
  libraryPhotoBytes: number | null;
  libraryVideoBytes: number | null;
  userCount: number | null;
  users: ImmichUserUsage[];
  jobs: ImmichJobQueue[];
  jobsBacklog: number;
  jobsFailed: number;
}

export interface TargetSummary {
  id: string;
  name: string;
  kind: TargetKind;
  status: TargetStatus;
  cpuPct: number | null;
  memPct: number | null;
  diskPct: number | null;
  diskUnavailableReason?: string;
  uptimeSec: number | null;
  netInBps?: number | null;
  netOutBps?: number | null;
  backupCount?: number | null;
  storages?: StoragePool[];
  /** Drives discovered on the UNAS (SMART + temp). */
  drives?: UnasDrive[];
  /** Max temperature across thermal zones (°C) — only populated for UNAS. */
  cpuTempC?: number | null;
  /** HTTP service fields — only populated on kind='service'. */
  url?: string;
  httpStatusCode?: number | null;
  latencyMs?: number | null;
  /**
   * Docker compose/swarm stack name. Only populated on kind='docker-container';
   * null for containers started with plain `docker run`.
   */
  stack?: string | null;
  /** Nextcloud rich details — only populated on kind='nextcloud'. */
  nextcloud?: NextcloudDetails;
  /** Immich rich details — only populated on kind='immich'. */
  immich?: ImmichDetails;
  updatedAt: number;
  error?: string;
}

export interface SummaryErrors {
  proxmox: string | null;
  unas: string | null;
  portainer: string | null;
  nextcloud: string | null;
  immich: string | null;
}

/* ---- Docker resources (networks, volumes) ----------------------------- */

export interface DockerNetworkSummary {
  id: string;
  name: string;
  driver: string;
  scope: string;
  /** True for docker's default networks (bridge, host, none). */
  builtIn: boolean;
  internal: boolean;
  attachable: boolean;
  subnet: string | null;
  gateway: string | null;
  /** Running containers currently attached. */
  attachedCount: number;
}

export interface DockerVolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  /** Stack label from com.docker.compose.project, if any. */
  stack: string | null;
  /** Bytes used on disk. Null when /system/df hasn't populated yet or driver reports -1. */
  sizeBytes: number | null;
  /** Running containers referencing this volume. */
  refCount: number | null;
  createdAt: string | null;
}

export interface DockerEndpointResources {
  endpointId: number;
  endpointName: string;
  networks: DockerNetworkSummary[];
  volumes: DockerVolumeSummary[];
  /** Unix ms when the size numbers were last updated. 0 if never. */
  sizesUpdatedAt: number;
  dfError?: string;
}

export interface SummaryResponse {
  targets: TargetSummary[];
  dockerResources: DockerEndpointResources[];
  generatedAt: number;
  errors: SummaryErrors;
}

export async function fetchSummary(
  signal?: AbortSignal,
): Promise<SummaryResponse> {
  const r = await fetch('/api/stats/summary', { signal });
  if (!r.ok) throw new Error(`summary failed: ${r.status}`);
  return (await r.json()) as SummaryResponse;
}

export async function fetchHealth(signal?: AbortSignal): Promise<{
  status: string;
  uptimeSec: number;
  proxmox: 'enabled' | 'disabled';
  unas: 'enabled' | 'disabled';
  portainer: 'enabled' | 'disabled';
  nextcloud: 'enabled' | 'disabled';
  immich: 'enabled' | 'disabled';
}> {
  const r = await fetch('/api/health', { signal });
  if (!r.ok) throw new Error(`health failed: ${r.status}`);
  return (await r.json()) as {
    status: string;
    uptimeSec: number;
    proxmox: 'enabled' | 'disabled';
    unas: 'enabled' | 'disabled';
    portainer: 'enabled' | 'disabled';
    nextcloud: 'enabled' | 'disabled';
    immich: 'enabled' | 'disabled';
  };
}

export interface HistoryPoint {
  ts: number;
  value: number;
}

export interface HistoryResponse {
  targetId: string;
  series: Record<string, HistoryPoint[]>;
  generatedAt: number;
}

export interface HistoryOptions {
  /** Max points per series. 0 = no downsampling. Default 200 (good for sparklines). */
  points?: number;
  /** How far back to query in ms. Default = full server retention (24h). */
  windowMs?: number;
  signal?: AbortSignal;
}

/**
 * Fetch 24h history for multiple metrics on one target in a single request.
 * Returns a {metric: points[]} map — each series is already downsampled
 * server-side to `points` (default 200) for cheap rendering.
 */
export async function fetchHistory(
  targetId: string,
  metrics: string[],
  opts: HistoryOptions = {},
): Promise<HistoryResponse> {
  const params = new URLSearchParams();
  params.set('metrics', metrics.join(','));
  if (typeof opts.points === 'number') params.set('points', String(opts.points));
  if (typeof opts.windowMs === 'number')
    params.set('windowMs', String(opts.windowMs));
  const url = `/api/stats/history/${encodeURIComponent(targetId)}?${params.toString()}`;
  const r = await fetch(url, { signal: opts.signal });
  if (!r.ok) throw new Error(`history failed: ${r.status}`);
  return (await r.json()) as HistoryResponse;
}

/* ---- HTTP service checks (CRUD) -------------------------------------- */

export interface ServiceCheck {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  expectedStatus: number | null;
  timeoutMs: number;
  insecureTls: boolean;
  createdAt: number;
}

export interface CreateServiceCheckInput {
  name: string;
  url: string;
  expectedStatus?: number | null;
  timeoutMs?: number;
  insecureTls?: boolean;
  enabled?: boolean;
}

export async function listServiceChecks(): Promise<ServiceCheck[]> {
  const r = await fetch('/api/services');
  if (!r.ok) throw new Error(`list checks failed: ${r.status}`);
  const body = (await r.json()) as { checks: ServiceCheck[] };
  return body.checks;
}

export async function createServiceCheck(
  input: CreateServiceCheckInput,
): Promise<ServiceCheck> {
  const r = await fetch('/api/services', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `create failed: ${r.status}`);
  }
  return (await r.json()) as ServiceCheck;
}

export async function updateServiceCheck(
  id: string,
  patch: Partial<CreateServiceCheckInput>,
): Promise<ServiceCheck> {
  const r = await fetch(`/api/services/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `update failed: ${r.status}`);
  }
  return (await r.json()) as ServiceCheck;
}

export async function deleteServiceCheck(id: string): Promise<void> {
  const r = await fetch(`/api/services/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!r.ok) throw new Error(`delete failed: ${r.status}`);
}
