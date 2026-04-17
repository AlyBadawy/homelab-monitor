import {
  Server,
  Cpu,
  Box,
  Database,
  HardDrive,
  type LucideIcon,
} from 'lucide-react';
import type { TargetSummary, TargetKind } from '../lib/api';
import { StatusPill } from './StatusPill';
import { MetricBar } from './MetricBar';
import { StoragePoolList } from './StoragePoolList';
import { fmtUptime } from '../lib/format';

const KIND_ICON: Record<TargetKind, LucideIcon> = {
  'proxmox-host': Server,
  vm: Cpu,
  container: Box,
  database: Database,
  storage: HardDrive,
};

const KIND_LABEL: Record<TargetKind, string> = {
  'proxmox-host': 'HYPERVISOR',
  vm: 'VM',
  container: 'CONTAINER',
  database: 'DATABASE',
  storage: 'STORAGE',
};

interface TargetCardProps {
  target: TargetSummary;
  /** Span multiple grid columns (used for the wider host card). */
  wide?: boolean;
}

export function TargetCard({ target, wide = false }: TargetCardProps) {
  const Icon = KIND_ICON[target.kind];
  const isHost = target.kind === 'proxmox-host';

  return (
    <div className={`card group ${wide ? 'sm:col-span-2 xl:col-span-2' : ''}`}>
      <span className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l border-t border-accent-cyan/60 rounded-tl-xl" />
      <span className="pointer-events-none absolute right-0 bottom-0 h-3 w-3 border-r border-b border-accent-cyan/30 rounded-br-xl" />

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-border bg-bg-700 p-2 text-accent-cyan">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <div className="card-title">{KIND_LABEL[target.kind]}</div>
            <div className="font-semibold text-text">{target.name}</div>
          </div>
        </div>
        <StatusPill status={target.status} />
      </div>

      <div className="space-y-3">
        <MetricBar label="CPU" value={target.cpuPct} />
        <MetricBar label="Memory" value={target.memPct} />
        {!isHost && <MetricBar label="Disk" value={target.diskPct} />}
      </div>

      {isHost && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
            Storage Pools
          </div>
          <StoragePoolList pools={target.storages ?? []} />
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
          Uptime
        </span>
        <span className="font-mono text-xs text-text-muted">
          {fmtUptime(target.uptimeSec)}
        </span>
      </div>

      {target.error && (
        <div className="mt-3 rounded-md border border-accent-rose/30 bg-accent-rose/5 px-2 py-1.5 font-mono text-[0.7rem] text-accent-rose">
          {target.error}
        </div>
      )}
    </div>
  );
}
