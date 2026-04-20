import { useMemo } from 'react';
import { Section } from '../components/Section';
import { NetworksCard } from '../components/NetworksCard';
import { VolumesCard } from '../components/VolumesCard';
import { DockerContainerRow } from '../components/DockerContainerRow';
import type {
  DockerEndpointResources,
  TargetSummary,
} from '../lib/api';

const UNSTACKED_KEY = '__unstacked__';

interface DockerSectionProps {
  containers: TargetSummary[];
  dockerResources: DockerEndpointResources[];
  onSelect: (t: TargetSummary) => void;
}

/**
 * Full-row Docker section — one card that consolidates everything a user
 * would want to see about their Docker hosts:
 *   1. per-endpoint Networks card + Volumes card at the top (side-by-side
 *      on lg+, stacked below)
 *   2. per-stack subsections, each containing a compact row per container
 *      (icon + name + status / uptime · cpu · mem / net in · net out · 24h
 *      sparkline)
 *
 * Unstacked containers (plain `docker run`) are bucketed last so labelled
 * stacks stay grouped at the top. The whole card hides when neither
 * resources nor containers are reporting yet.
 */
export function DockerSection({
  containers,
  dockerResources,
  onSelect,
}: DockerSectionProps) {
  // Group containers by compose/swarm stack. Keeps the same ordering rules
  // the old top-level layout used (named stacks alphabetical, unstacked last,
  // within a stack: online first, then name).
  const stackGroups = useMemo(() => {
    const stackMap = new Map<string, TargetSummary[]>();
    for (const c of containers) {
      const key = c.stack ?? UNSTACKED_KEY;
      const arr = stackMap.get(key);
      if (arr) arr.push(c);
      else stackMap.set(key, [c]);
    }
    const sortContainers = (a: TargetSummary, b: TargetSummary) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      return a.status === 'online' ? -1 : 1;
    };
    return Array.from(stackMap.entries())
      .map(([key, list]) => ({ key, items: [...list].sort(sortContainers) }))
      .sort((a, b) => {
        if (a.key === UNSTACKED_KEY) return 1;
        if (b.key === UNSTACKED_KEY) return -1;
        return a.key.localeCompare(b.key);
      });
  }, [containers]);

  if (dockerResources.length === 0 && containers.length === 0) {
    return null;
  }

  const runningCount = containers.filter((c) => c.status === 'online').length;

  return (
    <Section title="Docker">
      <div className="card">
        {/* Header meta — endpoints + running count. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="card-title">
            DOCKER · {dockerResources.length} ENDPOINT
            {dockerResources.length === 1 ? '' : 'S'}
          </div>
          {containers.length > 0 && (
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
              {runningCount}/{containers.length} running
            </span>
          )}
        </div>

        {/* 1) Networks + Volumes per endpoint — side by side on lg+. */}
        {dockerResources.length > 0 && (
          <div className="space-y-4">
            {dockerResources.map((res) => (
              <div
                key={res.endpointId}
                className="grid grid-cols-1 gap-4 lg:grid-cols-2"
              >
                <NetworksCard
                  endpointName={res.endpointName}
                  networks={res.networks}
                />
                <VolumesCard
                  endpointName={res.endpointName}
                  volumes={res.volumes}
                  sizesUpdatedAt={res.sizesUpdatedAt}
                  dfError={res.dfError}
                />
              </div>
            ))}
          </div>
        )}

        {/* 2) Per-stack subsections. */}
        {stackGroups.length > 0 && (
          <div className="mt-5 space-y-4">
            {stackGroups.map((g) => (
              <StackBlock
                key={g.key}
                title={
                  g.key === UNSTACKED_KEY ? 'Unstacked' : g.key
                }
                containers={g.items}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

interface StackBlockProps {
  title: string;
  containers: TargetSummary[];
  onSelect: (t: TargetSummary) => void;
}

/**
 * Subsection header ("stack-name · 3/4 running") + a responsive grid of
 * container rows. 1 col on mobile → 2 on md → 3 on xl keeps dense stacks
 * readable without shrinking the rows on small screens.
 */
function StackBlock({ title, containers, onSelect }: StackBlockProps) {
  const running = containers.filter((c) => c.status === 'online').length;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 pt-3 border-t border-border/60">
        <div className="flex items-center gap-2">
          <span className="h-px w-4 bg-accent-cyan/50" />
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-text">
            {title}
          </span>
        </div>
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
          {running}/{containers.length} running
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {containers.map((c) => (
          <DockerContainerRow key={c.id} target={c} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
