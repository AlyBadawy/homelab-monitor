import { Agent, fetch, type RequestInit } from 'undici';
import type { NextcloudConfig } from '../config';
import type { NcOcsEnvelope, NcServerInfoData } from './types';

/**
 * Thin read-only client for Nextcloud's serverinfo API.
 *
 * Auth: NC exposes a dedicated monitoring token (Settings → Administration
 * → Monitoring) that is purpose-built for this scenario. No user login, no
 * app password — the token goes in the `NC-Token` header. We also pass
 * `OCS-APIRequest: true` which NC requires for any ocs/v2.php call.
 *
 * Only GETs, single endpoint.
 */
export class NextcloudClient {
  private readonly cfg: NextcloudConfig;
  private readonly dispatcher?: Agent;

  constructor(cfg: NextcloudConfig) {
    this.cfg = cfg;
    if (cfg.insecureTls) {
      // Scoped to this client — does not affect other fetch() callers.
      this.dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }
  }

  /**
   * Fetch a server-info snapshot. Throws with a useful message on non-2xx
   * or on an ocs meta.status of 'failure'. The caller catches + records.
   */
  async getServerInfo(): Promise<NcServerInfoData> {
    const url =
      `${this.cfg.baseUrl}/ocs/v2.php/apps/serverinfo/api/v1/info?format=json`;
    const init: RequestInit = {
      method: 'GET',
      headers: {
        'NC-Token': this.cfg.token,
        // Required by NC's ocs endpoints; without this it returns HTML.
        'OCS-APIRequest': 'true',
        Accept: 'application/json',
      },
      dispatcher: this.dispatcher,
    };

    const res = await fetch(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `nextcloud serverinfo → ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`,
      );
    }

    const parsed = (await res.json()) as NcOcsEnvelope<NcServerInfoData>;
    if (parsed?.ocs?.meta?.status !== 'ok') {
      const meta = parsed?.ocs?.meta;
      throw new Error(
        `nextcloud serverinfo ocs-status=${meta?.status ?? 'unknown'} code=${meta?.statuscode ?? '?'}${meta?.message ? `: ${meta.message}` : ''}`,
      );
    }
    return parsed.ocs.data;
  }
}
