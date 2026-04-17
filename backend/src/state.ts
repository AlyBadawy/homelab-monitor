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
  /** When the backend knows disk usage isn't available (e.g. QEMU without guest agent). */
  diskUnavailableReason?: string;
  uptimeSec: number | null;
  /** Current network rates in bytes/sec; null on the first tick (no prior sample). */
  netInBps?: number | null;
  netOutBps?: number | null;
  /** Number of backups found across every backup-content storage for this VM. */
  backupCount?: number | null;
  storages?: StoragePool[];     // present on proxmox-host
  updatedAt: number;
  error?: string;               // present when the last poll failed
}

/** Per-storage diagnostic from the most recent backup scan. */
export interface BackupScanDiagnostic {
  node: string;
  storage: string;
  type: string | null;
  /** Why we considered this storage a backup target (or didn't). */
  reason:
    | 'content-backup'
    | 'pbs-type'
    | 'skipped-disabled'
    | 'skipped-no-backup-content';
  /** HTTP request outcome. Undefined if we didn't probe it. */
  status: 'ok' | 'error' | 'skipped';
  /** How many entries of ANY content type the storage returned. */
  rawEntryCount?: number;
  /** How many of those were of `content === 'backup'` (what we count). */
  entryCount?: number;
  vmidsSeen?: number[];
  error?: string;
  /** User-facing hint when the scan reveals something suspicious. */
  hint?: string;
}

interface Snapshot {
  targets: Map<string, TargetSummary>;
  lastProxmoxError: string | null;
  backupScan: BackupScanDiagnostic[];
  generatedAt: number;
}

const snapshot: Snapshot = {
  targets: new Map(),
  lastProxmoxError: null,
  backupScan: [],
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
  backupScan: BackupScanDiagnostic[];
} {
  return {
    targets: Array.from(snapshot.targets.values()),
    generatedAt: snapshot.generatedAt,
    errors: { proxmox: snapshot.lastProxmoxError },
    backupScan: snapshot.backupScan,
  };
}

export function setProxmoxError(err: string | null): void {
  snapshot.lastProxmoxError = err;
  snapshot.generatedAt = Date.now();
}

export function setBackupScan(diag: BackupScanDiagnostic[]): void {
  snapshot.backupScan = diag;
  snapshot.generatedAt = Date.now();
}
