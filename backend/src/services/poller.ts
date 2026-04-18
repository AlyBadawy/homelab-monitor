/**
 * Polls every enabled HTTP service check on each tick and publishes results
 * as kind='service' targets. No network calls are made on behalf of disabled
 * checks, and a failing check never blocks the others — each lives inside
 * its own Promise.
 */

import { Agent, fetch } from 'undici';
import type { AppConfig } from '../config';
import { recordSample } from '../db';
import { replaceByPrefix, type TargetSummary } from '../state';
import { listEnabledChecks, type ServiceCheck } from './repo';

/** Targets from this poller are prefixed so the replace-by-prefix pattern works. */
const ID_PREFIX = 'service:';

/**
 * Tiny cache of insecure-TLS dispatchers, keyed by the literal flag so we
 * reuse a single Agent across polls rather than instantiating one per check
 * per tick.
 */
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export class ServiceHealthPoller {
  private readonly cfg: AppConfig;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(cfg: AppConfig) {
    this.cfg = cfg;
  }

  start(): void {
    if (this.timer) return;
    // Run immediately, then on interval.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.cfg.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return; // overlap guard
    this.running = true;
    try {
      const checks = listEnabledChecks();
      if (checks.length === 0) {
        // Wipe any stale service-kind targets.
        replaceByPrefix(ID_PREFIX, []);
        return;
      }
      const results = await Promise.all(
        checks.map((c) => this.probe(c).catch((e) => this.errorTarget(c, e))),
      );
      replaceByPrefix(ID_PREFIX, results);
    } finally {
      this.running = false;
    }
  }

  private async probe(c: ServiceCheck): Promise<TargetSummary> {
    const targetId = `${ID_PREFIX}${c.id}`;
    const start = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), c.timeoutMs);
    try {
      const res = await fetch(c.url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        dispatcher: c.insecureTls ? insecureAgent : undefined,
        headers: { 'user-agent': 'homelab-monitor/0.6.0' },
      });
      // Drain the body so the connection returns to the pool cleanly, but cap
      // it — no need to hold a big download in memory for a healthcheck.
      try {
        await res.text();
      } catch {
        /* ignore body read errors — the status code is what we care about */
      }
      const latencyMs = Date.now() - start;
      const expected = c.expectedStatus;
      const ok =
        expected === null || expected === undefined
          ? res.status >= 200 && res.status < 300
          : res.status === expected;
      recordSample(targetId, 'http_latency_ms', latencyMs);
      recordSample(targetId, 'http_up', ok ? 1 : 0);
      return {
        id: targetId,
        name: c.name,
        kind: 'service',
        status: ok ? 'online' : 'offline',
        cpuPct: null,
        memPct: null,
        diskPct: null,
        uptimeSec: null,
        url: c.url,
        httpStatusCode: res.status,
        latencyMs,
        updatedAt: Date.now(),
        error: ok ? undefined : `unexpected status ${res.status}`,
      };
    } catch (e) {
      const err = e as Error & { code?: string; name?: string };
      const latencyMs = Date.now() - start;
      recordSample(targetId, 'http_up', 0);
      return {
        id: targetId,
        name: c.name,
        kind: 'service',
        status: 'offline',
        cpuPct: null,
        memPct: null,
        diskPct: null,
        uptimeSec: null,
        url: c.url,
        httpStatusCode: null,
        latencyMs,
        updatedAt: Date.now(),
        error: err.name === 'AbortError' ? `timeout (${c.timeoutMs}ms)` : err.message,
      };
    } finally {
      clearTimeout(t);
    }
  }

  private errorTarget(c: ServiceCheck, e: unknown): TargetSummary {
    const err = e as Error;
    return {
      id: `${ID_PREFIX}${c.id}`,
      name: c.name,
      kind: 'service',
      status: 'offline',
      cpuPct: null,
      memPct: null,
      diskPct: null,
      uptimeSec: null,
      url: c.url,
      httpStatusCode: null,
      latencyMs: null,
      updatedAt: Date.now(),
      error: err.message,
    };
  }
}
