/**
 * Thin API client. Frontend talks only to its own origin at /api/*.
 * In dev, Vite proxies /api → backend. In prod, nginx does the same.
 */

export type TargetKind =
  | 'proxmox-host'
  | 'vm'
  | 'container'
  | 'database'
  | 'storage'
  | 'unas'
  | 'service';

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
  updatedAt: number;
  error?: string;
}

export interface SummaryErrors {
  proxmox: string | null;
  unas: string | null;
}

export interface SummaryResponse {
  targets: TargetSummary[];
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
}> {
  const r = await fetch('/api/health', { signal });
  if (!r.ok) throw new Error(`health failed: ${r.status}`);
  return (await r.json()) as {
    status: string;
    uptimeSec: number;
    proxmox: 'enabled' | 'disabled';
    unas: 'enabled' | 'disabled';
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
