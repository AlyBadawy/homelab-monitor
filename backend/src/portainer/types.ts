/**
 * Minimal typings for the Portainer API responses we use.
 * Portainer returns many more fields — we only declare what we consume.
 *
 * All shapes are under /api/... on the Portainer base URL. The Docker-proxy
 * endpoints at /api/endpoints/:id/docker/... mirror the raw Docker Engine
 * API, so the Container / ContainerStats shapes are actually Docker's, not
 * Portainer-specific.
 */

/* --------------------- Portainer-specific: endpoints ---------------------- */

export interface PortainerEndpoint {
  Id: number;
  Name: string;
  /** 1 = up, 2 = down, 3 = provisioning (Portainer's EndpointStatus enum). */
  Status: number;
  /** 'docker' vs 'kubernetes' etc. — we only care about Docker endpoints. */
  Type: number;
  URL?: string;
}

/* ------------------ Docker-engine shapes (via Portainer) ------------------ */

export interface DockerContainer {
  Id: string;
  /** Docker returns names with a leading slash, e.g. "/nextcloud-app". */
  Names: string[];
  Image: string;
  ImageID?: string;
  /** 'running' | 'exited' | 'restarting' | 'paused' | 'dead' | 'created'. */
  State: string;
  /** Human string like "Up 3 hours". Not used for logic — only a fallback. */
  Status: string;
  /** Epoch seconds when the container was created. */
  Created: number;
  Labels?: Record<string, string>;
}

/**
 * Output of `/containers/{id}/stats?stream=false`. A single snapshot with
 * both the current window (`cpu_stats`) and the previous window
 * (`precpu_stats`) — we subtract to get a delta without holding a
 * persistent connection open.
 */
export interface DockerContainerStats {
  read: string;           // ISO timestamp
  preread?: string;
  cpu_stats: DockerCpuStats;
  precpu_stats?: DockerCpuStats;
  memory_stats: DockerMemoryStats;
  networks?: Record<string, DockerNetworkStats>;
  /** Not populated on every platform; we ignore it for now. */
  blkio_stats?: unknown;
}

export interface DockerCpuStats {
  cpu_usage: {
    total_usage: number;
    usage_in_kernelmode?: number;
    usage_in_usermode?: number;
    percpu_usage?: number[];
  };
  system_cpu_usage?: number;
  online_cpus?: number;
  throttling_data?: unknown;
}

export interface DockerMemoryStats {
  usage?: number;
  max_usage?: number;
  limit?: number;
  stats?: Record<string, number>;
}

export interface DockerNetworkStats {
  rx_bytes: number;
  tx_bytes: number;
  rx_packets?: number;
  tx_packets?: number;
}

/**
 * `/containers/{id}/json` — detailed container inspection. Provides
 * uptime-calculation material (StartedAt) that the list endpoint omits.
 */
export interface DockerContainerInspect {
  Id: string;
  Name: string;
  State: {
    Status: string;
    Running: boolean;
    StartedAt: string;   // ISO 8601
    FinishedAt?: string;
  };
  Config?: {
    Labels?: Record<string, string>;
    Image?: string;
  };
  /** Per-network attachment metadata. Keys are the docker network *names*. */
  NetworkSettings?: {
    Networks?: Record<string, { NetworkID?: string }>;
  };
}

/* ------------------ Docker resources (networks, volumes) ------------------ */

/**
 * Output of `/networks` on the Docker engine. We care about a handful of
 * fields — docker returns many more. Attached container count is NOT in the
 * list response; we compute it ourselves by walking containers' network
 * attachments.
 */
export interface DockerNetwork {
  Id: string;
  Name: string;
  Driver: string;
  Scope: string;          // 'local' | 'global' | 'swarm'
  Internal?: boolean;
  Attachable?: boolean;
  IPAM?: {
    Driver?: string;
    Config?: Array<{
      Subnet?: string;
      Gateway?: string;
    }>;
  };
  Labels?: Record<string, string> | null;
}

/**
 * Output of `/volumes`. The list-style endpoint does NOT include size data —
 * that requires `/system/df` (see below) which is materially heavier.
 */
export interface DockerVolume {
  Name: string;
  Driver: string;
  Mountpoint: string;
  Scope?: string;
  Labels?: Record<string, string> | null;
  CreatedAt?: string;      // ISO 8601
}

export interface DockerVolumesResponse {
  Volumes: DockerVolume[] | null;
  Warnings: string[] | null;
}

/**
 * Output of `/system/df`. Expensive on hosts with many volumes — we poll
 * this on a separate, slower interval. Size is -1 when the driver doesn't
 * report it.
 */
export interface DockerSystemDf {
  Volumes?: Array<{
    Name: string;
    Driver: string;
    UsageData?: {
      Size: number;       // bytes; -1 when unknown
      RefCount: number;   // how many containers reference it
    } | null;
  }>;
}
