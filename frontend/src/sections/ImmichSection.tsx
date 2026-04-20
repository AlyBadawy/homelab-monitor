import { Section } from '../components/Section';
import { SectionEmptyState } from '../components/SectionEmptyState';
import { ImmichCard } from '../components/ImmichCard';
import type { TargetSummary } from '../lib/api';

interface ImmichSectionProps {
  items: TargetSummary[];
  onSelect: (t: TargetSummary) => void;
  /** Last Immich poller error from /api/stats/summary. */
  pollerError?: string | null;
  /** Top-level /api/stats/summary fetch error. */
  fetchError?: string | null;
}

/**
 * Immich section — always rendered. When no Immich target has been
 * reported yet, shows an amber empty-state banner so the layout stays
 * stable when the poller is down or not configured.
 */
export function ImmichSection({
  items,
  onSelect,
  pollerError,
  fetchError,
}: ImmichSectionProps) {
  return (
    <Section title="Immich">
      {items.length === 0 ? (
        <SectionEmptyState
          label="IMMICH · NO DATA"
          pollerError={pollerError}
          fetchError={fetchError}
          idleMessage="Immich poller hasn't reported yet. Set IMMICH_BASE_URL / IMMICH_API_KEY in docker-compose to enable."
        />
      ) : (
        <div className="space-y-4">
          {items.map((t) => (
            <ImmichCard key={t.id} target={t} onSelect={onSelect} />
          ))}
        </div>
      )}
    </Section>
  );
}
