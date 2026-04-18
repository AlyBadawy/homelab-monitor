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
  parseMdstat,
  parseMeminfo,
  parseProcStat,
  parseSmartctl,
  parseThermalZones,
  parseUptime,
  parseVolumeShares,
  type CpuSnapshot,
  type DfRow,
  type MdArray,
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
    //
    // Also pull /proc/mdstat (RAID level + health) and a directory listing
    // of /volume/*/ so we can discover user-created shares (homelab,
    // proxmox_backups, ...). The share listing is best-effort: if the UNAS
    // doesn't mount volumes at /volume/* (different firmware layouts), the
    // command returns empty and we just skip shares rather than erroring.
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
      // RAID level + state per md array.
      'cat /proc/mdstat 2>/dev/null',
      // Share discovery — -A hides '.' and '..' but keeps dotfiles; -p adds
      // trailing '/' to dirs so we can filter. Iterate every /volume/*/ and
      // print entries tagged with which volume UUID they live under.
      'for v in /volume/*/; do [ -d "$v" ] && echo "VOLUME:$v" && ls -1Ap "$v" 2>/dev/null; done',
    ];
    const quick = await this.client.runBatch(quickCmds);
    const [uptimeR, memR, stat1R, stat2R, thermalR, dfR, lsblkR, mdstatR, volLsR] = quick;

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
    const mdArrays = parseMdstat(mdstatR?.stdout ?? '');
    const volumeShares = parseVolumeLsOutput(volLsR?.stdout ?? '');

    // --- df → StoragePool[] ---
    // The raw df output on UNAS Pro is noisy in two ways:
    //   1. UniFi bind-mounts internal areas (e.g. .srv/.unifi-drive/.archives)
    //      back to the same underlying volume, so the same physical storage
    //      appears multiple times with identical used/total numbers.
    //   2. System filesystems (var/log, mnt/.rwfs, persistent) clutter the
    //      list but aren't what the user cares about when looking at "storage".
    // We strip both before mapping to StoragePool.
    const pools: StoragePool[] = buildUnasPools(dfRows, mdArrays, volumeShares);

    // Pick the headline "disk %" for the card's pill. We sorted volume pools
    // first in buildUnasPools, so pools[0] is the main storage volume — which
    // is what the user wants to see summarized at the top of the card.
    const diskPct = pools[0]?.usedPct ?? null;

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

/* ---------- UNAS pool reshaping: dedupe, filter, RAID, shares ---------- */

/**
 * Mounts that should never show as "storage pools" on the dashboard — they're
 * UniFi OS internals or kernel state that users don't care about.
 */
const SYSTEM_MOUNT_RE =
  /^\/(sys|proc|dev|run|boot|var\/log|mnt|persistent|tmp|etc)\b/;

/** Paths that are bind-mounts into a volume's hidden UniFi areas. */
const HIDDEN_BIND_RE = /\/\.(srv|unifi-drive|archives|snapshots)\b/;

/** Detect "/volume/<uuid-or-name>/" — the real user-visible pool mount. */
const VOLUME_MOUNT_RE = /^\/volume\/([^/]+)\/?$/;

interface VolumeShareIndex {
  /** Map of "/volume/<uuid>/" → share names discovered inside. */
  byMount: Map<string, string[]>;
}

/**
 * Parse the batched output of
 *   `for v in /volume/*\/; do [ -d "$v" ] && echo "VOLUME:$v" && ls -1Ap "$v"; done`
 * into a map keyed by the volume mount path. Used to attach per-pool share
 * names below.
 */
function parseVolumeLsOutput(stdout: string): VolumeShareIndex {
  const byMount = new Map<string, string[]>();
  let currentMount: string | null = null;
  const buffer: string[] = [];
  const flush = (): void => {
    if (currentMount !== null) {
      byMount.set(currentMount, parseVolumeShares(buffer.join('\n')));
    }
    buffer.length = 0;
  };
  for (const raw of stdout.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const header = line.match(/^VOLUME:(.+)$/);
    if (header) {
      flush();
      // Strip trailing slash so keys match what we derive from df below.
      currentMount = header[1].replace(/\/+$/, '');
      continue;
    }
    if (currentMount !== null) buffer.push(line);
  }
  flush();
  return { byMount };
}

