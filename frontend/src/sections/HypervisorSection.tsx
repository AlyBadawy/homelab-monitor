import { Section } from '../components/Section';
import { SectionEmptyState } from '../components/SectionEmptyState';
import { TargetCard } from '../components/TargetCard';
import { MiniVmCard } from '../components/MiniVmCard';
import type { TargetSummary } from '../lib/api';

interface HypervisorSectionProps {
  /** All proxmox-host targets (usually one in a single-node homelab). */
  hosts: TargetSummary[];
  /** VM + LXC targets — rendered inside the host card as a mini-grid. */
  vms: TargetSummary[];
  onSelect: (t: TargetSummary) => void;
  /** Last Proxmox poller error from /api/stats/summary. */
  pollerError?: string | null;
  /** Top-level /api/stats/summary fetch error. */
  fetchError?: string | null;
}

/**
 * Hypervisor section — always rendered. When no Proxmox host has come
 * back yet, shows an amber empty-state banner instead of hiding, so the
 * page shape doesn't reshuffle across poller restarts.
 *
 * When hosts are present:
 *   1. the first host's TargetCard (CPU/mem/temp/uptime/storage pools)
 *   2. a mini-grid of VM / LXC cards owned by the hypervisor (attached to
 *      the first host; multi-node clustering TBD)
 */
export function HypervisorSection({
  hosts,
  vms,
  onSelect,
  pollerError,
  fetchError,
}: HypervisorSectionProps) {
  return (
    <Section title="Hypervisor">
      {hosts.length === 0 ? (
        <SectionEmptyState
          label="HYPERVISOR · NO DATA"
          pollerError={pollerError}
          fetchError={fetchError}
          idleMessage="Proxmox poller hasn't reported a host yet. Check PROXMOX_BASE_URL / PROXMOX_TOKEN_* in docker-compose."
        />
      ) : (
        <div className="space-y-4">
          {hosts.map((host, idx) => (
            <div key={host.id} className="space-y-3">
              <TargetCard target={host} onSelect={onSelect} />

              {idx === 0 && vms.length > 0 && (
                <div className="card">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="card-title">
                      VIRTUAL MACHINES & CONTAINERS
                    </div>
                    <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
                      {vms.filter((v) => v.status === 'online').length}/
                      {vms.length} online
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {vms.map((vm) => (
                      <MiniVmCard key={vm.id} target={vm} onSelect={onSelect} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
