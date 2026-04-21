/**
 * Central config loader. All env vars are read here so the rest of the app
 * can import typed values and the startup logs a single summary.
 */

import { loadImmichConfig } from "../pollers/immich/loadImmichConfig";
import { loadNextCloudConfig } from "../pollers/nextcloud/loadNextCloudConfig";
import { loadPortainerConfig } from "../pollers/portainer/loadPortainerConfig";
import { loadProxmoxConfig } from "../pollers/proxmox/loadProxmoxConfig";
import { loadUnasConfig } from "../pollers/unas/loadUnasConfig";
import { AppConfig } from "./types";
import { envInt } from "../utils/envInt";
import { logToConsole } from "../utils/logger";

import { LogLevel } from "../utils/logger";

export function loadConfig(): AppConfig {
  const appPort = envInt("PORT", 4000);
  const appDataDirectory = process.env.DATA_DIR ?? "/data";
  const appPoll = envInt("POLL_INTERVAL_MS", 10_000);

  const cfg: AppConfig = {
    port: appPort,
    dataDir: appDataDirectory,
    pollIntervalMs: appPoll,
    historyRetentionMs: envInt("HISTORY_RETENTION_MS", 24 * 60 * 60 * 1000),
    proxmox: loadProxmoxConfig(),
    unas: loadUnasConfig(),
    portainer: loadPortainerConfig(),
    nextcloud: loadNextCloudConfig(),
    immich: loadImmichConfig(),
  };

  logToConsole(LogLevel.info, `[homelab-monitor] loaded config from env:`);
  logToConsole(LogLevel.info, cfg);

  return cfg;
}
