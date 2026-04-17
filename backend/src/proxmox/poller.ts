import type { AppConfig } from '../config';
import { recordSample } from '../db';
import {
  replaceByPrefix,
  setProxmoxError,
  type StoragePool,
  type TargetSummary,
} from '../state';
import { ProxmoxClient } from './client';

/**
 * Polls Proxmox on a fixed interval and updates both the in-memory snapshot
 * and the SQLite samples table. One poll = one node status call + one
 * cluster/resources call + one storage list call per node. Three HTTP calls
 * total for a single-node PVE, so well within any reasonable rate.
 */
export class ProxmoxPoller {
  private readonly cfg: AppConfig;
  private readonly client: ProxmoxClient;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    this.client = new ProxmoxClient(cfg.proxmox);
  }

  start(): void {
    if (this.timer) return;
    // Fire once immediately so the UI gets data on first load.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.cfg.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;         // skip overlapping ticks
    this.running = true;
    try {
      await this.pollOnce();
      setProxmoxError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[proxmox] poll failed:', msg);
      setProxmoxError(msg);
    } finally {
      this.running = false;
    }
  }

  private async pollOnce(): Promise<void> {
    const now = Date.now();

    // Fetch everything in parallel.
    const [nodes, vms] = await Promise.all([
      this.client.listNodes(),
      this.client.clusterVms(),
    ]);

    // --- Host(s) ---
    // A standalone PVE returns one node; a cluster returns many. We include
    // each one as its own 'proxmox-host' target, but keep the first one's id
    // stable as 'proxmox-host' so the UI doesn't break for the common case.
    const hostTargets: TargetSummary[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      try {
        const [status, storages] = await Promise.all([
          this.client.nodeStatus(n.node),
          this.client.nodeStorages(n.node),
        ]);

        const pools: StoragePool[] = storages
          .filter(s => s.active === 1 && s.total && s.total > 0)
          .map(s => ({
            name: s.storage,
            type: s.type ?? null,
            used: s.used ?? null,
            total: s.total ?? null,
            usedPct:
              s.used != null && s.total ? (s.used / s.total) * 100 : null,
          }))
          .sort((a, b) => (b.usedPct ?? -1) - (a.usedPct ?? -1));

        const cpuPct = status.cpu * 100;
        const memPct = (status.memory.used / status.memory.total) * 100;
        const diskPct =
          (status.rootfs.used / status.rootfs.total) * 100;

        const id = i === 0 ? 'proxmox-host' : `proxmox-host-${n.node}`;
        hostTargets.push({
          id,
          name: `Proxmox · ${n.node}`,
          kind: 'proxmox-host',
          status: n.status === 'online' ? 'online' : 'offline',
          cpuPct,
          memPct,
          diskPct,                  // rootfs usage (kept for consistency)
          uptimeSec: status.uptime,
          storages: pools,
          updatedAt: now,
        });

        // Persist a handful of metrics for 24h history.
        recordSample(id, 'cpu_pct', cpuPct, now);
        recordSample(id, 'mem_pct', memPct, now);
        recordSample(id, 'rootfs_pct', diskPct, now);
        for (const p of pools) {
          if (p.usedPct != null) {
            recordSample(id, `storage:${p.name}:used_pct`, p.usedPct, now);
          }
        }
      } catch (nodeErr) {
        const msg =
          nodeErr instanceof Error ? nodeErr.message : String(nodeErr);
        hostTargets.push({
          id: `proxmox-host${i === 0 ? '' : `-${n.node}`}`,
          name: `Proxmox · ${n.node}`,
          kind: 'proxmox-host',
          status: 'offline',
          cpuPct: null,
          memPct: null,
          diskPct: null,
          uptimeSec: null,
          storages: [],
          updatedAt: now,
          error: msg,
        });
      }
    }
    replaceByPrefix('proxmox-host', hostTargets);

    // --- VMs + containers ---
    const vmTargets: TargetSummary[] = vms.map(v => {
      const running = v.status === 'running';
      const cpuPct = running && v.cpu != null ? v.cpu * 100 : null;
      const memPct =
        running && v.mem != null && v.maxmem
          ? (v.mem / v.maxmem) * 100
          : null;
      const diskPct =
        v.disk != null && v.maxdisk && v.maxdisk > 0
          ? (v.disk / v.maxdisk) * 100
          : null;

      const id = `${v.type}-${v.vmid}`;
      const name =
        v.name && v.name.length > 0 ? v.name : `${v.type.toUpperCase()} ${v.vmid}`;

      if (running) {
        if (cpuPct != null) recordSample(id, 'cpu_pct', cpuPct, now);
        if (memPct != null) recordSample(id, 'mem_pct', memPct, now);
      }

      return {
        id,
        name,
        kind: v.type === 'lxc' ? 'container' : 'vm',
        status: running ? 'online' : 'offline',
        cpuPct,
        memPct,
        diskPct,
        uptimeSec: running ? (v.uptime ?? null) : null,
        updatedAt: now,
      };
    });

    // Replace both 'qemu-*' and 'lxc-*' prefixes.
    replaceByPrefix('qemu-', vmTargets.filter(t => t.id.startsWith('qemu-')));
    replaceByPrefix('lxc-', vmTargets.filter(t => t.id.startsWith('lxc-')));
  }
}
