import { Agent, fetch, type RequestInit } from 'undici';
import type { PortainerConfig } from '../config';
import type {
  DockerContainer,
  DockerContainerInspect,
  DockerContainerStats,
  PortainerEndpoint,
} from './types';

/**
 * Thin read-only client for the Portainer API.
 *
 * Auth: Portainer issues per-user API keys (UI → User settings → Access
 * tokens). We pass it in the `X-API-Key` header. The key inherits that
 * user's Docker permissions, so create a read-only user for this.
 *
 * Only GETs — this dashboard never mutates anything.
 */
export class PortainerClient {
  private readonly cfg: PortainerConfig;
  private readonly dispatcher?: Agent;

  constructor(cfg: PortainerConfig) {
    this.cfg = cfg;
    if (cfg.insecureTls) {
      // Scoped to this client — does not affect other fetch() callers.
      this.dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.cfg.baseUrl}${path}`;
    const init: RequestInit = {
      method: 'GET',
      headers: {
        'X-API-Key': this.cfg.apiKey,
        Accept: 'application/json',
      },
      dispatcher: this.dispatcher,
    };

    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `portainer ${path} → ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`,
      );
    }
    return (await res.json()) as T;
  }

  /** List all endpoints (Docker/K8s environments) this Portainer manages. */
  listEndpoints(): Promise<PortainerEndpoint[]> {
    return this.get<PortainerEndpoint[]>('/api/endpoints');
  }

  /**
   * List containers on a Portainer endpoint. `all=1` so stopped containers
   * are included — we want to show "stopped" state rather than silently
   * dropping them from the dashboard.
   */
  listContainers(endpointId: number): Promise<DockerContainer[]> {
    return this.get<DockerContainer[]>(
      `/api/endpoints/${endpointId}/docker/containers/json?all=1`,
    );
  }

  /**
   * Single-shot stats snapshot. `stream=false` returns one JSON object with
   * both `cpu_stats` and `precpu_stats` populated, so CPU % can be
   * calculated from one HTTP call without holding a stream open.
   */
  containerStats(
    endpointId: number,
    containerId: string,
  ): Promise<DockerContainerStats> {
    return this.get<DockerContainerStats>(
      `/api/endpoints/${endpointId}/docker/containers/${containerId}/stats?stream=false`,
    );
  }

  /**
   * Full container inspection — needed for StartedAt (uptime) because the
   * `containers/json` list endpoint only returns Created time, not started.
   */
  inspectContainer(
    endpointId: number,
    containerId: string,
  ): Promise<DockerContainerInspect> {
    return this.get<DockerContainerInspect>(
      `/api/endpoints/${endpointId}/docker/containers/${containerId}/json`,
    );
  }
}
