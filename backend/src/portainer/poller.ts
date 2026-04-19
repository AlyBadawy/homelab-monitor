import type { AppConfig } from '../config';
import { recordSample } from '../db';
import {
  replaceByPrefix,
  setPortainerError,
  type TargetSummary,
} from '../state';
import { PortainerClient } from './client';
import type {
  DockerContainer,
  DockerContainerInspect,
  DockerContainerStats,
} from './types';

/**
 * Polls Portainer on a fixed interval and updates both the in-memory
 * snapshot and the SQLite samples table.
 *
 * Per tick:
 *   1. listEndpoints() — which Docker hosts does this Portainer manage?
 *   2. For each Docker endpoint (Type === 1 or 2):
 *        a. listContainers(all=1)          — single call for the list + state
 *        b. stats(id, stream=false)        — parallel, per running container
 *        c. inspect(id)                    — parallel, per running container,
 *                                            needed for StartedAt → uptime
 *
 * Network rates are computed the same way as the Proxmox poller: keep the
 * previous (rx, tx, ts) per container id, diff against the next tick.
 * Counter resets (container restart) produce a negative delta → treat as
 * null rather than a huge spike.
 */
export class PortainerPoller {
  private readonly cfg: AppConfig;
  private readonly client: PortainerClient;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  /** Previous cumulative network counters per container id. */
  private readonly prevNet = new Map<
    string,
    { rx: number; tx: number; ts: number }
  >();

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
    this.client = new PortainerClient(cfg.portainer);
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(
      () => void this.tick(),
      this.cfg.portainer.pollIntervalMs,
    );
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
      setPortainerError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[portainer] poll failed:', msg);
      setPortainerError(msg);
    } finally {
      this.running = false;
    }
  }

  private async pollOnce(): Promise<void> {
    const now = Date.now();
    const endpoints = await this.client.listEndpoints();

    // Portainer's Type enum: 1 = Docker (standalone), 2 = Docker agent,
    // 3 = Azure, 4 = Docker Swarm (edge), 5 = Kubernetes local, 6 = Kube agent,
    // 7 = Kube edge agent. We only handle the Docker variants.
    const dockerEndpoints = endpoints.filter(
      (e) => e.Type === 1 || e.Type === 2 || e.Type === 4,
    );

    const allTargets: TargetSummary[] = [];

    // Track which ids we saw this tick so we can prune stale prevNet entries
    // (containers that were deleted between polls).
    const seenIds = new Set<string>();

    for (const ep of dockerEndpoints) {
      const containers = await this.client.listContainers(ep.Id);

      // Pull stats + inspect in parallel for all running containers on this
      // endpoint. For a stopped container we skip both calls — stats would
      // return mostly-empty data and Docker throws 409 on some versions.
      const perContainer = await Promise.all(
        containers.map(async (c) => {
          if (c.State !== 'running') {
            return { c, stats: null, inspect: null };
          }
          const [stats, inspect] = await Promise.all([
            this.client.containerStats(ep.Id, c.Id).catch(() => null),
            this.client.inspectContainer(ep.Id, c.Id).catch(() => null),
          ]);
          return { c, stats, inspect };
        }),
      );

      for (const { c, stats, inspect } of perContainer) {
        const id = `docker-${ep.Id}-${c.Id.slice(0, 12)}`;
        seenIds.add(id);

        // Names from Docker come prefixed with '/'; strip for display.
        const name = (c.Names?.[0] ?? c.Id.slice(0, 12)).replace(/^\//, '');
        const running = c.State === 'running';

        const cpuPct = running && stats ? calcCpuPct(stats) : null;
        const memPct = running && stats ? calcMemPct(stats) : null;
        const { netInBps, netOutBps } = this.calcNetRate(id, stats, running, now);

        const uptimeSec = running && inspect
          ? calcUptimeSec(inspect, now)
          : null;

        // Persist history for the 24h sparklines.
        if (running) {
          if (cpuPct != null) recordSample(id, 'cpu_pct', cpuPct, now);
          if (memPct != null) recordSample(id, 'mem_pct', memPct, now);
          if (netInBps != null) recordSample(id, 'net_in_bps', netInBps, now);
          if (netOutBps != null) recordSample(id, 'net_out_bps', netOutBps, now);
        }

        allTargets.push({
          id,
          name,
          kind: 'docker-container',
          status: running ? 'online' : 'offline',
          cpuPct,
          memPct,
          // Docker doesn't surface rootfs usage via the stats API. Leaving
          // diskPct null keeps the MetricBar hidden; we can add a docker
          // diff-based estimate later if users ask for it.
          diskPct: null,
          uptimeSec,
          netInBps,
          netOutBps,
          updatedAt: now,
        });
      }
    }

    // Prune prevNet entries for containers that are no longer reported.
    for (const id of Array.from(this.prevNet.keys())) {
      if (!seenIds.has(id)) this.prevNet.delete(id);
    }

    // One replaceByPrefix('docker-', ...) is enough because every docker id
    // starts with that prefix regardless of endpoint.
    replaceByPrefix('docker-', allTargets);
  }

  /**
   * Compute per-second network rate from cumulative counters. Same pattern
   * as ProxmoxPoller.prevNet: first tick is null (no prior sample), then
   * diff. Counter resets (container restart between polls) come back
   * negative → null rather than a spike.
   */
  private calcNetRate(
    id: string,
    stats: DockerContainerStats | null,
    running: boolean,
    now: number,
  ): { netInBps: number | null; netOutBps: number | null } {
    if (!running || !stats || !stats.networks) {
      this.prevNet.delete(id);
      return { netInBps: null, netOutBps: null };
    }
    let rx = 0;
    let tx = 0;
    for (const iface of Object.values(stats.networks)) {
      rx += iface.rx_bytes ?? 0;
      tx += iface.tx_bytes ?? 0;
    }
    const prev = this.prevNet.get(id);
    this.prevNet.set(id, { rx, tx, ts: now });
    if (!prev || now <= prev.ts) {
      return { netInBps: null, netOutBps: null };
    }
    const elapsedSec = (now - prev.ts) / 1000;
    const dIn = rx - prev.rx;
    const dOut = tx - prev.tx;
    return {
      netInBps: dIn >= 0 ? dIn / elapsedSec : null,
      netOutBps: dOut >= 0 ? dOut / elapsedSec : null,
    };
  }
}

