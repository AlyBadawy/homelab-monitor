/**
 * Central config loader. All env vars are read here so the rest of the app
 * can import typed values and the startup logs a single summary.
 */

export interface ProxmoxConfig {
  enabled: boolean;
  baseUrl: string;          // e.g. https://proxmox.in.alybadawy.com
  tokenId: string;          // e.g. root@pam!dashboard
  tokenSecret: string;      // the UUID
  insecureTls: boolean;     // skip TLS verification (for self-signed upstream)
}

export interface UnasConfig {
  enabled: boolean;
  /** Display name shown on the UI card. */
  name: string;
  host: string;             // e.g. 172.20.20.2
  port: number;             // ssh port, default 22
  user: string;             // ssh user (ideally read-only)
  /** Path to private key (mounted read-only into the container). */
  privateKeyPath: string | null;
  passphrase: string | null;
  /** Password fallback — discouraged; key auth is preferred. */
  password: string | null;
  /** Hard ceiling for a batch of read-only commands. */
  execTimeoutMs: number;
}

export interface PortainerConfig {
  enabled: boolean;
  /** Base URL of the Portainer instance (no trailing slash). */
  baseUrl: string;
  /** API key created in Portainer UI → User settings → Access tokens. */
  apiKey: string;
  /** Skip TLS verify when Portainer ships a self-signed cert. */
  insecureTls: boolean;
  /** Poll interval (ms). Falls back to the app-wide POLL_INTERVAL_MS. */
  pollIntervalMs: number;
}

export interface AppConfig {
  port: number;
  dataDir: string;
  pollIntervalMs: number;
  historyRetentionMs: number;
  proxmox: ProxmoxConfig;
  unas: UnasConfig;
  portainer: PortainerConfig;
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

  const unasHost = (process.env.UNAS_HOST ?? '').trim();
  const unasUser = (process.env.UNAS_USER ?? '').trim();
  const unasKeyPath = (process.env.UNAS_SSH_KEY_PATH ?? '').trim() || null;
  const unasPassword = process.env.UNAS_PASSWORD ?? null;
  // Considered enabled when we have host+user and at least one credential.
  const unasEnabled = Boolean(unasHost && unasUser && (unasKeyPath || unasPassword));

  const portainerBase = (process.env.PORTAINER_BASE_URL ?? '').replace(/\/+$/, '');
  const portainerKey = (process.env.PORTAINER_API_KEY ?? '').trim();
  const portainerEnabled = Boolean(portainerBase && portainerKey);

  const appPoll = envInt('POLL_INTERVAL_MS', 10_000);

  const cfg: AppConfig = {
    port: envInt('PORT', 4000),
    dataDir: process.env.DATA_DIR ?? '/data',
    pollIntervalMs: appPoll,
    historyRetentionMs: envInt('HISTORY_RETENTION_MS', 24 * 60 * 60 * 1000),
    proxmox: {
      enabled: proxmoxEnabled,
      baseUrl,
      tokenId,
      tokenSecret,
      insecureTls: envBool('PROXMOX_INSECURE_TLS', false),
    },
    unas: {
      enabled: unasEnabled,
      name: process.env.UNAS_NAME ?? 'UNAS',
      host: unasHost,
      port: envInt('UNAS_PORT', 22),
      user: unasUser,
      privateKeyPath: unasKeyPath,
      passphrase: process.env.UNAS_SSH_KEY_PASSPHRASE ?? null,
      password: unasPassword,
      execTimeoutMs: envInt('UNAS_EXEC_TIMEOUT_MS', 15_000),
    },
    portainer: {
      enabled: portainerEnabled,
      baseUrl: portainerBase,
      apiKey: portainerKey,
      insecureTls: envBool('PORTAINER_INSECURE_TLS', false),
      pollIntervalMs: envInt('PORTAINER_POLL_INTERVAL_MS', appPoll),
    },
  };

  // eslint-disable-next-line no-console
  console.log(
    `[homelab-monitor] config: port=${cfg.port} poll=${cfg.pollIntervalMs}ms ` +
      `proxmox=${cfg.proxmox.enabled ? cfg.proxmox.baseUrl : 'disabled'} ` +
      `insecureTls=${cfg.proxmox.insecureTls} ` +
      `unas=${cfg.unas.enabled ? `${cfg.unas.user}@${cfg.unas.host}:${cfg.unas.port}` : 'disabled'} ` +
      `portainer=${cfg.portainer.enabled ? cfg.portainer.baseUrl : 'disabled'}`,
  );

  return cfg;
}