/**
 * Pick the single RAID array to advertise on a pool. UNAS Pro's basic configs
 * are single-pool (1-2 drives in raid1 or a single linear), so matching by
 * name is unnecessary overhead — we just return the first active array.
 */
function primaryRaid(arrays: MdArray[]): MdArray | null {
  return arrays.find((a) => a.active && a.level) ?? arrays[0] ?? null;
}

function buildUnasPools(
  dfRows: DfRow[],
  mdArrays: MdArray[],
  shareIndex: VolumeShareIndex,
): StoragePool[] {
  // 1. Drop rows we never want to surface.
  const interesting = dfRows.filter(
    (r) =>
      r.totalBytes > 0 &&
      !SYSTEM_MOUNT_RE.test(r.mount) &&
      !HIDDEN_BIND_RE.test(r.mount),
  );

  // 2. Dedupe bind-mounts of the same underlying storage. When UniFi binds
  //    /volume/<uuid>/.srv/... back to the same filesystem, `df` reports an
  //    identical (totalBytes, usedBytes) pair — we keep the shortest mount
  //    path for each (total,used) key, which is always the canonical root.
  const byKey = new Map<string, DfRow>();
  for (const r of interesting) {
    const key = `${r.totalBytes}:${r.usedBytes}`;
    const existing = byKey.get(key);
    if (!existing || r.mount.length < existing.mount.length) {
      byKey.set(key, r);
    }
  }

  // 3. Assemble pools. The main UNAS volume (mount matches /volume/<uuid>/)
  //    gets a friendly name ("Volume 1", "Volume 2", ...) and carries the
  //    RAID level + user share list. Any residual mounts get their raw path.
  const raid = primaryRaid(mdArrays);
  const pools: StoragePool[] = [];
  let volumeIndex = 1;
  let raidAttached = false;
  for (const r of Array.from(byKey.values()).sort((a, b) =>
    a.mount.localeCompare(b.mount),
  )) {
    const isVolume = VOLUME_MOUNT_RE.test(r.mount);
    const displayName = isVolume ? `Volume ${volumeIndex}` : r.mount.replace(/^\//, '');

    // For volumes, look up the share list under this mount. The share index
    // keys on the mount path (with trailing slash stripped).
    const shares = isVolume ? shareIndex.byMount.get(r.mount) ?? [] : null;

    // Attach RAID info to the first volume pool only. With only one mdstat
    // array on UNAS Pro (typical single-pool config), this is unambiguous;
    // multi-pool setups would need device-to-mount mapping we don't have.
    const attachRaid = isVolume && !raidAttached;

    pools.push({
      name: displayName,
      type: isVolume ? 'volume' : 'fs',
      used: r.usedBytes,
      total: r.totalBytes,
      usedPct:
        r.usedPct ??
        (r.totalBytes > 0 ? (r.usedBytes / r.totalBytes) * 100 : null),
      raidLevel: attachRaid ? raid?.level ?? null : null,
      raidDevices: attachRaid ? raid?.deviceCount ?? null : null,
      raidInSync: attachRaid ? raid?.devicesInSync ?? null : null,
      shares: shares && shares.length > 0 ? shares : null,
      backup: null,
    });

    if (isVolume) {
      volumeIndex += 1;
      if (attachRaid) raidAttached = true;
    }
  }

  // Volumes first, then system/misc mounts; within each group, highest
  // utilization first.
  return pools.sort((a, b) => {
    const aVol = a.type === 'volume' ? 0 : 1;
    const bVol = b.type === 'volume' ? 0 : 1;
    if (aVol !== bVol) return aVol - bVol;
    return (b.usedPct ?? -1) - (a.usedPct ?? -1);
  });
}

// Keep CpuSnapshot referenced so TS doesn't flag the import as unused when
// called sites in this file stop using the explicit type annotation.
export type { CpuSnapshot };
