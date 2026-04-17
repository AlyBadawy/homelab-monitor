import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Header } from './components/Header';
import { Section } from './components/Section';
import { TargetCard } from './components/TargetCard';
import {
  fetchSummary,
  type SummaryErrors,
  type TargetSummary,
} from './lib/api';

const SECTIONS: Array<{ title: string; kinds: TargetSummary['kind'][] }> = [
  { title: 'Hypervisor', kinds: ['proxmox-host'] },
  { title: 'Virtual Machines & Containers', kinds: ['vm', 'container'] },
  { title: 'Services', kinds: ['database'] },
  { title: 'Storage', kinds: ['storage'] },
];

export default function App() {
  const [targets, setTargets] = useState<TargetSummary[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [apiErrors, setApiErrors] = useState<SummaryErrors>({
    proxmox: null,
  });

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await fetchSummary(signal);
      setTargets(data.targets);
      setLastUpdated(data.generatedAt);
      setApiErrors(data.errors);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
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
            <p className="mt-2 font-mono text-sm text-text-muted">{fetchError}</p>
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

        {SECTIONS.map(section => {
          const items = targets.filter(t => section.kinds.includes(t.kind));
          if (items.length === 0) return null;
          const isHypervisor = section.title === 'Hypervisor';
          return (
            <Section key={section.title} title={section.title}>
              {items.map(t => (
                <TargetCard key={t.id} target={t} wide={isHypervisor} />
              ))}
            </Section>
          );
        })}

        {targets.length === 0 && !fetchError && loading && (
          <div className="card text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-text-muted">
              Establishing link…
            </p>
          </div>
        )}

        {targets.length === 0 && !fetchError && !loading && !apiErrors.proxmox && (
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
      </footer>
    </div>
  );
}
