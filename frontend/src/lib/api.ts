/**
 * Thin API client. Frontend talks only to its own origin at /api/*.
 * In dev, Vite proxies /api → backend. In prod, nginx does the same.
 */

export type TargetKind =
  | 'proxmox-host'
  | 'vm'
  | 'container'
  | 'database'
  | 'storage';

export type TargetStatus = 'online' | 'offline' | 'unknown';

export interface StoragePool {
  name: string;
  type: string | null;
  used: number | null;
  total: number | null;
  usedPct: number | null;
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
  updatedAt: number;
  error?: string;
}

export interface SummaryErrors {
  proxmox: string | null;
}

export interface BackupScanDiagnostic {
  node: string;
  storage: string;
  type: string | null;
  reason:
    | 'content-backup'
    | 'pbs-type'
    | 'skipped-disabled'
    | 'skipped-no-backup-content';
  status: 'ok' | 'error' | 'skipped';
  rawEntryCount?: number;
  entryCount?: number;
  vmidsSeen?: number[];
  error?: string;
  hint?: string;
}

export interface SummaryResponse {
  targets: TargetSummary[];
  generatedAt: number;
  errors: SummaryErrors;
  backupScan?: BackupScanDiagnostic[];
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
}> {
  const r = await fetch('/api/health', { signal });
  if (!r.ok) throw new Error(`health failed: ${r.status}`);
  return (await r.json()) as {
    status: string;
    uptimeSec: number;
    proxmox: 'enabled' | 'disabled';
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
