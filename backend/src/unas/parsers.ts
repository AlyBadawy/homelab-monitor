/**
 * Parsers for the text outputs we pull off the UNAS over SSH.
 * Each parser is defensive: missing fields → null, unexpected format
 * → best-effort extraction. We never throw from a parser; the caller
 * decides whether partial data is still useful.
 */

/* ----------------------------- /proc/uptime ----------------------------- */

/** Returns seconds or null. */
export function parseUptime(stdout: string): number | null {
  const m = stdout.trim().match(/^(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/* ---------------------------- /proc/meminfo ----------------------------- */

export interface MemInfo {
  totalBytes: number | null;
  availBytes: number | null;
  usedPct: number | null;
}

/**
 * /proc/meminfo lines look like:
 *   MemTotal:       16315948 kB
 *   MemAvailable:   12345678 kB
 * Values are in KiB.
 */
export function parseMeminfo(stdout: string): MemInfo {
  const find = (key: string): number | null => {
    const re = new RegExp(`^${key}:\\s+(\\d+)\\s*kB`, 'mi');
    const m = stdout.match(re);
    return m ? Number(m[1]) * 1024 : null;
  };
  const totalBytes = find('MemTotal');
  const availBytes = find('MemAvailable');
  const usedPct =
    totalBytes != null && availBytes != null && totalBytes > 0
      ? ((totalBytes - availBytes) / totalBytes) * 100
      : null;
  return { totalBytes, availBytes, usedPct };
}

/* ----------------------------- /proc/stat ------------------------------- */

export interface CpuSnapshot {
  idle: number;
  total: number;
}

/**
 * Aggregate CPU snapshot from `cat /proc/stat`. Use two snapshots taken
 * apart in time to compute utilization (see `cpuPctFromSnapshots`).
 */
export function parseProcStat(stdout: string): CpuSnapshot | null {
  const firstLine = stdout.split('\n', 1)[0];
  if (!firstLine?.startsWith('cpu ')) return null;
  const parts = firstLine.trim().split(/\s+/).slice(1).map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  // [user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice]
  const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

export function cpuPctFromSnapshots(a: CpuSnapshot, b: CpuSnapshot): number | null {
  const idleDelta = b.idle - a.idle;
  const totalDelta = b.total - a.total;
  if (totalDelta <= 0) return null;
  const pct = 100 * (1 - idleDelta / totalDelta);
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, pct));
}

/* ------------------------------ `df -PB1` ------------------------------- */

export interface DfRow {
  filesystem: string;
  totalBytes: number;
  usedBytes: number;
  availBytes: number;
  usedPct: number | null;
  mount: string;
}

/**
 * POSIX `df -PB1` output (-P forces portable, single-row format; -B1 = bytes).
 * Columns: Filesystem 1-blocks Used Available Capacity Mounted on
 */
export function parseDf(stdout: string): DfRow[] {
  const lines = stdout.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const rows: DfRow[] = [];
  for (const line of lines) {
    if (/^Filesystem/i.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    // Capacity column has a trailing '%'; "Mounted on" may contain spaces,
    // so rejoin everything after column 4 for the mount point.
    const [fs, total, used, avail, capRaw, ...mountParts] = parts;
    const totalBytes = Number(total);
    const usedBytes = Number(used);
    const availBytes = Number(avail);
    if (!Number.isFinite(totalBytes) || !Number.isFinite(usedBytes)) continue;
    const capMatch = capRaw?.match(/^(\d+)%$/);
    const usedPct = capMatch ? Number(capMatch[1]) : null;
    rows.push({
      filesystem: fs,
      totalBytes,
      usedBytes,
      availBytes,
      usedPct,
      mount: mountParts.join(' '),
    });
  }
  return rows;
}

/* ------------------------- `lsblk -dn -o NAME,TYPE,SIZE` ---------------- */

/** Whole-disk block devices (excludes partitions and loop devices). */
export function parseLsblkDisks(stdout: string): string[] {
  const names: string[] = [];
  for (const line of stdout.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const [name, type] = parts;
    if (type !== 'disk') continue;
    if (!name || name.startsWith('loop')) continue;
    names.push(`/dev/${name}`);
  }
  return names;
}

/* --------------------------- `smartctl -a` ------------------------------ */

export interface SmartInfo {
  device: string;
  model: string | null;
  serial: string | null;
  firmware: string | null;
  /** Overall SMART self-assessment: 'PASSED' | 'FAILED' | null if unavailable. */
  health: 'PASSED' | 'FAILED' | null;
  temperatureC: number | null;
  powerOnHours: number | null;
  /** Capacity reported by smartctl, in bytes. */
  capacityBytes: number | null;
  /** Raw exit code so we can surface "not supported" vs "failed". */
  rc: number | null;
}

const KV = (key: string, text: string): string | null => {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'mi');
  const m = text.match(re);
  return m ? m[1].trim() : null;
};

/**
 * Parse `smartctl -a <dev>` output. Handles both ATA and NVMe layouts.
 * NVMe-specific fields (temperature, power-on hours) appear under the
 * "SMART/Health Information (NVMe Log 0x02)" section; ATA drives use
 * numbered attributes (194 = Temperature, 9 = Power_On_Hours).
 */
export function parseSmartctl(device: string, stdout: string, rc: number | null): SmartInfo {
  const info: SmartInfo = {
    device,
    model:
      KV('Device Model', stdout) ||
      KV('Model Number', stdout) ||
      KV('Product', stdout),
    serial: KV('Serial Number', stdout) || KV('Serial number', stdout),
    firmware:
      KV('Firmware Version', stdout) ||
      KV('Revision', stdout) ||
      null,
    health: null,
    temperatureC: null,
    powerOnHours: null,
    capacityBytes: null,
    rc,
  };

  // Overall health
  const health = stdout.match(
    /SMART overall-health self-assessment test result:\s*(PASSED|FAILED)/i,
  );
  if (health) {
    info.health = health[1].toUpperCase() === 'PASSED' ? 'PASSED' : 'FAILED';
  }

  // Capacity (User Capacity or Total NVM Capacity or Namespace Size)
  const cap =
    stdout.match(/User Capacity:\s*([\d,]+)\s*bytes/i) ||
    stdout.match(/Total NVM Capacity:\s*([\d,]+)\s*bytes/i) ||
    stdout.match(/Namespace 1 Size\/Capacity:\s*([\d,]+)\s*bytes/i);
  if (cap) {
    info.capacityBytes = Number(cap[1].replace(/,/g, ''));
  }

  // Temperature — prefer NVMe "Temperature:" line, fall back to ATA attr 194.
  const nvmeTemp = stdout.match(/^Temperature:\s*(\d+)\s*Celsius/mi);
  if (nvmeTemp) {
    info.temperatureC = Number(nvmeTemp[1]);
  } else {
    const ataTemp = stdout.match(/^\s*194\s+Temperature_Celsius.*?\s(\d+)(?:\s|$)/m);
    if (ataTemp) info.temperatureC = Number(ataTemp[1]);
    else {
      const altTemp = stdout.match(/^\s*190\s+Airflow_Temperature_Cel.*?\s(\d+)(?:\s|$)/m);
      if (altTemp) info.temperatureC = Number(altTemp[1]);
    }
  }

  // Power On Hours — NVMe reports directly, ATA uses attribute 9.
  const nvmePoh = stdout.match(/^Power On Hours:\s*([\d,]+)/mi);
  if (nvmePoh) {
    info.powerOnHours = Number(nvmePoh[1].replace(/,/g, ''));
  } else {
    // ATA attr 9 line; raw value is the last column. Grab the first number
    // in the "RAW_VALUE" tail (handles "1234" and "1234 (Avg: 1200)" forms).
    const ataPoh = stdout.match(/^\s*9\s+Power_On_Hours.*?(\d+)(?:\s|\(|$)/m);
    if (ataPoh) info.powerOnHours = Number(ataPoh[1]);
  }

  return info;
}

/* ----------------- /sys/class/thermal/thermal_zone<N>/temp ---------------- */

/**
 * Parse a blob like:
 *   /sys/class/thermal/thermal_zone0/temp:42000
 *   /sys/class/thermal/thermal_zone1/temp:39500
 * (Values in millidegrees Celsius.)  Returns the max across all zones,
 * which is the best single "CPU temp" approximation we can do without
 * knowing the UNAS firmware's zone naming.
 */
export function parseThermalZones(stdout: string): number | null {
  const values: number[] = [];
  for (const line of stdout.split('\n')) {
    const m = line.match(/:\s*(-?\d+)\s*$/);
    if (!m) continue;
    const milli = Number(m[1]);
    if (!Number.isFinite(milli)) continue;
    const celsius = milli / 1000;
    // Sanity check: reject clearly bogus values (some zones report 0 or
    // negative when sensors aren't populated).
    if (celsius > 0 && celsius < 150) values.push(celsius);
  }
  if (values.length === 0) return null;
  return Math.max(...values);
}
