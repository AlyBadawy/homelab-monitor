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
  disk?: number;       // bytes (for LXC: rootfs used; for QEMU: usually 0 unless
                       // guest-agent provides it via a different endpoint)
  maxdisk?: number;    // bytes
  uptime?: number;     // seconds
  netin?: number;      // cumulative bytes received since VM boot
  netout?: number;     // cumulative bytes sent since VM boot
  tags?: string;
}

/** One entry in /nodes/{node}/storage/{storage}/content?content=backup */
export interface PveBackupEntry {
  volid: string;        // e.g. 'proxmox-backup:backup/vm/101/2024-01-01T00:00:00Z'
  vmid?: number;        // when attributable to a VM
  ctime?: number;       // epoch seconds
  size?: number;        // bytes
  format?: string;      // 'vma.zst', 'pbs-vm', ...
  content: string;      // 'backup'
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
