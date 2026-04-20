import { Section } from '../components/Section';
import { SectionEmptyState } from '../components/SectionEmptyState';
import { NextcloudCard } from '../components/NextcloudCard';
import type { TargetSummary } from '../lib/api';

interface NextcloudSectionProps {
  items: TargetSummary[];
  onSelect: (t: TargetSummary) => void;
  /** Last Nextcloud poller error from /api/stats/summary. */
  pollerError?: string | null;
  /** Top-level /api/stats/summary fetch error. */
  fetchError?: string | null;
}

/**
 * Nextcloud section — always rendered. When no Nextcloud target has been
 * reported yet, shows an amber empty-state banner so the layout stays
 * stable when the poller is down or not configured.
 */
export function NextcloudSection({
  items,
  onSelect,
  pollerError,
  fetchError,
}: NextcloudSectionProps) {
  return (
    <Section title="Nextcloud">
      {items.length === 0 ? (
        <SectionEmptyState
          label="NEXTCLOUD · NO DATA"
          pollerError={pollerError}
          fetchError={fetchError}
          idleMessage="Nextcloud poller hasn't reported yet. Set NEXTCLOUD_BASE_URL / NEXTCLOUD_TOKEN in docker-compose to enable."
        />
      ) : (
        <div className="space-y-4">
          {items.map((t) => (
            <NextcloudCard key={t.id} target={t} onSelect={onSelect} />
          ))}
        </div>
      )}
    </Section>
  );
}
