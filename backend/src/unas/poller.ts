import type { AppConfig } from '../config';
import { recordSample } from '../db';
import {
  replaceByPrefix,
  setUnasError,
  type StoragePool,
  type TargetSummary,
  type UnasDrive,
} from '../state';
import { UnasClient, type ExecResult } from './client';
import {
  cpuPctFromSnapshots,
  parseDf,
  parseLsblkDisks,
  parseMeminfo,
  parseProcStat,
  parseSmartctl,
  parseThermalZones,
  parseUptime,
  type CpuSnapshot,
} from './parsers';

/**
 * Polls the UNAS over SSH on a fixed interval.
 *
 * Each tick:
 *   1. Run a "quick batch" in one SSH connection: uptime, meminfo, stat,
 *      thermal, df, lsblk. Plus a short sleep + second /proc/stat read so
 *      we can compute CPU% from a single connection.
 *   2. Run a "slow batch" in a second connection: one `smartctl -a` per
 *      whole disk discovered in the lsblk output. SMART reads are cheap
 *      but we keep them out of the quick batch so a wedge on one drive
 *      doesn't wedge the whole poll.
 *
 * Failures in the slow batch do NOT fail the whole poll — we just surface
 * whatever drives we got and record the error.
 */
export class UnasPoller {
  private readonly cfg: AppConfig;
  private readonly client: UnasClient;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    this.client = new UnasClient(cfg.unas);
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
      setUnasError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[unas] poll failed:', msg);
      setUnasError(msg);
      // Publish an offline placeholder so the UI shows SOMETHING for UNAS.
      replaceByPrefix('unas', [
        {
          id: 'unas',
          name: this.cfg.unas.name,
          kind: 'unas',
          status: 'offline',
          cpuPct: null,
          memPct: null,
          diskPct: null,
          uptimeSec: null,
          drives: [],
          storages: [],
          updatedAt: Date.now(),
          error: msg,
        },
      ]);
    } finally {
      this.running = false;
    }
  }

  private async pollOnce(): Promise<void> {
    const now = Date.now();

    // --- Quick batch ---
    // /proc/stat is read twice (sampled ~500ms apart) to derive CPU%.
    // The `sleep` keeps both reads in the same SSH session.
    const quickCmds = [
      'cat /proc/uptime',
      'cat /proc/meminfo',
      'head -1 /proc/stat',
      'sleep 0.5 && head -1 /proc/stat',
      // Thermal zones — stderr silenced so readers of non-existent zones don't noise up the buffer.
      'for z in /sys/class/thermal/thermal_zone*/temp; do [ -e "$z" ] && echo "$z:$(cat $z)"; done 2>/dev/null',
      // -PB1 gives byte-granular portable output. Exclude the usual noise mounts.
      "df -PB1 -x tmpfs -x devtmpfs -x overlay -x squashfs -x proc -x sysfs -x efivarfs 2>/dev/null",
      // List whole-disk block devices.
      'lsblk -dn -o NAME,TYPE,SIZE 2>/dev/null',
    ];
    const quick = await this.client.runBatch(quickCmds);
    const [uptimeR, memR, stat1R, stat2R, thermalR, dfR, lsblkR] = quick;

    // --- Parse ---
    const uptimeSec = parseUptime(uptimeR.stdout);
    const mem = parseMeminfo(memR.stdout);
    const cpu1 = parseProcStat(stat1R.stdout);
    const cpu2 = parseProcStat(stat2R.stdout);
    const cpuPct =
      cpu1 && cpu2 ? cpuPctFromSnapshots(cpu1, cpu2) : null;
    const cpuTempC = parseThermalZones(thermalR.stdout);
    const dfRows = parseDf(dfR.stdout);
    const disks = parseLsblkDisks(lsblkR.stdout);

    // --- df → StoragePool[] ---
    // Map every mount to a pool, except things that are clearly uninteresting
    // on UNAS (kernel/boot filesystems). We keep user-facing mounts.
    const pools: StoragePool[] = dfRows
      .filter(
        (r) =>
          !r.mount.startsWith('/sys') &&
          !r.mount.startsWith('/proc') &&
          !r.mount.startsWith('/dev') &&
          !r.mount.startsWith('/run') &&
          !r.mount.startsWith('/boot') &&
          r.totalBytes > 0,
      )
      .map((r) => ({
        name: r.mount === '/' ? 'root' : r.mount.replace(/^\//, ''),
        type: 'fs',
        used: r.usedBytes,
        total: r.totalBytes,
        usedPct:
          r.usedPct ??
          (r.totalBytes > 0 ? (r.usedBytes / r.totalBytes) * 100 : null),
        backup: null,
      }))
      .sort((a, b) => (b.usedPct ?? -1) - (a.usedPct ?? -1));

    // Pick the "rootfs %" for the card's disk pill — use / if present, else
    // the first pool. This keeps the header consistent with Proxmox hosts.
    const rootPool =
      pools.find((p) => p.name === 'root') ?? pools[0] ?? null;
    const diskPct = rootPool?.usedPct ?? null;

    // --- Slow batch: smartctl per drive ---
    let drives: UnasDrive[] = [];
    if (disks.length > 0) {
      try {
        const smartCmds = disks.map((d) => `smartctl -a ${d}`);
        const smartResults = await this.client.runBatch(smartCmds);
        drives = smartResults.map((r, i) => toUnasDrive(disks[i], r));
      } catch (smartErr) {
        const msg =
          smartErr instanceof Error ? smartErr.message : String(smartErr);
        // eslint-disable-next-line no-console
        console.warn('[unas] SMART batch failed:', msg);
        // Keep drive list with name only so the UI shows they exist.
        drives = disks.map((d) => ({
          device: d,
          model: null,
          serial: null,
          firmware: null,
          health: null,
          temperatureC: null,
          powerOnHours: null,
          capacityBytes: null,
          smartErrorBits: null,
        }));
      }
    }

    // --- Build target ---
    const target: TargetSummary = {
      id: 'unas',
      name: this.cfg.unas.name,
      kind: 'unas',
      status: 'online',
      cpuPct,
      memPct: mem.usedPct,
      diskPct,
      uptimeSec,
      cpuTempC,
      storages: pools,
      drives,
      updatedAt: now,
    };
    replaceByPrefix('unas', [target]);

    // --- Persist history ---
    if (cpuPct != null) recordSample('unas', 'cpu_pct', cpuPct, now);
    if (mem.usedPct != null) recordSample('unas', 'mem_pct', mem.usedPct, now);
    if (diskPct != null) recordSample('unas', 'rootfs_pct', diskPct, now);
    for (const p of pools) {
      if (p.usedPct != null) {
        recordSample('unas', `storage:${p.name}:used_pct`, p.usedPct, now);
      }
    }
    for (const d of drives) {
      if (d.temperatureC != null) {
        recordSample('unas', `drive:${slugifyDevice(d.device)}:temp_c`, d.temperatureC, now);
      }
    }
  }
}

function toUnasDrive(device: string, r: ExecResult): UnasDrive {
  const info = parseSmartctl(device, r.stdout, r.code);
  // smartctl exits with bitmask 0x00-0xFF; bit 3 (0x08) means a SMART
  // assertion failed. We surface the raw code so the UI can warn without
  // interpreting every bit.
  return {
    device: info.device,
    model: info.model,
    serial: info.serial,
    firmware: info.firmware,
    health: info.health,
    temperatureC: info.temperatureC,
    powerOnHours: info.powerOnHours,
    capacityBytes: info.capacityBytes,
    smartErrorBits: info.rc,
  };
}

function slugifyDevice(device: string): string {
  return device.replace(/^\/dev\//, '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

// Keep CpuSnapshot referenced so TS doesn't flag the import as unused when
// called sites in this file stop using the explicit type annotation.
export type { CpuSnapshot };
