import { Section } from '../components/Section';
import { ServicesCard } from '../components/ServicesCard';
import type { TargetSummary } from '../lib/api';

interface ServicesSectionProps {
  /** ALL targets — ServicesCard owns the kind='service' filter internally. */
  targets: TargetSummary[];
}

/**
 * Services section — HTTP health checks table. The ServicesCard owns both
 * its own data (via /api/services) and its empty state ("Add service" CTA),
 * so this section always renders.
 */
export function ServicesSection({ targets }: ServicesSectionProps) {
  return (
    <Section title="Services">
      <ServicesCard targets={targets} />
    </Section>
  );
}
