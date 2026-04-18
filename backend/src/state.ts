/**
 * In-memory snapshot of the most recent poll results. The HTTP API reads
 * directly from here so endpoints never wait on an upstream service.
 */

export type TargetKind =
  | 'proxmox-host'
  | 'vm'
  | 'container'
  | 'database'
  | 'storage'
  | 'unas';

export type TargetStatus = 'online' | 'offline' | 'unknown';

export interface StoragePoolBackup {
  /** Outcome of the content-listing probe for this pool. */
  status: 'ok' | 'error';
  /** Count of backup entries (vzdump + PBS) on this pool. */
  entryCount: number;
  /** Distinct vmids seen across those entries. */
  vmCount: number;
  /** Present when status === 'error'. */
  error?: string;
}

export interface StoragePool {
  name: string;
  type: string | null;
  used: number | null;
  total: number | null;
  usedPct: number | null;
  /**
   * Backup metadata — populated when the pool advertises `content=backup`
   * or is a PBS datastore. Null when the pool isn't a backup target.
   */
  backup: StoragePoolBackup | null;
}

export interface UnasDrive {
  /** Full device path, e.g. /dev/sda or /dev/nvme0n1. */
  device: string;
  model: string | null;
  serial: string | null;
  firmware: string | null;
  /** Overall SMART self-assessment. null when smartctl couldn't read it. */
  health: 'PASSED' | 'FAILED' | null;
  temperatureC: number | null;
  powerOnHours: number | null;
  capacityBytes: number | null;
  /** smartctl exit code if it surfaced issues (see `man smartctl`). */
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
  /** When the backend knows disk usage isn't available (e.g. QEMU without guest agent). */
  diskUnavailableReason?: string;
  uptimeSec: number | null;
  /** Current network rates in bytes/sec; null on the first tick (no prior sample). */
  netInBps?: number | null;
  netOutBps?: number | null;
  /** Number of backups found across every backup-content storage for this VM. */
  backupCount?: number | null;
  storages?: StoragePool[];     // present on proxmox-host + unas
  drives?: UnasDrive[];         // present on unas
  /** Max temperature across thermal zones (°C). Present on unas when readable. */
  cpuTempC?: number | null;
  updatedAt: number;
  error?: string;               // present when the last poll failed
}

interface Snapshot {
  targets: Map<string, TargetSummary>;
  lastProxmoxError: string | null;
  lastUnasError: string | null;
  generatedAt: number;
}

const snapshot: Snapshot = {
  targets: new Map(),
  lastProxmoxError: null,
  lastUnasError: null,
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
  errors: { proxmox: string | null; unas: string | null };
} {
  return {
    targets: Array.from(snapshot.targets.values()),
    generatedAt: snapshot.generatedAt,
    errors: {
      proxmox: snapshot.lastProxmoxError,
      unas: snapshot.lastUnasError,
    },
  };
}

export function setProxmoxError(err: string | null): void {
  snapshot.lastProxmoxError = err;
  snapshot.generatedAt = Date.now();
}

export function setUnasError(err: string | null): void {
  snapshot.lastUnasError = err;
  snapshot.generatedAt = Date.now();
}
