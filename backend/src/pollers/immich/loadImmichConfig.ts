import { envBool } from "../../utils/envBool";
import { envInt } from "../../utils/envInt";
import { ImmichConfig } from "./types";

export function loadImmichConfig(): ImmichConfig {
  const immichBase = (process.env.IMMICH_BASE_URL ?? "").replace(/\/+$/, "");
  const immichKey = (process.env.IMMICH_API_KEY ?? "").trim();
  const immichEnabled = Boolean(immichBase && immichKey);

  return {
    enabled: immichEnabled,
    baseUrl: immichBase,
    apiKey: immichKey,
    insecureTls: envBool("IMMICH_INSECURE_TLS", false),
    pollIntervalMs: envInt("IMMICH_POLL_INTERVAL_MS", 60_000),
  };
}
