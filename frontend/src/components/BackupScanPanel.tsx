import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, Archive, Info } from 'lucide-react';
import type { BackupScanDiagnostic } from '../lib/api';

interface BackupScanPanelProps {
  diagnostics: BackupScanDiagnostic[];
}

/**
 * Visible diagnostic panel that explains why each storage pool is or isn't
 * contributing to the per-VM backup counts. Mainly exists so the user can
 * debug cases like "my NFS backup pool shows 0 backups" without digging
 * through container logs.
 */
export function BackupScanPanel({ diagnostics }: BackupScanPanelProps) {
  const [open, setOpen] = useState<boolean>(() => shouldDefaultOpen(diagnostics));

  if (diagnostics.length === 0) return null;

  const scanned = diagnostics.filter((d) => d.status !== 'skipped');
  const errored = diagnostics.filter((d) => d.status === 'error');
  const totalEntries = scanned.reduce(
    (a, d) => a + (d.entryCount ?? 0),
    0,
  );
  const headerHint = errored.length
    ? `${errored.length} scan${errored.length > 1 ? 's' : ''} failed`
    : scanned.length === 0
      ? 'no backup storages detected'
      : `${scanned.length} scanned · ${totalEntries} backup entries`;

  return (
    <div className="card">
      <button
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-text-dim" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-text-dim" />
          )}
          <Archive className="h-3.5 w-3.5 text-accent-cyan" />
          <span className="card-title">Backup scan diagnostics</span>
        </div>
        <span
          className={`font-mono text-[0.65rem] uppercase tracking-[0.18em] ${
            errored.length ? 'text-accent-rose' : 'text-text-muted'
          }`}
        >
          {headerHint}
        </span>
      </button>

      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-text-dim">
                <Th>Node</Th>
                <Th>Storage</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th className="text-right">Raw</Th>
                <Th className="text-right">Backups</Th>
                <Th>VMs seen</Th>
                <Th>Reason / error</Th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.map((d, idx) => (
                <Fragment key={`${d.node}/${d.storage}/${idx}`}>
                  <tr className="border-b border-border/50">
                    <Td>{d.node}</Td>
                    <Td>{d.storage}</Td>
                    <Td className="text-text-dim">{d.type ?? '—'}</Td>
                    <Td>
                      <StatusTag status={d.status} />
                    </Td>
                    <Td className="text-right text-text-dim">
                      {d.rawEntryCount ?? (d.status === 'skipped' ? '—' : 0)}
                    </Td>
                    <Td className="text-right">
                      {d.entryCount ?? (d.status === 'skipped' ? '—' : 0)}
                    </Td>
                    <Td className="text-text-dim">
                      {d.vmidsSeen && d.vmidsSeen.length > 0
                        ? d.vmidsSeen.join(', ')
                        : '—'}
                    </Td>
                    <Td className="max-w-[480px] truncate text-text-dim">
                      {d.status === 'error'
                        ? d.error
                        : reasonLabel(d.reason)}
                    </Td>
                  </tr>
                  {d.hint && (
                    <tr className="border-b border-border/50 bg-accent-amber/5">
                      <Td colSpan={8} className="text-accent-amber">
                        <div className="flex items-start gap-2">
                          <Info className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{d.hint}</span>
                        </div>
                      </Td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function shouldDefaultOpen(d: BackupScanDiagnostic[]): boolean {
  if (d.some((x) => x.status === 'error')) return true;
  if (d.some((x) => x.hint)) return true;
  const anyOk = d.some((x) => x.status === 'ok' && (x.entryCount ?? 0) > 0);
  return !anyOk; // open if we found nothing, so the user sees *why*
}

function reasonLabel(r: BackupScanDiagnostic['reason']): string {
  switch (r) {
    case 'content-backup':
      return 'content includes backup';
    case 'pbs-type':
      return 'pbs storage';
    case 'skipped-disabled':
      return 'storage disabled';
    case 'skipped-no-backup-content':
      return 'content does not include backup';
  }
}

function StatusTag({ status }: { status: BackupScanDiagnostic['status'] }) {
  const cls =
    status === 'ok'
      ? 'border-accent-emerald/40 text-accent-emerald bg-accent-emerald/5'
      : status === 'error'
        ? 'border-accent-rose/40 text-accent-rose bg-accent-rose/5'
        : 'border-border text-text-dim bg-bg-700/40';
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.16em] ${cls}`}
    >
      {status}
    </span>
  );
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-2 py-1.5 text-left font-mono text-[0.6rem] font-normal uppercase tracking-[0.18em] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-2 py-1.5 align-top ${className}`}>
      {children}
    </td>
  );
}
