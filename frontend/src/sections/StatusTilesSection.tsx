import { useMemo } from "react";
import { StatusTile, type TileState } from "../components/StatusTile";
import type {
  DockerEndpointResources,
  SummaryErrors,
  TargetKind,
  TargetStatus,
  TargetSummary,
} from "../lib/api";

interface StatusTilesSectionProps {
  targets: TargetSummary[];
  dockerResources: DockerEndpointResources[];
  apiErrors: SummaryErrors;
}

/**
 * Top-of-page strip of 12 rollup tiles. Layout:
 *   mobile: 2 columns × 6 rows
 *   md+   : 6 columns × 2 rows
 *
 * Slot assignment is stable so the grid shape never shifts:
 *
 *   Row 1: Hypervisor · UNAS · Switch · Router · Nextcloud · Immich
 *   Row 2: Docker · Services · VMs · Databases · Backups · UPS
 *
 * Integrations that don't exist yet (Switch, Router, Databases, Backups,
 * UPS) render as dimmed "TBD" tiles today — when those pollers ship, this
 * section will start filling the same slots without any layout churn.
 *
 * All tiles read from the same poll data already in App state, so adding
 * this section costs no extra network round-trips.
 */
export function StatusTilesSection({
  targets,
  dockerResources,
  apiErrors,
}: StatusTilesSectionProps) {
  const tiles = useMemo(
    () => buildTiles(targets, dockerResources, apiErrors),
    [targets, dockerResources, apiErrors],
  );

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
      {tiles.map((tile) => (
        <StatusTile
          key={tile.key}
          label={tile.label}
          state={tile.state}
          detail={tile.detail}
          title={tile.title}
        />
      ))}
    </div>
  );
}

/* ---------------- aggregation ---------------- */

interface TileSpec {
  key: string;
  label: string;
  state: TileState;
  detail?: string;
  title?: string;
}

const TBD_TITLE = "Integration not wired up yet";

function buildTiles(
  targets: TargetSummary[],
  dockerResources: DockerEndpointResources[],
  apiErrors: SummaryErrors,
): TileSpec[] {
  return [
    // Row 1 — infrastructure + first-class apps
    tbdTile("router", "Router"),
    tbdTile("switch", "Switch"),
    singleTile(
      "unas",
      "UNAS",
      targets,
      apiErrors.unas,
      (t) => t.kind === "unas",
    ),
    hypervisorTile(targets, apiErrors.proxmox),
    aggregateTile(
      "vms",
      "VMs",
      targets.filter((t) => t.kind === "vm" || t.kind === "container"),
    ),
    tbdTile("ups", "UPS"),
    // Row 2 — platform rollups
    tbdTile("databases", "Databases"),
    dockerTile(targets, dockerResources, apiErrors.portainer),
    aggregateTile(
      "services",
      "Services",
      targets.filter((t) => t.kind === "service"),
    ),
    singleTile(
      "nextcloud",
      "Nextcloud",
      targets,
      apiErrors.nextcloud,
      (t) => t.kind === "nextcloud",
    ),
    singleTile(
      "immich",
      "Immich",
      targets,
      apiErrors.immich,
      (t) => t.kind === "immich",
    ),
    tbdTile("backups", "Backups"),
  ];
}

function tbdTile(key: string, label: string): TileSpec {
  return { key, label, state: "tbd", title: TBD_TITLE };
}

/**
 * Tile fed by a single target (e.g. Nextcloud, Immich, UNAS). If the poller
 * has reported an error to /api/stats/summary we surface that as "ERROR" on
 * the tile even if the last-good status on the target is still "online" —
 * the poller error is the more actionable signal.
 */
function singleTile(
  key: string,
  label: string,
  targets: TargetSummary[],
  pollerError: string | null,
  match: (t: TargetSummary) => boolean,
): TileSpec {
  const target = targets.find(match);
  if (!target) {
    return {
      key,
      label,
      state: "unknown",
      detail: pollerError ? "ERROR" : "UNKNOWN",
      title: pollerError ?? "No data yet",
    };
  }
  const state = statusToTileState(target.status);
  return {
    key,
    label,
    state,
    detail: state === "ok" ? "OK" : state === "error" ? "OFFLINE" : "UNKNOWN",
    title: pollerError ?? target.error ?? target.name,
  };
}

/**
 * Hypervisor tile — there may be multiple proxmox-host targets in a cluster,
 * so aggregate the same way we do for VMs.
 */
function hypervisorTile(
  targets: TargetSummary[],
  pollerError: string | null,
): TileSpec {
  const hosts = targets.filter(
    (t) => t.kind === ("proxmox-host" satisfies TargetKind),
  );
  if (hosts.length === 0) {
    return {
      key: "hypervisor",
      label: "Hypervisor",
      state: "unknown",
      detail: pollerError ? "ERROR" : "UNKNOWN",
      title: pollerError ?? "No data yet",
    };
  }
  if (hosts.length === 1) {
    const state = statusToTileState(hosts[0].status);
    return {
      key: "hypervisor",
      label: "Hypervisor",
      state,
      detail: state === "ok" ? "OK" : state === "error" ? "OFFLINE" : "UNKNOWN",
      title: pollerError ?? hosts[0].name,
    };
  }
  return aggregateTile("hypervisor", "Hypervisor", hosts);
}

/**
 * Docker tile — online if we have at least one endpoint reporting resources
 * AND no containers are stuck offline. Keeps it lenient: a single crashed
 * container shouldn't turn the whole platform red, but a stopped
 * *endpoint* (no resources + poller error) should.
 */
function dockerTile(
  targets: TargetSummary[],
  dockerResources: DockerEndpointResources[],
  pollerError: string | null,
): TileSpec {
  const containers = targets.filter((t) => t.kind === "docker-container");
  const hasEndpoint = dockerResources.length > 0;

  if (!hasEndpoint && containers.length === 0) {
    return {
      key: "docker",
      label: "Docker",
      state: "unknown",
      detail: pollerError ? "ERROR" : "UNKNOWN",
      title: pollerError ?? "No Portainer data yet",
    };
  }

  if (pollerError) {
    return {
      key: "docker",
      label: "Docker",
      state: "error",
      detail: "ERROR",
      title: pollerError,
    };
  }

  const online = containers.filter((c) => c.status === "online").length;
  const total = containers.length;
  const anyOffline = containers.some((c) => c.status === "offline");

  return {
    key: "docker",
    label: "Docker",
    state: anyOffline ? "warn" : "ok",
    detail: total > 0 ? `${online}/${total} UP` : "OK",
    title: `${dockerResources.length} endpoint(s), ${total} container(s)`,
  };
}

/**
 * Rollup tile for a collection of same-kind targets.
 *   empty  → TBD
 *   all OK → ok + "N/N ONLINE"
 *   any X  → error + "N/M ONLINE"
 */
function aggregateTile(
  key: string,
  label: string,
  items: TargetSummary[],
): TileSpec {
  if (items.length === 0) {
    return { key, label, state: "tbd", title: "Nothing reporting yet" };
  }
  const online = items.filter((t) => t.status === "online").length;
  const offline = items.filter((t) => t.status === "offline").length;
  const total = items.length;

  let state: TileState;
  if (offline > 0) state = "error";
  else if (online === total) state = "ok";
  else state = "unknown";

  const detail = `${online}/${total} UP`;
  return { key, label, state, detail, title: detail };
}

function statusToTileState(status: TargetStatus): TileState {
  if (status === "online") return "ok";
  if (status === "offline") return "error";
  return "unknown";
}
