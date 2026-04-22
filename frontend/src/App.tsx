import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Header } from "./components/Header";
import { DetailDrawer } from "./components/DetailDrawer";
import { StatusTilesSection } from "./sections/StatusTilesSection";
import { UnifiSection } from "./sections/UnifiSection";
import { UnasSection } from "./sections/UnasSection";
import { HypervisorSection } from "./sections/HypervisorSection";
import { DockerSection } from "./sections/DockerSection";
import { ServicesSection } from "./sections/ServicesSection";
import { DatabasesSection } from "./sections/DatabasesSection";
import { NextcloudSection } from "./sections/NextcloudSection";
import { ImmichSection } from "./sections/ImmichSection";
import {
  fetchSummary,
  type DockerEndpointResources,
  type SummaryErrors,
  type TargetSummary,
} from "./lib/api";
import { VERSION } from "./version";

export default function App() {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [dockerResources, setDockerResources] = useState<
    DockerEndpointResources[]
  >([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [apiErrors, setApiErrors] = useState<SummaryErrors>({
    proxmox: null,
    unas: null,
    portainer: null,
    nextcloud: null,
    immich: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep the drawer's target reference fresh on each poll tick (so the header
  // shows live status/uptime while the drawer is open).
  const selectedTarget = selectedId
    ? (targets.find((t) => t.id === selectedId) ?? null)
    : null;

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await fetchSummary(signal);
      setTargets(data.targets);
      setDockerResources(data.dockerResources ?? []);
      setLastUpdated(data.generatedAt);
      setApiErrors(data.errors);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setFetchError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    const id = window.setInterval(() => void load(), 10_000);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, [load]);

  // Bucket targets by role for the section layout. Each section owns its
  // own rendering; App.tsx only routes the data in.
  //   hosts      — proxmox-host(s)
  //   vms        — VMs + LXCs (inside the Hypervisor card's mini-grid)
  //   dockers    — docker-container targets (grouped by stack inside DockerSection)
  //   unas       — unas + storage targets
  //   databases  — database targets (placeholder today)
  //   nextclouds — nextcloud targets
  //   immichs    — immich targets
  // `service` kind is intentionally omitted — ServicesCard reads it directly.
  const buckets = useMemo(() => {
    const hosts: TargetSummary[] = [];
    const vms: TargetSummary[] = [];
    const dockers: TargetSummary[] = [];
    const unas: TargetSummary[] = [];
    const databases: TargetSummary[] = [];
    const nextclouds: TargetSummary[] = [];
    const immichs: TargetSummary[] = [];
    for (const t of targets) {
      switch (t.kind) {
        case "proxmox-host":
          hosts.push(t);
          break;
        case "vm":
        case "container":
          vms.push(t);
          break;
        case "docker-container":
          dockers.push(t);
          break;
        case "unas":
        case "storage":
          unas.push(t);
          break;
        case "database":
          databases.push(t);
          break;
        case "nextcloud":
          nextclouds.push(t);
          break;
        case "immich":
          immichs.push(t);
          break;
        // service is handled inside ServicesCard
      }
    }
    vms.sort((a, b) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      return a.status === "online" ? -1 : 1;
    });
    nextclouds.sort((a, b) => a.name.localeCompare(b.name));
    immichs.sort((a, b) => a.name.localeCompare(b.name));
    return { hosts, vms, dockers, unas, databases, nextclouds, immichs };
  }, [targets]);

  const onSelect = (t: TargetSummary) => setSelectedId(t.id);

  return (
    <div className="min-h-screen">
      <Header
        lastUpdated={lastUpdated}
        onRefresh={() => void load()}
        loading={loading}
      />

      <main className="relative z-10 mx-auto max-w-[1600px] px-6 py-8 space-y-10">
        {fetchError && (
          <div className="card border-accent-rose/40 bg-accent-rose/5">
            <div className="flex items-center gap-2 card-title text-accent-rose">
              <AlertTriangle className="h-3.5 w-3.5" />
              Backend unreachable
            </div>
            <p className="mt-2 font-mono text-sm text-text-muted">
              {fetchError}
            </p>
          </div>
        )}

        {/* Poller-level error banners — same UX as before; collected in one
            block so App.tsx reads cleanly. */}
        <PollerErrors errors={apiErrors} />

        {/* 1) 12 rollup status tiles — always first, always present. Reads
               directly from state, no extra fetches. */}
        <StatusTilesSection
          targets={targets}
          dockerResources={dockerResources}
          apiErrors={apiErrors}
        />

        {/* 2) UniFi network overview — placeholder card. */}
        <UnifiSection />

        {/* 3) UNAS — full row for the drives/pools tables. */}
        <UnasSection items={buckets.unas} onSelect={onSelect} />

        {/* 4) Hypervisor — full-row card with the host's metrics + a
               mini-grid of VMs inside. */}
        <HypervisorSection
          hosts={buckets.hosts}
          vms={buckets.vms}
          onSelect={onSelect}
        />

        {/* 5) Docker — full-row card: networks + volumes on top, then
               per-stack subsections with two-line container rows. */}
        <DockerSection
          containers={buckets.dockers}
          dockerResources={dockerResources}
          onSelect={onSelect}
        />

        {/* 6) Services — HTTP health checks. Owns its own data + empty state. */}
        <ServicesSection targets={targets} />

        {/* 7) Databases — placeholder card. */}
        <DatabasesSection items={buckets.databases} onSelect={onSelect} />

        {/* 8) Nextcloud — full-row card. */}
        <NextcloudSection items={buckets.nextclouds} onSelect={onSelect} />

        {/* 9) Immich — full-row card. */}
        <ImmichSection items={buckets.immichs} onSelect={onSelect} />

        {targets.length === 0 && !fetchError && loading && (
          <div className="card text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">
              Establishing link…
            </p>
          </div>
        )}

        {targets.length === 0 &&
          !fetchError &&
          !loading &&
          !apiErrors.proxmox && (
            <div className="card text-center">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">
                No targets reported yet.
              </p>
              <p className="mt-2 font-mono text-xs text-text-dim">
                Check that PROXMOX_* env vars are set in docker-compose.yml.
              </p>
            </div>
          )}
      </main>

      <footer className="relative z-10 mx-auto max-w-[1600px] px-6 py-6">
        <div className="divider" />
        <p className="mt-4 text-center font-mono text-[0.65rem] uppercase tracking-[0.24em] text-text-dim">
          Homelab monitor · v{VERSION}
        </p>
        <p className="mt-2 text-center font-mono text-[0.65rem] uppercase tracking-[0.24em] text-text-dim">
          Developed by{" "}
          <a href="https://alybadawy.com" className="underline">
            alybadawy
          </a>
        </p>
      </footer>

      <DetailDrawer
        target={selectedTarget}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

/* ---------------- poller error banners ---------------- */

interface PollerErrorsProps {
  errors: SummaryErrors;
}

/**
 * Renders one amber banner per poller that errored on its last tick. Kept
 * inline so App.tsx can stay focused on sectioning and so adding a new
 * poller only means adding one more entry here.
 */
function PollerErrors({ errors }: PollerErrorsProps) {
  const rows: Array<{ key: keyof SummaryErrors; label: string }> = [
    { key: "proxmox", label: "Proxmox" },
    { key: "unas", label: "UNAS" },
    { key: "portainer", label: "Portainer" },
    { key: "nextcloud", label: "Nextcloud" },
    { key: "immich", label: "Immich" },
  ];
  const active = rows.filter((r) => !!errors[r.key]);
  if (active.length === 0) return null;
  return (
    <div className="space-y-3">
      {active.map(({ key, label }) => (
        <div
          key={key}
          className="card border-accent-amber/40 bg-accent-amber/5"
        >
          <div className="flex items-center gap-2 card-title text-accent-amber">
            <AlertTriangle className="h-3.5 w-3.5" />
            {label} poller error
          </div>
          <p className="mt-2 font-mono text-sm text-text-muted break-all">
            {errors[key]}
          </p>
        </div>
      ))}
    </div>
  );
}
