import { envBool } from "../../utils/envBool";
import { ProxmoxConfig } from "./types";

export function loadProxmoxConfig(): ProxmoxConfig {
  const proxmoxBaseUrl = (process.env.PROXMOX_BASE_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const proxmoxTokenId = process.env.PROXMOX_TOKEN_ID ?? "";
  const ProxmoxTokenSecret = process.env.PROXMOX_TOKEN_SECRET ?? "";
  const proxmoxEnabled = Boolean(
    proxmoxBaseUrl && proxmoxTokenId && ProxmoxTokenSecret,
  );

  return {
    enabled: proxmoxEnabled,
    baseUrl: proxmoxBaseUrl,
    tokenId: proxmoxTokenId,
    tokenSecret: ProxmoxTokenSecret,
    insecureTls: envBool("PROXMOX_INSECURE_TLS", false),
  };
}
