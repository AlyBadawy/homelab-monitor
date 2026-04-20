import clsx from 'clsx';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Globe,
  Router,
  Zap,
} from 'lucide-react';
import { Section } from '../components/Section';
import { MiniStat } from '../components/MiniStat';

/**
 * UniFi network overview — placeholder card.
 *
 * Visual stub for the eventual UniFi integration. Once a UniFi poller ships,
 * this card's contents will be fed from real data (router state, WAN IP,
 * throughput, per-port link speeds). Today every live value renders as "—"
 * and every port is `TBD`, but the layout matches the final shape so the
 * integration work is a data-swap, not a redesign.
 *
 * Layout:
 *   header      — Router icon + name + TBD badge
 *   stats row   — External IP / Downlink / Uplink (MiniStat, 3-up on md+)
 *   ports       — Router: 5 ports (WAN + 4 LAN), Switch: 10 ports
 *                 Each port is a compact chip showing its label and a dimmed
 *                 TBD dot. When link state data arrives it will drive the
 *                 dot color + a small speed label underneath.
 */
export function UnifiSection() {
  return (
    <Section title="UniFi Network">
      <div className="card">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-border bg-bg-700 p-2 text-accent-cyan">
              <Router className="h-4 w-4" />
            </div>
            <div>
              <div className="card-title">UNIFI · ROUTER + SWITCH</div>
              <div className="font-semibold text-text">Gateway</div>
            </div>
          </div>
          <span className="rounded-md border border-border bg-bg-800/60 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
            TBD
          </span>
        </div>

        {/* External IP + throughput — all placeholders today. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <MiniStat
            icon={Globe}
            label="External IP"
            value="—"
            tone="muted"
            title="WAN IP (from UniFi router) — not wired yet"
          />
          <MiniStat
            icon={ArrowDownToLine}
            label="Downlink"
            value="—"
            tone="cyan"
            title="Aggregate WAN download rate — not wired yet"
          />
          <MiniStat
            icon={ArrowUpFromLine}
            label="Uplink"
            value="—"
            tone="emerald"
            title="Aggregate WAN upload rate — not wired yet"
          />
        </div>

        {/* Router ports (5) */}
        <div className="mt-4 pt-3 border-t border-border">
          <div className="mb-2 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
            <Router className="h-3 w-3" />
            Router · 5 ports
          </div>
          <PortGrid ports={ROUTER_PORTS} />
        </div>

        {/* Switch ports (10) */}
        <div className="mt-4 pt-3 border-t border-border">
          <div className="mb-2 flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
            <Zap className="h-3 w-3" />
            Switch · 10 ports
          </div>
          <PortGrid ports={SWITCH_PORTS} />
        </div>
      </div>
    </Section>
  );
}

/* ---------------- ports ---------------- */

interface PortSpec {
  label: string;
  sub?: string;
}

const ROUTER_PORTS: PortSpec[] = [
  { label: 'WAN', sub: 'uplink' },
  { label: 'LAN 1' },
  { label: 'LAN 2' },
  { label: 'LAN 3' },
  { label: 'LAN 4' },
];

const SWITCH_PORTS: PortSpec[] = Array.from({ length: 10 }, (_, i) => ({
  label: `P${i + 1}`,
}));

function PortGrid({ ports }: { ports: PortSpec[] }) {
  // 5 ports on mobile (router fits on one row), 10 on md+ for the switch.
  // Using grid-cols-5 at all breakpoints keeps router + switch visually
  // aligned: router is 1 row of 5, switch is 2 rows of 5.
  return (
    <div className="grid grid-cols-5 gap-2">
      {ports.map((p) => (
        <PortChip key={p.label} label={p.label} sub={p.sub} />
      ))}
    </div>
  );
}

function PortChip({ label, sub }: PortSpec) {
  return (
    <div
      className={clsx(
        'rounded-md border border-border bg-bg-800/60 px-2 py-1.5 opacity-60',
        'flex flex-col items-start gap-0.5',
      )}
      title="Link state not wired yet"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-text-dim/40" aria-hidden />
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text">
          {label}
        </span>
      </div>
      <span className="font-mono text-[0.55rem] uppercase tracking-[0.18em] text-text-dim">
        {sub ?? 'TBD'}
      </span>
    </div>
  );
}
