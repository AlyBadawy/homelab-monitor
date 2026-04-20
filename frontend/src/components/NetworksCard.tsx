import clsx from "clsx";
import { Network } from "lucide-react";
import type { DockerNetworkSummary } from "../lib/api";

interface NetworksCardProps {
  endpointName: string;
  networks: DockerNetworkSummary[];
}

/**
 * One card per Docker endpoint listing its networks.
 *
 * Layout:
 *   lg+ : grid-table — name · driver · scope · subnet · attached count.
 *   <lg : stacked rows — header line + meta line so nothing scrolls horizontally.
 *
 * User networks are shown first (sorted by name); the three built-in docker
 * defaults (bridge / host / none) are grouped at the bottom and dimmed
 * slightly so they don't dominate the list.
 */
export function NetworksCard({ endpointName, networks }: NetworksCardProps) {
  const { user, builtIn } = splitNetworks(networks);

  if (networks.length === 0) {
    return (
      <div className="card">
        <div className="card-title flex items-center gap-2">
          <Network className="h-3 w-3" />
          NETWORKS · {endpointName}
        </div>
        <p className="mt-3 font-mono text-xs text-text-dim italic">
          no networks reported
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title flex items-center gap-2">
        <Network className="h-3 w-3" />
        NETWORKS · {endpointName}
        <span className="text-text-dim">· {networks.length}</span>
      </div>

      <div className="mt-3 space-y-1">
        {user.map((n) => (
          <NetworkRow key={n.id} n={n} dim={false} />
        ))}
        {builtIn.length > 0 && user.length > 0 && (
          <div className="py-2 my-2 border-t border-border/60" />
        )}
        {builtIn.map((n) => (
          <NetworkRow key={n.id} n={n} dim />
        ))}
      </div>
    </div>
  );
}

function NetworkRow({ n, dim }: { n: DockerNetworkSummary; dim: boolean }) {
  return (
    <div
      className={clsx(
        "grid gap-x-3 gap-y-0.5 items-baseline",
        // mobile: stacked; lg+: inline columns
        "grid-cols-[1fr_auto] lg:grid-cols-[minmax(0,1.2fr)_auto_auto_minmax(0,1.4fr)_auto]",
        dim && "opacity-60",
      )}
    >
      <span className="font-mono text-xs text-text truncate" title={n.name}>
        {n.name}
      </span>

      {/* mobile-only attached count (right-aligned on the first row) */}
      <span className="lg:hidden font-mono text-[0.65rem] text-text-muted justify-self-end">
        {n.attachedCount} attached
      </span>

      {/* second mobile row = meta line; on lg+ these become dedicated columns */}
      <span
        className={clsx(
          "font-mono text-[0.65rem] uppercase tracking-[0.15em] text-text-dim",
          "col-span-2 lg:col-span-1",
        )}
      >
        {n.driver ?? "—"}
        {n.internal && " · internal"}
      </span>
      <span className="hidden lg:inline font-mono text-[0.65rem] uppercase tracking-[0.15em] text-text-dim">
        {n.scope}
      </span>
      <span
        className="hidden lg:inline font-mono text-[0.65rem] text-text-dim truncate"
        title={n.subnet ?? undefined}
      >
        {n.subnet ?? "—"}
      </span>
      <span className="hidden lg:inline font-mono text-[0.65rem] text-text-muted justify-self-end">
        {n.attachedCount} attached
      </span>
    </div>
  );
}

/** Split user-defined networks from the bridge/host/none defaults. */
function splitNetworks(networks: DockerNetworkSummary[]): {
  user: DockerNetworkSummary[];
  builtIn: DockerNetworkSummary[];
} {
  const user: DockerNetworkSummary[] = [];
  const builtIn: DockerNetworkSummary[] = [];
  for (const n of networks) {
    if (n.builtIn) builtIn.push(n);
    else user.push(n);
  }
  user.sort((a, b) => a.name.localeCompare(b.name));
  builtIn.sort((a, b) => a.name.localeCompare(b.name));
  return { user, builtIn };
}
