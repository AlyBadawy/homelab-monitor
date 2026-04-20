import { Agent, fetch, type RequestInit } from 'undici';
import type { ImmichConfig } from '../config';
import type { ImmichJobsResponse, ImmichServerStatistics } from './types';

/**
 * Thin read-only client for Immich's admin endpoints.
 *
 * Auth: Immich API keys are minted under Account → API keys. Creating a key
 * requires picking a permission set; server-statistics + jobs need the
 * `admin` scope. We pass the raw key in the `x-api-key` header — no bearer
 * token wrapping.
 *
 * Only GETs. Both endpoints return plain JSON (no `ocs`-style envelope).
 */
export class ImmichClient {
  private readonly cfg: ImmichConfig;
  private readonly dispatcher?: Agent;

  constructor(cfg: ImmichConfig) {
    this.cfg = cfg;
    if (cfg.insecureTls) {
      this.dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }
  }

  /** GET /api/server/statistics — library totals + per-user breakdown. */
  async getStatistics(): Promise<ImmichServerStatistics> {
    return this.getJson<ImmichServerStatistics>('/api/server/statistics');
  }

  /** GET /api/jobs — per-queue BullMQ counts + queue status. */
  async getJobs(): Promise<ImmichJobsResponse> {
    return this.getJson<ImmichJobsResponse>('/api/jobs');
  }

  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.cfg.baseUrl}${path}`;
    const init: RequestInit = {
      method: 'GET',
      headers: {
        'x-api-key': this.cfg.apiKey,
        Accept: 'application/json',
      },
      dispatcher: this.dispatcher,
    };
    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // 401/403 almost always mean the key lacks admin scope — surface the
      // path so the banner in the UI tells the operator exactly which call
      // failed.
      throw new Error(
        `immich ${path} → ${res.status} ${res.statusText}${
          body ? `: ${body.slice(0, 200)}` : ''
        }`,
      );
    }
    return (await res.json()) as T;
  }
}
