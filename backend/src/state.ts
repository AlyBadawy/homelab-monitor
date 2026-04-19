/**
 * In-memory snapshot of the most recent poll results. The HTTP API reads
 * directly from here so endpoints never wait on an upstream service.
 */

export type TargetKind =
  | 'proxmox-host'
  | 'vm'
  | 'container'        // PVE LXC container (not Docker)
  | 'docker-container' // Docker container surfaced via Portainer
  | 'database'
  | 'storage'
  | 'unas'
  | 'service'
  | 'nextcloud'        // Nextcloud instance (serverinfo API)
  | 'immich';          // Immich instance — added in v0.12.

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
   * RAID level (e.g. 'raid1', 'raid5'). Only populated on UNAS pools that
   * map to a /proc/mdstat array. Null on Proxmox storages and on UNAS
   * pools that aren't mdraid-backed (e.g. a single-disk install).
   */
  raidLevel?: string | null;
  /** Expected device count in the RAID array (N in "[N/M]"). */
  raidDevices?: number | null;
  /** Devices currently in sync (M in "[N/M]"). M < N ⇒ degraded. */
  raidInSync?: number | null;
  /** User share names discovered inside this pool (UNAS only). */
  shares?: string[] | null;
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

/**
 * Nextcloud-specific detail payload — only populated on kind='nextcloud'.
 * Every number may be null if the upstream serverinfo response omitted it
 * (e.g. `freespace` can be missing on platforms that don't report disk).
 */
export interface NextcloudDetails {
  /** NC version string like "30.0.2.0". */
  version: string | null;
  /** Active-user counts from `activeUsers.*` (registered users seen recently). */
  activeUsers5m: number | null;
  activeUsers1h: number | null;
  activeUsers24h: number | null;
  /** Total registered users (enabled + disabled). */
  totalUsers: number | null;
  /** File count aggregated across all user homes. */
  filesCount: number | null;
  /** Free bytes on the data partition. Null when NC doesn't report it. */
  storageFreeBytes: number | null;
  /** Count of active outbound shares across all types. */
  sharesCount: number | null;
  /** Number of installed NC apps with an update available. */
  appsWithUpdates: number | null;
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
  /** HTTP service fields — only populated on kind='service'. */
  url?: string;
  httpStatusCode?: number | null;
  latencyMs?: number | null;
  /**
   * Docker compose/swarm stack name (from com.docker.compose.project or
   * com.docker.stack.namespace). Null on standalone containers. Only set
   * on kind='docker-container'.
   */
  stack?: string | null;
  /** Nextcloud rich details — only populated on kind='nextcloud'. */
  nextcloud?: NextcloudDetails;
  updatedAt: number;
  error?: string;               // present when the last poll failed
}

/* ---------------------- Docker resources (networks, volumes) ---------------------- */

export interface DockerNetworkSummary {
  id: string;
  name: string;
  driver: string;
  scope: string;
  /** True for the docker-installed default networks (bridge/host/none). */
  builtIn: boolean;
  internal: boolean;
  attachable: boolean;
  subnet: string | null;
  gateway: string | null;
  /** Number of running containers attached, derived from container inspects. */
  attachedCount: number;
}

export interface DockerVolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  /** Stack label from com.docker.compose.project, if any. */
  stack: string | null;
  /**
   * Bytes used on disk. Null when /system/df hasn't populated this
   * volume yet (first slow tick), or the driver reports -1.
   */
  sizeBytes: number | null;
  /** Containers currently referencing this volume (from /system/df). */
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
  /** Last /system/df error, if any. Rest of the data can still be fresh. */
  dfError?: string;
}

interface Snapshot {
  targets: Map<string, TargetSummary>;
  dockerResources: DockerEndpointResources[];
  lastProxmoxError: string | null;
  lastUnasError: string | null;
  lastPortainerError: string | null;
  lastNextcloudError: string | null;
  generatedAt: number;
}

const snapshot: Snapshot = {
  targets: new Map(),
  dockerResources: [],
  lastProxmoxError: null,
  lastUnasError: null,
  lastPortainerError: null,
  lastNextcloudError: null,
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
  dockerResources: DockerEndpointResources[];
  generatedAt: number;
  errors: {
    proxmox: string | null;
    unas: string | null;
    portainer: string | null;
    nextcloud: string | null;
  };
} {
  return {
    targets: Array.from(snapshot.targets.values()),
    dockerResources: snapshot.dockerResources,
    generatedAt: snapshot.generatedAt,
    errors: {
      proxmox: snapshot.lastProxmoxError,
      unas: snapshot.lastUnasError,
      portainer: snapshot.lastPortainerError,
      nextcloud: snapshot.lastNextcloudError,
    },
  };
}

/**
 * Replace the whole docker resources array. Called by the Portainer poller
 * after it has finished reading networks + volumes for every endpoint.
 */
export function setDockerResources(resources: DockerEndpointResources[]): void {
  snapshot.dockerResources = resources;
  snapshot.generatedAt = Date.now();
}

export function setProxmoxError(err: string | null): void {
  snapshot.lastProxmoxError = err;
  snapshot.generatedAt = Date.now();
}

export function setUnasError(err: string | null): void {
  snapshot.lastUnasError = err;
  snapshot.generatedAt = Date.now();
}

export function setPortainerError(err: string | null): void {
  snapshot.lastPortainerError = err;
  snapshot.generatedAt = Date.now();
}

export function setNextcloudError(err: string | null): void {
  snapshot.lastNextcloudError = err;
  snapshot.generatedAt = Date.now();
}
