/**
 * In-memory snapshot of the most recent poll results. The HTTP API reads
 * directly from here so endpoints never wait on an upstream service.
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
  storages?: StoragePool[];     // present on proxmox-host
  updatedAt: number;
  error?: string;               // present when the last poll failed
}

interface Snapshot {
  targets: Map<string, TargetSummary>;
  lastProxmoxError: string | null;
  generatedAt: number;
}

const snapshot: Snapshot = {
  targets: new Map(),
  lastProxmoxError: null,
  generatedAt: 0,
};

/** Replace all targets whose id starts with `prefix` with the given list. */
export function replaceByPrefix(prefix: string, targets: TargetSummary[]): void {
  for (const id of Array.from(snapshot.targets.keys())) {
    if (id.startsWith(prefix)) snapshot.targets.delete(id);
  }
  for (const t of targets) {
    snapshot.targets.set(t.id, t);
  }
  snapshot.generatedAt = Date.now();
}

export function getSummary(): {
  targets: TargetSummary[];
  generatedAt: number;
  errors: { proxmox: string | null };
} {
  return {
    targets: Array.from(snapshot.targets.values()),
    generatedAt: snapshot.generatedAt,
    errors: { proxmox: snapshot.lastProxmoxError },
  };
}

export function setProxmoxError(err: string | null): void {
  snapshot.lastProxmoxError = err;
  snapshot.generatedAt = Date.now();
}
