import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Header } from "./components/Header";
import { Section } from "./components/Section";
import { CardRow } from "./components/CardRow";
import { ServicesCard } from "./components/ServicesCard";
import { TargetCard } from "./components/TargetCard";
import { DetailDrawer } from "./components/DetailDrawer";
import {
  fetchSummary,
  type SummaryErrors,
  type TargetSummary,
} from "./lib/api";

export default function App() {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [apiErrors, setApiErrors] = useState<SummaryErrors>({
    proxmox: null,
    unas: null,
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

  // Bucket targets by role for the new layout:
  //   Infrastructure row = Proxmox host(s) + UNAS/storage devices.
  //   VMs row            = VMs + LXCs (max 3 per row, fills full width).
  //   Databases row      = DB targets (same rules as VMs).
  // Services are rendered separately via <ServicesCard>.
  const { infra, vms, databases } = useMemo(() => {
    const infra: TargetSummary[] = [];
    const vms: TargetSummary[] = [];
    const databases: TargetSummary[] = [];
    for (const t of targets) {
      if (t.kind === "proxmox-host" || t.kind === "unas" || t.kind === "storage") {
        infra.push(t);
      } else if (t.kind === "vm" || t.kind === "container") {
        vms.push(t);
      } else if (t.kind === "database") {
        databases.push(t);
      }
      // `service` kind is intentionally omitted — ServicesCard owns it.
    }
    return { infra, vms, databases };
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

        {/* 4) Databases — same rules as VMs. */}
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
          chunk 2 · proxmox integration live · more services coming
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
