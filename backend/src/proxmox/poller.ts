import type { AppConfig } from '../config';
import { recordSample } from '../db';
import {
  replaceByPrefix,
  setBackupScan,
  setProxmoxError,
  type BackupScanDiagnostic,
  type StoragePool,
  type TargetSummary,
} from '../state';
import { ProxmoxClient } from './client';
import type { PveBackupEntry } from './types';

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

    /** Per-storage diagnostics so the UI can surface scan results. */
    const scanDiag: BackupScanDiagnostic[] = [];

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

        // --- Backup counts: query any storage that could plausibly hold backups.
        // A storage is considered a "backup target" if EITHER:
        //   (a) its content list includes 'backup' (classic dir/nfs/cifs with vzdumps), or
        //   (b) its type is 'pbs' (Proxmox Backup Server — always backups-only).
        // The previous filter only honored (a), which missed PBS datastores and
        // any pool whose `content` field comes back blank/undefined from PVE.
        // Explicitly-disabled storages (enabled === 0) are still skipped.
        for (const s of storages) {
          const contentTokens =
            typeof s.content === 'string'
              ? s.content.split(',').map(x => x.trim()).filter(Boolean)
              : [];
          const hasBackupContent = contentTokens.includes('backup');
          const isPbs = s.type === 'pbs';

          if (s.enabled === 0) {
            scanDiag.push({
              node: n.node,
              storage: s.storage,
              type: s.type ?? null,
              reason: 'skipped-disabled',
              status: 'skipped',
            });
            continue;
          }

          if (!hasBackupContent && !isPbs) {
            // Not a backup target — don't probe and don't spam the diag list.
            // We still emit a single row per such storage so the UI can
            // explain *why* a pool was ignored if the user is wondering.
            scanDiag.push({
              node: n.node,
              storage: s.storage,
              type: s.type ?? null,
              reason: 'skipped-no-backup-content',
              status: 'skipped',
            });
            continue;
          }

          const reason: BackupScanDiagnostic['reason'] = hasBackupContent
            ? 'content-backup'
            : 'pbs-type';

          try {
            const allEntries = await this.client.nodeStorageContent(
              n.node,
              s.storage,
            );
            // Client-side filter — some NFS/dir backends return the server-side
            // `content=backup` filter as empty even when backups exist. Also
            // accept any entry whose volid matches a known backup pattern,
            // since a few storage types don't populate `content` per entry.
            const backups = allEntries.filter(
              (e) =>
                e.content === 'backup' ||
                /vzdump-(?:qemu|lxc)-\d+-/.test(e.volid) ||
                /:backup\/(?:vm|ct)\/\d+\//.test(e.volid),
            );
            const vmidsSeen = new Set<number>();
            for (const e of backups) {
              const vmid = extractVmid(e);
              if (vmid != null) {
                vmidsSeen.add(vmid);
                backupsByVmid.set(
                  vmid,
                  (backupsByVmid.get(vmid) ?? 0) + 1,
                );
              }
            }

            // Build a hint when the numbers look suspicious, so the UI can
            // nudge the user toward the right fix without digging through logs.
            let hint: string | undefined;
            if (allEntries.length === 0) {
              hint =
                'storage returned no content at all — check that the API token has Datastore.Audit on this storage (Datacenter → Permissions), or that the mount is actually populated';
            } else if (backups.length === 0) {
              hint = `storage has ${allEntries.length} entries but none of type=backup — the data on this share is probably iso/images/templates, not vzdump archives`;
            } else if (vmidsSeen.size === 0) {
              hint =
                'backup entries found but no vmid could be extracted from any — please report a sample volid so we can extend the parser';
            }

            scanDiag.push({
              node: n.node,
              storage: s.storage,
              type: s.type ?? null,
              reason,
              status: 'ok',
              rawEntryCount: allEntries.length,
              entryCount: backups.length,
              vmidsSeen: Array.from(vmidsSeen).sort((a, b) => a - b),
              hint,
            });
          } catch (bsErr) {
            const msg =
              bsErr instanceof Error ? bsErr.message : String(bsErr);
            // eslint-disable-next-line no-console
            console.warn(
              `[proxmox] backup scan failed for storage=${s.storage} node=${n.node}:`,
              msg,
            );
            scanDiag.push({
              node: n.node,
              storage: s.storage,
              type: s.type ?? null,
              reason,
              status: 'error',
              error: msg,
            });
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

    // Publish backup-scan diagnostics so the dashboard can show what was scanned.
    setBackupScan(scanDiag);
  }
}

/**
 * Best-effort vmid extraction from a PVE backup entry.
 * Proxmox usually sets `vmid` on the entry, but some storage backends
 * (older PBS, certain dir/nfs configurations) only return `volid` — the
 * VM id is embedded in the path, e.g.:
 *   local:backup/vzdump-qemu-101-2024_01_01-00_00_00.vma.zst
 *   pbs-store:backup/vm/101/2024-01-01T00:00:00Z
 *   local:backup/vzdump-lxc-200-...
 * This covers both formats.
 */
function extractVmid(e: PveBackupEntry): number | null {
  if (typeof e.vmid === 'number' && Number.isFinite(e.vmid)) return e.vmid;
  if (typeof e.volid !== 'string') return null;
  // PBS: ...:backup/{ct|vm}/{vmid}/...
  const pbs = e.volid.match(/:backup\/(?:vm|ct)\/(\d+)\//);
  if (pbs) return Number(pbs[1]);
  // vzdump: ...vzdump-(qemu|lxc)-{vmid}-...
  const vz = e.volid.match(/vzdump-(?:qemu|lxc)-(\d+)-/);
  if (vz) return Number(vz[1]);
  return null;
}
