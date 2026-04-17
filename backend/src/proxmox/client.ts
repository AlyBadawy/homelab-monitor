import { Agent, fetch, type RequestInit } from 'undici';
import type { ProxmoxConfig } from '../config';
import type {
  PveApiEnvelope,
  PveBackupEntry,
  PveClusterResourceVm,
  PveNodeStatus,
  PveNodeSummary,
  PveStorage,
} from './types';

/**
 * Thin wrapper around the Proxmox REST API using a read-only API token.
 * Only GETs — this dashboard is strictly observational.
 */
export class ProxmoxClient {
  private readonly cfg: ProxmoxConfig;
  private readonly dispatcher?: Agent;

  constructor(cfg: ProxmoxConfig) {
    this.cfg = cfg;
    // Opt-in insecure TLS for self-signed Proxmox certs. Scoped to this
    // client only — does not affect other fetch() calls.
    if (cfg.insecureTls) {
      this.dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.cfg.baseUrl}/api2/json${path}`;
    const init: RequestInit = {
      method: 'GET',
      headers: {
        Authorization: `PVEAPIToken=${this.cfg.tokenId}=${this.cfg.tokenSecret}`,
        Accept: 'application/json',
      },
      dispatcher: this.dispatcher,
    };

    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `proxmox ${path} → ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`,
      );
    }
    const json = (await res.json()) as PveApiEnvelope<T>;
    return json.data;
  }

  /** List all cluster nodes. */
  listNodes(): Promise<PveNodeSummary[]> {
    return this.get<PveNodeSummary[]>('/nodes');
  }

  /** Detailed status for a single node — cpu, memory, rootfs, uptime. */
  nodeStatus(node: string): Promise<PveNodeStatus> {
    return this.get<PveNodeStatus>(`/nodes/${encodeURIComponent(node)}/status`);
  }

  /** All VMs + containers across the cluster in one call. */
  clusterVms(): Promise<PveClusterResourceVm[]> {
    return this.get<PveClusterResourceVm[]>('/cluster/resources?type=vm');
  }

  /** Storage pools visible to a node (with used/total/avail when active). */
  nodeStorages(node: string): Promise<PveStorage[]> {
    return this.get<PveStorage[]>(
      `/nodes/${encodeURIComponent(node)}/storage`,
    );
  }

  /**
   * Backup entries on a specific storage for a specific node.
   * Works for both PBS-type storages and file-based (dir/nfs) storages
   * that hold vzdump files.
   */
  nodeStorageBackups(
    node: string,
    storage: string,
  ): Promise<PveBackupEntry[]> {
    return this.get<PveBackupEntry[]>(
      `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content?content=backup`,
    );
  }
}
