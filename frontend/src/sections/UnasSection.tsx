import { Section } from '../components/Section';
import { SectionEmptyState } from '../components/SectionEmptyState';
import { TargetCard } from '../components/TargetCard';
import type { TargetSummary } from '../lib/api';

interface UnasSectionProps {
  /** UNAS + any other generic-storage targets. */
  items: TargetSummary[];
  onSelect: (t: TargetSummary) => void;
  /** Last UNAS poller error from /api/stats/summary. */
  pollerError?: string | null;
  /** Top-level /api/stats/summary fetch error. */
  fetchError?: string | null;
}

/**
 * UNAS section — always rendered, even when the UNAS poller is
 * unreachable. When no targets have come back yet, shows an amber
 * empty-state banner instead of hiding the whole section so the layout
 * stays stable across reconnects.
 */
export function UnasSection({
  items,
  onSelect,
  pollerError,
  fetchError,
}: UnasSectionProps) {
  return (
    <Section title="UNAS">
      {items.length === 0 ? (
        <SectionEmptyState
          label="UNAS · NO DATA"
          pollerError={pollerError}
          fetchError={fetchError}
          idleMessage="UNAS poller hasn't reported yet. Check UNAS_HOST / SSH credentials in docker-compose."
        />
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