/* ---------------- helpers ---------------- */

/**
 * Docker's CPU% formula (straight from `docker stats` source):
 *   cpuDelta    = cpu_stats.total_usage     - precpu_stats.total_usage
 *   systemDelta = cpu_stats.system_cpu_usage - precpu_stats.system_cpu_usage
 *   onlineCpus  = cpu_stats.online_cpus  (or  len(percpu_usage))
 *   pct = (cpuDelta / systemDelta) * onlineCpus * 100
 *
 * Returns null when we don't have both windows populated (first-ever tick
 * for a freshly-started container — Docker sometimes zeroes precpu_stats).
 */
function calcCpuPct(stats: DockerContainerStats): number | null {
  const cpu = stats.cpu_stats;
  const pre = stats.precpu_stats;
  if (!cpu || !pre) return null;
  const systemCurr = cpu.system_cpu_usage;
  const systemPrev = pre.system_cpu_usage;
  if (systemCurr == null || systemPrev == null) return null;

  const cpuDelta = cpu.cpu_usage.total_usage - (pre.cpu_usage?.total_usage ?? 0);
  const sysDelta = systemCurr - systemPrev;
  if (sysDelta <= 0 || cpuDelta < 0) return null;

  const onlineCpus =
    cpu.online_cpus ??
    cpu.cpu_usage.percpu_usage?.length ??
    1;
  const pct = (cpuDelta / sysDelta) * onlineCpus * 100;
  // Sanity clamp — CPU% can momentarily exceed 100 * cores during throttling
  // transitions, but anything above 100*cores+slop is a parse artifact.
  if (!Number.isFinite(pct) || pct < 0) return null;
  return Math.min(pct, onlineCpus * 100);
}

/**
 * Memory %: (usage - cache) / limit * 100
 *
 * Docker's own `docker stats` CLI subtracts cache from usage because Linux
 * keeps buffer/cache as "used" memory that's actually reclaimable, which
 * inflates the headline number. Cache key is 'cache' on cgroup v1 and
 * 'inactive_file' on cgroup v2.
 */
function calcMemPct(stats: DockerContainerStats): number | null {
  const mem = stats.memory_stats;
  if (!mem || !mem.usage || !mem.limit || mem.limit === 0) return null;
  const cache =
    mem.stats?.cache ??
    mem.stats?.inactive_file ??
    mem.stats?.total_inactive_file ??
    0;
  const used = Math.max(0, mem.usage - cache);
  const pct = (used / mem.limit) * 100;
  if (!Number.isFinite(pct) || pct < 0) return null;
  return Math.min(pct, 100);
}

/** Parse ISO StartedAt → seconds ago. Returns null on "0001-01-01..." sentinel. */
function calcUptimeSec(inspect: DockerContainerInspect, now: number): number | null {
  const started = inspect.State?.StartedAt;
  if (!started) return null;
  const ms = Date.parse(started);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const secs = Math.round((now - ms) / 1000);
  return secs >= 0 ? secs : null;
}
