import { ImmichConfig } from "../pollers/immich/types";
import { NextCloudConfig } from "../pollers/nextcloud/types";
import { PortainerConfig } from "../pollers/portainer/types";
import { ProxmoxConfig } from "../pollers/proxmox/types";
import { UnasConfig } from "../pollers/unas/types";

export interface AppConfig {
  port: number;
  dataDir: string;
  pollIntervalMs: number;
  historyRetentionMs: number;
  proxmox: ProxmoxConfig;
  unas: UnasConfig;
  portainer: PortainerConfig;
  nextcloud: NextCloudConfig;
  immich: ImmichConfig;
}
