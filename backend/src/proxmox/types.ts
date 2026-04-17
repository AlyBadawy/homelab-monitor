/**
 * Minimal shapes for the Proxmox API responses we care about.
 * Proxmox actually returns many more fields — we only declare what we use.
 */

export interface PveNodeSummary {
  node: string;
  status: string;      // 'online' | 'offline' | 'unknown'
  cpu?: number;        // 0..1
  maxcpu?: number;
  mem?: number;        // bytes
  maxmem?: number;     // bytes
  uptime?: number;     // seconds
  level?: string;
}

export interface PveNodeStatus {
  cpu: number;         // 0..1
  cpuinfo?: { cpus?: number };
  memory: { used: number; total: number };
  rootfs: { used: number; total: number };
  uptime: number;
  loadavg?: string[];
}

export interface PveClusterResourceVm {
  type: 'qemu' | 'lxc';
  vmid: number;
  node: string;
  name?: string;
  status: string;      // 'running' | 'stopped' | ...
  cpu?: number;        // 0..1
  maxcpu?: number;
  mem?: number;        // bytes
  maxmem?: number;     // bytes
  disk?: number;       // bytes (current usage, may be 0 if not reported)
  maxdisk?: number;    // bytes
  uptime?: number;     // seconds
  tags?: string;
}

export interface PveStorage {
  storage: string;     // name, e.g. 'local', 'local-lvm', 'zfs-data'
  type?: string;       // 'dir' | 'lvmthin' | 'zfspool' | ...
  active?: number;     // 1 when mounted
  enabled?: number;
  used?: number;       // bytes
  total?: number;      // bytes
  avail?: number;      // bytes
  content?: string;
  shared?: number;
}

export interface PveApiEnvelope<T> {
  data: T;
}
