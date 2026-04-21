import { envBool } from "../../utils/envBool";
import { envInt } from "../../utils/envInt";
import { PortainerConfig } from "./types";

export function loadPortainerConfig(): PortainerConfig {
  const appPoll = envInt("POLL_INTERVAL_MS", 10_000);

  const portainerBase = (process.env.PORTAINER_BASE_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const portainerKey = (process.env.PORTAINER_API_KEY ?? "").trim();
  const portainerEnabled = Boolean(portainerBase && portainerKey);

  return {
    enabled: portainerEnabled,
    baseUrl: portainerBase,
    apiKey: portainerKey,
    insecureTls: envBool("PORTAINER_INSECURE_TLS", false),
    pollIntervalMs: envInt("PORTAINER_POLL_INTERVAL_MS", appPoll),
    dfIntervalMs: envInt("PORTAINER_DF_INTERVAL_MS", 60_000),
  };
}
