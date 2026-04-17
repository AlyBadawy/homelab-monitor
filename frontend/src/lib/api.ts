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
  uptimeSec: number | null;
  storages?: StoragePool[];
  updatedAt: number;
  error?: string;
}

export interface SummaryErrors {
  proxmox: string | null;
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
}> {
  const r = await fetch('/api/health', { signal });
  if (!r.ok) throw new Error(`health failed: ${r.status}`);
  return (await r.json()) as {
    status: string;
    uptimeSec: number;
    proxmox: 'enabled' | 'disabled';
  };
}
