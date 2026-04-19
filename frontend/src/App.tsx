import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Header } from "./components/Header";
import { Section } from "./components/Section";
import { CardRow } from "./components/CardRow";
import { ServicesCard } from "./components/ServicesCard";
import { TargetCard } from "./components/TargetCard";
import { DetailDrawer } from "./components/DetailDrawer";
import { NetworksCard } from "./components/NetworksCard";
import { VolumesCard } from "./components/VolumesCard";
import { NextcloudCard } from "./components/NextcloudCard";
import {
  fetchSummary,
  type DockerEndpointResources,
  type SummaryErrors,
  type TargetSummary,
} from "./lib/api";

/** Bucket label used for containers with no compose/swarm stack label. */
const UNSTACKED_KEY = "__unstacked__";

export default function App() {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [dockerResources, setDockerResources] = useState<DockerEndpointResources[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [apiErrors, setApiErrors] = useState<SummaryErrors>({
    proxmox: null,
    unas: null,
    portainer: null,
    nextcloud: null,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep the drawer's target reference fresh on each poll tick (so the header
  // shows live status/uptime while the drawer is open).
  const selectedTarget = selectedId
    ? targets.find((t) => t.id === selectedId) ?? null
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

  // Bucket targets by role for the layout:
  //   Infrastructure row  = Proxmox host(s) + UNAS/storage devices.
  //   VMs row             = VMs + LXCs (max 3 per row, fills full width).
  //   Databases row       = DB targets (same rules as VMs).
  //   Applications row    = Nextcloud / Immich / other first-class apps that
  //                         each have their own bespoke card (not the
  //                         generic TargetCard). Same max-3-per-row rules.
  //   dockerStackGroups   = ordered groups of Docker containers keyed by
  //                         their compose/swarm stack label — each rendered
  //                         as its own Section. "Unstacked" comes last.
  // Services are rendered separately via <ServicesCard>.
  const { infra, vms, databases, applications, dockerStackGroups } = useMemo(() => {
    const infra: TargetSummary[] = [];
    const vms: TargetSummary[] = [];
    const databases: TargetSummary[] = [];
    const applications: TargetSummary[] = [];
    const dockers: TargetSummary[] = [];
    for (const t of targets) {
      if (t.kind === "proxmox-host" || t.kind === "unas" || t.kind === "storage") {
        infra.push(t);
      } else if (t.kind === "vm" || t.kind === "container") {
        vms.push(t);
      } else if (t.kind === "docker-container") {
        dockers.push(t);
      } else if (t.kind === "database") {
        databases.push(t);
      } else if (t.kind === "nextcloud" || t.kind === "immich") {
        applications.push(t);
      }
      // `service` kind is intentionally omitted — ServicesCard owns it.
    }
    // Group dockers by stack label. Containers with no stack (plain `docker
    // run`) land in an UNSTACKED bucket that's rendered last.
    const stackMap = new Map<string, TargetSummary[]>();
    for (const d of dockers) {
      const key = d.stack ?? UNSTACKED_KEY;
      const arr = stackMap.get(key);
      if (arr) arr.push(d);
      else stackMap.set(key, [d]);
    }
    // Sort containers within each stack: running first, then by name.
    const sortContainers = (a: TargetSummary, b: TargetSummary) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      return a.status === "online" ? -1 : 1;
    };
    const dockerStackGroups = Array.from(stackMap.entries())
      .map(([key, list]) => ({ key, items: [...list].sort(sortContainers) }))
      .sort((a, b) => {
        // Unstacked bucket always last; named stacks alphabetically.
        if (a.key === UNSTACKED_KEY) return 1;
        if (b.key === UNSTACKED_KEY) return -1;
        return a.key.localeCompare(b.key);
      });
    // Applications are sorted by name for a stable order. They're first-class
    // apps (Nextcloud, Immich) that each have their own card, so we don't do
    // the online-first trick used for dockers.
    applications.sort((a, b) => a.name.localeCompare(b.name));
    return { infra, vms, databases, applications, dockerStackGroups };
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

        {apiErrors.proxmox && (
          <div className="card border-accent-amber/40 bg-accent-amber/5">
            <div className="flex items-center gap-2 card-title text-accent-amber">
              <AlertTriangle className="h-3.5 w-3.5" />
              Proxmox poller error
            </div>
            <p className="mt-2 font-mono text-sm text-text-muted break-all">
              {apiErrors.proxmox}
            </p>
          </div>
        )}

        {apiErrors.unas && (
          <div className="card border-accent-amber/40 bg-accent-amber/5">
            <div className="flex items-center gap-2 card-title text-accent-amber">
              <AlertTriangle className="h-3.5 w-3.5" />
              UNAS poller error
            </div>
            <p className="mt-2 font-mono text-sm text-text-muted break-all">
              {apiErrors.unas}
            </p>
          </div>
        )}

        {apiErrors.portainer && (
          <div className="card border-accent-amber/40 bg-accent-amber/5">
            <div className="flex items-center gap-2 card-title text-accent-amber">
              <AlertTriangle className="h-3.5 w-3.5" />
              Portainer poller error
            </div>
            <p className="mt-2 font-mono text-sm text-text-muted break-all">
              {apiErrors.portainer}
            </p>
          </div>
        )}

        {apiErrors.nextcloud && (
          <div className="card border-accent-amber/40 bg-accent-amber/5">
            <div className="flex items-center gap-2 card-title text-accent-amber">
              <AlertTriangle className="h-3.5 w-3.5" />
              Nextcloud poller error
            </div>
            <p className="mt-2 font-mono text-sm text-text-muted break-all">
              {apiErrors.nextcloud}
            </p>
          </div>
        )}

        {/* 1) Services — always at the top. The card owns its own empty
            state with an "Add service" CTA, so it renders even with no
            checks yet. */}
        <Section title="Services">
          <ServicesCard targets={targets} />
        </Section>

        {/* 2) Infrastructure — Proxmox host + UNAS side-by-side on md+,
            stacked on mobile. Each card takes exactly half the row width
            so the pair spans the same area as the Services card above. */}
        {infra.length > 0 && (
          <Section title="Infrastructure">
            <CardRow
              items={infra}
              maxPerRow={2}
              keyFor={(t) => t.id}
              renderItem={(t) => (
                <TargetCard target={t} onSelect={onSelect} />
              )}
            />
          </Section>
        )}

        {/* 3) VMs & containers — up to 3 per row. Every row fills the full
            services-row width: 1 VM = 100%, 2 = halves, 3 = thirds, 4 =
            row of 3 + full-width row of 1, and so on. */}
        {vms.length > 0 && (
          <Section title="Virtual Machines & Containers">
            <CardRow
              items={vms}
              maxPerRow={3}
              keyFor={(t) => t.id}
              renderItem={(t) => (
                <TargetCard target={t} onSelect={onSelect} />
              )}
            />
          </Section>
        )}

        {/* 4) Docker containers — one Section per compose stack. Within each
            stack the card-row rules match the VMs section (3-up, last row
            stretches). Unstacked (plain `docker run`) comes last so it
            doesn't split up labelled stacks. */}
        {dockerStackGroups.map((g) => {
          const title =
            g.key === UNSTACKED_KEY
              ? "Docker · Unstacked"
              : `Docker · ${g.key}`;
          return (
            <Section key={g.key} title={title}>
              <CardRow
                items={g.items}
                maxPerRow={3}
                keyFor={(t) => t.id}
                renderItem={(t) => (
                  <TargetCard target={t} onSelect={onSelect} />
                )}
              />
            </Section>
          );
        })}

        {/* 4b) Docker Resources — networks + volumes per endpoint. One pair
            of cards per Docker endpoint. Hidden until the first poll lands
            so we don't flash empty cards. */}
        {dockerResources.length > 0 && (
          <Section title="Docker Resources">
            <div className="space-y-4">
              {dockerResources.map((res) => (
                <CardRow
                  key={res.endpointId}
                  items={[
                    { type: "net" as const, res },
                    { type: "vol" as const, res },
                  ]}
                  maxPerRow={2}
                  keyFor={(i) => `${res.endpointId}-${i.type}`}
                  renderItem={(i) =>
                    i.type === "net" ? (
                      <NetworksCard
                        endpointName={i.res.endpointName}
                        networks={i.res.networks}
                      />
                    ) : (
                      <VolumesCard
                        endpointName={i.res.endpointName}
                        volumes={i.res.volumes}
                        sizesUpdatedAt={i.res.sizesUpdatedAt}
                        dfError={i.res.dfError}
                      />
                    )
                  }
                />
              ))}
            </div>
          </Section>
        )}

        {/* 5) Applications — first-class self-hosted apps (Nextcloud,
            Immich, …). Each kind gets its own bespoke card instead of the
            generic TargetCard because the metrics that matter are
            domain-specific (e.g. active users, file count, storage free). */}
        {applications.length > 0 && (
          <Section title="Applications">
            <CardRow
              items={applications}
              maxPerRow={3}
              keyFor={(t) => t.id}
              renderItem={(t) => {
                if (t.kind === "nextcloud") {
                  return <NextcloudCard target={t} onSelect={onSelect} />;
                }
                // Future kinds (immich, etc.) fall back to the generic card
                // until we ship a bespoke one for them.
                return <TargetCard target={t} onSelect={onSelect} />;
              }}
            />
          </Section>
        )}

        {/* 6) Databases — same rules as VMs. */}
        {databases.length > 0 && (
          <Section title="Databases">
            <CardRow
              items={databases}
              maxPerRow={3}
              keyFor={(t) => t.id}
              renderItem={(t) => (
                <TargetCard target={t} onSelect={onSelect} />
              )}
            />
          </Section>
        )}

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
          v0.11.0 · nextcloud serverinfo
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
