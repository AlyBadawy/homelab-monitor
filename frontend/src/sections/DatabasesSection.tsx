import { Database } from 'lucide-react';
import { Section } from '../components/Section';
import { TargetCard } from '../components/TargetCard';
import type { TargetSummary } from '../lib/api';

interface DatabasesSectionProps {
  items: TargetSummary[];
  onSelect: (t: TargetSummary) => void;
}

/**
 * Databases section — full-row list of database targets.
 *
 * Today no poller emits `kind: 'database'` so this renders as a dimmed
 * placeholder explaining what will live here. When a database poller
 * lands (pg/mysql/redis/etc.) the real targets will drop straight into
 * the same card without a layout change.
 */
export function DatabasesSection({ items, onSelect }: DatabasesSectionProps) {
  return (
    <Section title="Databases">
      {items.length === 0 ? (
        <div className="card opacity-60">
          <div className="card-title flex items-center gap-2">
            <Database className="h-3 w-3" />
            DATABASES · TBD
          </div>
          <p className="mt-3 font-mono text-xs text-text-dim">
            No database targets reporting yet.
          </p>
          <p className="mt-1 font-mono text-[0.7rem] text-text-dim">
            A PostgreSQL / MySQL / Redis poller will populate this section —
            host, version, connection count, slow-query rate, replication lag.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((t) => (
            <TargetCard key={t.id} target={t} onSelect={onSelect} />
          ))}
        </div>
      )}
    </Section>
  );
}
