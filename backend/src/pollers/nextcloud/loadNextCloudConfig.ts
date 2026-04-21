import { envBool } from "../../utils/envBool";
import { envInt } from "../../utils/envInt";
import { NextCloudConfig } from "./types";

export function loadNextCloudConfig(): NextCloudConfig {
  const ncBase = (process.env.NEXTCLOUD_BASE_URL ?? "").replace(/\/+$/, "");
  const ncToken = (process.env.NEXTCLOUD_TOKEN ?? "").trim();
  const nextcloudEnabled = Boolean(ncBase && ncToken);

  return {
    enabled: nextcloudEnabled,
    baseUrl: ncBase,
    token: ncToken,
    insecureTls: envBool("NEXTCLOUD_INSECURE_TLS", false),
    pollIntervalMs: envInt("NEXTCLOUD_POLL_INTERVAL_MS", 60_000),
  };
}
