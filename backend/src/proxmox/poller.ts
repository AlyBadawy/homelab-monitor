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
 * and the SQLite samples table.
 *
 * Per poll: one listNodes + one clusterVms call, plus per-node:
 *   - /nodes/{n}/status         (one call)
 *   - /nodes/{n}/storage         (one call — all storages, for host card + backup discovery)
 *   - /nodes/{n}/storage/{s}/content?content=backup for each backup-content storage
 *
 * For a single-node PVE with ~3 backup storages that's ~6 HTTP calls per tick,
 * which is nothing.
 */
export class ProxmoxPoller {
  private readonly cfg: AppConfig;
  private readonly client: ProxmoxClient;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  /** Previous netin/netout per target id, used to compute rate. */
  private readonly prevNet = new Map<
    string,
    { netin: number; netout: number; ts: number }
  >();

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    this.client = new ProxmoxClient(cfg.proxmox);
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.cfg.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
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

    const [nodes, vms] = await Promise.all([
      this.client.listNodes(),
      this.client.clusterVms(),
    ]);

    // --- Per-node work: host status, storages, and backup counts ---
    const hostTargets: TargetSummary[] = [];

    /** vmid → count (aggregated across all backup storages on all nodes). */
    const backupsByVmid = new Map<number, number>();

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      try {
        const [status, storages] = await Promise.all([
          this.client.nodeStatus(n.node),
          this.client.nodeStorages(n.node),
        ]);

        // --- Storage pools for the host card ---
        // Loosened filter: include any enabled storage, even if inactive or
        // with zero reported total (e.g. NFS backup shares). The UI renders
        // "—" for missing sizes.
        const pools: StoragePool[] = storages
          .filter(s => s.enabled !== 0)
          .map(s => {
            const used = s.used ?? null;
            const total = s.total && s.total > 0 ? s.total : null;
            const usedPct =
              used != null && total != null ? (used / total) * 100 : null;
            return {
              name: s.storage,
              type: s.type ?? null,
              used,
              total,
              usedPct,
            };
          })
          .sort((a, b) => {
            // Biggest-used first, but keep pools with null% at the bottom.
            const av = a.usedPct ?? -1;
            const bv = b.usedPct ?? -1;
            return bv - av;
          });

        // --- Backup counts: query every storage whose content includes 'backup' ---
        const backupStorages = storages.filter(
          s =>
            s.enabled !== 0 &&
            typeof s.content === 'string' &&
            s.content.split(',').includes('backup'),
        );

        for (const bs of backupStorages) {
          try {
            const entries = await this.client.nodeStorageBackups(
              n.node,
              bs.storage,
            );
            for (const e of entries) {
              if (e.vmid != null) {
                backupsByVmid.set(
                  e.vmid,
                  (backupsByVmid.get(e.vmid) ?? 0) + 1,
                );
              }
            }
          } catch (bsErr) {
            // Per-storage failure shouldn't bring down the whole poll;
            // just log and move on.
            // eslint-disable-next-line no-console
            console.warn(
              `[proxmox] backup scan failed for storage=${bs.storage} node=${n.node}:`,
              bsErr instanceof Error ? bsErr.message : String(bsErr),
            );
          }
        }

        // --- Host metrics ---
        const cpuPct = status.cpu * 100;
        const memPct = (status.memory.used / status.memory.total) * 100;
        const diskPct = (status.rootfs.used / status.rootfs.total) * 100;

        const id = i === 0 ? 'proxmox-host' : `proxmox-host-${n.node}`;
        hostTargets.push({
          id,
          name: `Proxmox · ${n.node}`,
          kind: 'proxmox-host',
          status: n.status === 'online' ? 'online' : 'offline',
          cpuPct,
          memPct,
          diskPct,
          uptimeSec: status.uptime,
          storages: pools,
          updatedAt: now,
        });

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
      const id = `${v.type}-${v.vmid}`;
      const name =
        v.name && v.name.length > 0
          ? v.name
          : `${v.type.toUpperCase()} ${v.vmid}`;

      const cpuPct = running && v.cpu != null ? v.cpu * 100 : null;
      const memPct =
        running && v.mem != null && v.maxmem
          ? (v.mem / v.maxmem) * 100
          : null;

      // --- Disk ---
      // For LXC, `disk` is real rootfs usage and is reliable.
      // For QEMU, `disk` is 0 when the guest agent isn't reporting, or equals
      // `maxdisk` (i.e. "allocated") in some setups — neither is actual usage.
      // Show null + a reason until guest-agent integration lands.
      let diskPct: number | null = null;
      let diskUnavailableReason: string | undefined;
      if (v.type === 'lxc') {
        if (v.disk != null && v.maxdisk && v.maxdisk > 0) {
          diskPct = (v.disk / v.maxdisk) * 100;
        }
      } else {
        // QEMU
        if (
          running &&
          v.disk != null &&
          v.maxdisk &&
          v.maxdisk > 0 &&
          v.disk > 0 &&
          v.disk < v.maxdisk
        ) {
          diskPct = (v.disk / v.maxdisk) * 100;
        } else if (running) {
          diskUnavailableReason = 'guest agent not reporting';
        }
      }

      // --- Network rates (bytes/sec) from delta since last poll ---
      let netInBps: number | null = null;
      let netOutBps: number | null = null;
      if (running && v.netin != null && v.netout != null) {
        const prev = this.prevNet.get(id);
        if (prev && now > prev.ts) {
          const elapsedSec = (now - prev.ts) / 1000;
          const dIn = v.netin - prev.netin;
          const dOut = v.netout - prev.netout;
          // Counter resets (VM restart) yield negative deltas — treat as null,
          // not a huge spike.
          netInBps = dIn >= 0 ? dIn / elapsedSec : null;
          netOutBps = dOut >= 0 ? dOut / elapsedSec : null;
        }
        this.prevNet.set(id, {
          netin: v.netin,
          netout: v.netout,
          ts: now,
        });
      } else {
        // VM stopped — forget prior samples so a fresh boot starts from null.
        this.prevNet.delete(id);
      }

      const backupCount = backupsByVmid.get(v.vmid) ?? 0;

      // Persist samples for 24h history.
      if (running) {
        if (cpuPct != null) recordSample(id, 'cpu_pct', cpuPct, now);
        if (memPct != null) recordSample(id, 'mem_pct', memPct, now);
        if (diskPct != null) recordSample(id, 'disk_pct', diskPct, now);
        if (netInBps != null) recordSample(id, 'net_in_bps', netInBps, now);
        if (netOutBps != null) recordSample(id, 'net_out_bps', netOutBps, now);
      }

      return {
        id,
        name,
        kind: v.type === 'lxc' ? 'container' : 'vm',
        status: running ? 'online' : 'offline',
        cpuPct,
        memPct,
        diskPct,
        diskUnavailableReason,
        uptimeSec: running ? (v.uptime ?? null) : null,
        netInBps,
        netOutBps,
        backupCount,
        updatedAt: now,
      };
    });

    replaceByPrefix('qemu-', vmTargets.filter(t => t.id.startsWith('qemu-')));
    replaceByPrefix('lxc-', vmTargets.filter(t => t.id.startsWith('lxc-')));
  }
}
