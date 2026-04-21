import { loadConfig } from "../app/loadConfig";
import { HttpsHealthPoller } from "./httpHealth/poller";
import { ImmichPoller } from "./immich/poller";
import { NextcloudPoller } from "./nextcloud/poller";
import { PortainerPoller } from "./portainer/poller";
import { ProxmoxPoller } from "./proxmox/poller";
import { UnasPoller } from "./unas/poller";

export type PollerInstance = {
  start: () => void;
  stop: () => void;
};

export type PollerEntry = {
  name: string;
  enabled: boolean;
  disabledReason: string;
  create: () => PollerInstance;
};

const cfg = loadConfig();

export const pollerRegistry: PollerEntry[] = [
  {
    name: "Proxmox",
    enabled: cfg.proxmox.enabled,
    disabledReason: "missing PROXMOX credentials",
    create: () => new ProxmoxPoller(cfg),
  },
  {
    name: "UniFi UNAS",
    enabled: cfg.unas.enabled,
    disabledReason: "missing UNAS credentials",
    create: () => new UnasPoller(cfg),
  },
  {
    name: "Portainer",
    enabled: cfg.portainer.enabled,
    disabledReason: "missing PORTAINER credentials",
    create: () => new PortainerPoller(cfg),
  },
  {
    name: "nextcloud",
    enabled: cfg.nextcloud.enabled,
    disabledReason: "missing NEXTCLOUD credentials",
    create: () => new NextcloudPoller(cfg),
  },
  {
    name: "immich",
    enabled: cfg.immich.enabled,
    disabledReason: "missing IMMICH credentials",
    create: () => new ImmichPoller(cfg),
  },
  {
    name: "Http Service Health",
    enabled: true,
    disabledReason: "always enabled",
    create: () => new HttpsHealthPoller(cfg),
  },
];
