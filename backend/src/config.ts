/**
 * Central config loader. All env vars are read here so the rest of the app
 * can import typed values and the startup logs a single summary.
 */

export interface ProxmoxConfig {
  enabled: boolean;
  baseUrl: string;          // e.g. https://proxmox.in.alybadawy.com
  tokenId: string;          // e.g. monitor@pve!dashboard
  tokenSecret: string;      // the UUID
  insecureTls: boolean;     // skip TLS verification (for self-signed upstream)
}

export interface AppConfig {
  port: number;
  dataDir: string;
  pollIntervalMs: number;
  historyRetentionMs: number;
  proxmox: ProxmoxConfig;
}

function envBool(name: string, def = false): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function loadConfig(): AppConfig {
  const baseUrl = (process.env.PROXMOX_BASE_URL ?? '').replace(/\/+$/, '');
  const tokenId = process.env.PROXMOX_TOKEN_ID ?? '';
  const tokenSecret = process.env.PROXMOX_TOKEN_SECRET ?? '';
  const proxmoxEnabled = Boolean(baseUrl && tokenId && tokenSecret);

  const cfg: AppConfig = {
    port: envInt('PORT', 4000),
    dataDir: process.env.DATA_DIR ?? '/data',
    pollIntervalMs: envInt('POLL_INTERVAL_MS', 10_000),
    historyRetentionMs: envInt('HISTORY_RETENTION_MS', 24 * 60 * 60 * 1000),
    proxmox: {
      enabled: proxmoxEnabled,
      baseUrl,
      tokenId,
      tokenSecret,
      insecureTls: envBool('PROXMOX_INSECURE_TLS', false),
    },
  };

  // eslint-disable-next-line no-console
  console.log(
    `[homelab-monitor] config: port=${cfg.port} poll=${cfg.pollIntervalMs}ms ` +
      `proxmox=${cfg.proxmox.enabled ? cfg.proxmox.baseUrl : 'disabled'} ` +
      `insecureTls=${cfg.proxmox.insecureTls}`,
  );

  return cfg;
}
