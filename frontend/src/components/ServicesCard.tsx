import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import clsx from 'clsx';
import { Globe, Plus, Trash2, X } from 'lucide-react';
import {
  createServiceCheck,
  deleteServiceCheck,
  listServiceChecks,
  type ServiceCheck,
  type TargetSummary,
} from '../lib/api';
import { useHistory } from '../lib/useHistory';
import { Sparkline } from './Sparkline';
import { UptimeStrip, availabilityPct } from './UptimeStrip';

interface ServicesCardProps {
  targets: TargetSummary[];
}

/**
 * One card for all HTTP service checks.
 *
 * Two layouts sharing the same data hooks:
 *   - lg+ (≥1024px): grid-table with one row per service — latency / status /
 *     uptime / 24h sparkline + strip, all inline.
 *   - Below lg: stacked layout — name/URL on top, badges + mini-charts grouped
 *     in a compact block. No horizontal scroll.
 *
 * The card is the source of truth for the service list (via /api/services).
 * Live metrics flow in through `targets` — a row falls back to "—" when the
 * target hasn't appeared in the summary yet (e.g. just-created, pre-first-poll).
 */
export function ServicesCard({ targets }: ServicesCardProps) {
  const [checks, setChecks] = useState<ServiceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listServiceChecks();
      setChecks(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live state index keyed by check.id (stripping the 'service:' prefix that
  // the poller adds to target IDs).
  const targetById = useMemo(() => {
    const m = new Map<string, TargetSummary>();
    for (const t of targets) {
      if (t.kind !== 'service') continue;
      const id = t.id.startsWith('service:') ? t.id.slice('service:'.length) : t.id;
      m.set(id, t);
    }
    return m;
  }, [targets]);

  return (
    <div className="card col-span-full">
      <div className="flex items-center justify-between gap-3">
        <div className="card-title flex items-center gap-2">
          <Globe className="h-3 w-3" />
          HTTP SERVICES
          {checks.length > 0 && (
            <span className="text-text-dim">· {checks.length}</span>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-accent-cyan/60 hover:text-accent-cyan"
          >
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">Add service</span>
            <span className="sm:hidden">Add</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-accent-rose/40 bg-accent-rose/5 px-3 py-2 font-mono text-xs text-accent-rose">
          {error}
        </div>
      )}

      <div className="mt-3">
        {/* Desktop table header — only visible at lg+. */}
        <ServiceRowGrid header className="hidden lg:grid">
          <HeaderCell>Service</HeaderCell>
          <HeaderCell align="right">Latency</HeaderCell>
          <HeaderCell>Latency · 24h</HeaderCell>
          <HeaderCell align="right">Status</HeaderCell>
          <HeaderCell>Uptime · 24h</HeaderCell>
          <HeaderCell align="right">&nbsp;</HeaderCell>
        </ServiceRowGrid>

        <div className="divide-y divide-border/60">
          {checks.map((check) => (
            <ServiceRow
              key={check.id}
              check={check}
              target={targetById.get(check.id) ?? null}
              onDeleted={() => void refresh()}
            />
          ))}

          {adding && (
            <AddRow
              onCancel={() => setAdding(false)}
              onCreated={() => {
                setAdding(false);
                void refresh();
              }}
            />
          )}

          {!adding && !loading && checks.length === 0 && (
            <div className="py-6 text-center font-mono text-xs text-text-dim">
              no services tracked yet — click "Add service" to start
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- sub-components ---------- */

/**
 * Fixed grid-template for the desktop row. Only renders as a grid at lg+;
 * below that, consumers should render a stacked layout instead.
 */
function ServiceRowGrid({
  children,
  header = false,
  className,
}: {
  children: React.ReactNode;
  header?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        // Grid only kicks in at lg+. Default is unused — consumers that want
        // the grid pass `className="hidden lg:grid"` so it's hidden on mobile.
        'lg:grid lg:items-center lg:gap-x-4 lg:py-2',
        'lg:grid-cols-[minmax(180px,1fr)_70px_140px_60px_180px_40px]',
        header &&
          'lg:border-b lg:border-border-strong lg:pb-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim',
        !header && 'text-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

function HeaderCell({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      {children}
    </div>
  );
}

/**
 * One service's live row. Owns its own history fetch (each row gets latency
 * + availability sparklines independently — simpler than parent-orchestrated
 * batching, and N is small in homelab use).
 *
 * Renders two layouts from the same hook data — the desktop grid-row (only
 * visible at lg+) and a stacked mobile block (only visible below lg).
 */
function ServiceRow({
  check,
  target,
  onDeleted,
}: {
  check: ServiceCheck;
  target: TargetSummary | null;
  onDeleted: () => void;
}) {
  const { series } = useHistory(
    `service:${check.id}`,
    ['http_latency_ms', 'http_up'],
    { points: 300, refreshMs: 30_000 },
  );
  const latency = series.http_latency_ms ?? [];
  const uptime = series.http_up ?? [];
  const avail = availabilityPct(uptime);

  return (
    <div>
      {/* ============ Desktop (≥ lg) ============ */}
      <ServiceRowGrid className="hidden lg:grid">
        {/* Col 1 — name + URL */}
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-text" title={check.name}>
            {check.name}
          </div>
          <div
            className="truncate font-mono text-[0.65rem] text-text-dim"
            title={check.url}
          >
            {check.url}
          </div>
        </div>

        {/* Col 2 — current latency */}
        <div className="text-right font-mono text-xs tabular-nums text-text-muted">
          <LatencyBadge ms={target?.latencyMs ?? null} status={target?.status ?? 'unknown'} />
        </div>

        {/* Col 3 — 24h latency sparkline */}
        <div>
          <Sparkline
            points={latency}
            width={140}
            height={22}
            stroke="rgb(167 139 250)"
            fill="rgba(167, 139, 250, 0.12)"
            baselineZero
            ariaLabel="24 hour latency"
            className="h-[22px] w-full"
          />
        </div>

        {/* Col 4 — current HTTP code */}
        <div className="text-right">
          <HttpCodeBadge code={target?.httpStatusCode ?? null} />
        </div>

        {/* Col 5 — uptime strip + availability % */}
        <div className="flex items-center gap-2 min-w-0">
          <UptimeStrip
            points={uptime}
            width={140}
            height={14}
            className="h-[14px] min-w-0 flex-1"
          />
          <AvailabilityBadge value={avail} />
        </div>

        {/* Col 6 — delete */}
        <div className="text-right">
          <DeleteButton id={check.id} name={check.name} onDeleted={onDeleted} />
        </div>
      </ServiceRowGrid>

      {/* ============ Mobile (< lg) ============ */}
      <div className="lg:hidden py-3 space-y-3">
        {/* Top row: name/URL + delete */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div
              className="truncate font-mono text-sm text-text"
              title={check.name}
            >
              {check.name}
            </div>
            <div
              className="truncate font-mono text-[0.7rem] text-text-dim"
              title={check.url}
            >
              {check.url}
            </div>
          </div>
          <DeleteButton id={check.id} name={check.name} onDeleted={onDeleted} />
        </div>

        {/* Metrics grid — two stats side by side, each with current + mini chart */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MobileMetric label="Latency">
            <div className="flex items-center justify-between gap-2">
              <LatencyBadge ms={target?.latencyMs ?? null} status={target?.status ?? 'unknown'} />
            </div>
            <Sparkline
              points={latency}
              width={300}
              height={22}
              stroke="rgb(167 139 250)"
              fill="rgba(167, 139, 250, 0.12)"
              baselineZero
              ariaLabel="24 hour latency"
              className="mt-1 h-[22px] w-full"
            />
          </MobileMetric>

          <MobileMetric label="Uptime">
            <div className="flex items-center justify-between gap-2">
              <HttpCodeBadge code={target?.httpStatusCode ?? null} />
              <AvailabilityBadge value={avail} />
            </div>
            <UptimeStrip
              points={uptime}
              width={300}
              height={14}
              className="mt-1 h-[14px] w-full"
            />
          </MobileMetric>
        </div>
      </div>
    </div>
  );
}

/** Stacked-layout metric cell: tiny label + children (badges/charts). */
function MobileMetric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Inline creation row. Minimal fields: name + URL. Everything else falls back
 * to backend defaults (30s timeout, accept any 2xx-3xx, real TLS verification).
 * Press Enter in either field to save.
 *
 * Uses its own compact layout rather than the service-row grid — the inputs
 * don't benefit from column alignment and look cleaner stacked.
 */
function AddRow({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) {
      setErr('name and URL are required');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await createServiceCheck({ name: trimmedName, url: trimmedUrl });
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Service name"
            className="w-full rounded border border-border bg-bg-900 px-2 py-1.5 font-mono text-xs text-text placeholder:text-text-dim focus:border-accent-cyan focus:outline-none"
            maxLength={64}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.in.alybadawy.com/"
            className="w-full rounded border border-border bg-bg-900 px-2 py-1.5 font-mono text-[0.7rem] text-text placeholder:text-text-dim focus:border-accent-cyan focus:outline-none"
            type="url"
          />
          {err && (
            <div className="font-mono text-[0.65rem] text-accent-rose">{err}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-1 sm:flex-col sm:items-stretch sm:gap-1.5">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md border border-accent-cyan/60 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-accent-cyan transition-colors hover:bg-accent-cyan/10 disabled:opacity-50"
            title="Save (Enter)"
          >
            {submitting ? '…' : 'save'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-border-strong hover:text-text sm:border-transparent"
            title="Cancel"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5 sm:hidden" />
            <span className="hidden sm:inline">cancel</span>
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * Two-click delete. First click arms the button (turns rose, label flips),
 * second click performs the delete. Auto-disarms after 3s of inactivity so
 * a stray first click doesn't linger and cause an accidental removal later.
 */
function DeleteButton({
  id,
  name,
  onDeleted,
}: {
  id: string;
  name: string;
  onDeleted: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  const disarm = () => {
    setArmed(false);
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => () => disarm(), []);

  const onClick = async () => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    disarm();
    setBusy(true);
    try {
      await deleteServiceCheck(id);
      onDeleted();
    } catch (e) {
      // Surface as alert — this is an operator action so a fallback is fine.
      // eslint-disable-next-line no-alert
      alert(`Failed to delete: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={armed ? `Click again to remove ${name}` : `Stop tracking ${name}`}
      aria-label={armed ? `Confirm delete ${name}` : `Delete ${name}`}
      className={clsx(
        'shrink-0 rounded-md border p-1.5 transition-colors disabled:opacity-50',
        armed
          ? 'border-accent-rose bg-accent-rose/15 text-accent-rose hover:bg-accent-rose/25'
          : 'border-border text-text-muted hover:border-accent-rose/60 hover:text-accent-rose',
      )}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

/* ---------- tiny presentational helpers ---------- */

function LatencyBadge({
  ms,
  status,
}: {
  ms: number | null;
  status: TargetSummary['status'];
}) {
  if (status === 'offline' || status === 'unknown') {
    return <span className="font-mono text-xs tabular-nums text-text-dim">—</span>;
  }
  if (ms === null) return <span className="font-mono text-xs tabular-nums text-text-dim">—</span>;
  const tone =
    ms >= 2000
      ? 'text-accent-rose'
      : ms >= 500
        ? 'text-accent-amber'
        : 'text-text';
  return (
    <span className={clsx('font-mono text-xs tabular-nums', tone)}>
      {Math.round(ms)} ms
    </span>
  );
}

function HttpCodeBadge({ code }: { code: number | null }) {
  if (code === null) {
    return <span className="font-mono text-xs text-text-dim">—</span>;
  }
  const tone =
    code >= 500
      ? 'border-accent-rose/60 text-accent-rose'
      : code >= 400
        ? 'border-accent-amber/60 text-accent-amber'
        : 'border-accent-emerald/50 text-accent-emerald';
  return (
    <span
      className={clsx(
        'inline-block rounded border px-1.5 py-0.5 font-mono text-[0.7rem] tabular-nums',
        tone,
      )}
    >
      {code}
    </span>
  );
}

function AvailabilityBadge({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="font-mono text-[0.65rem] text-text-dim">—</span>
    );
  }
  const pct = value * 100;
  const tone =
    pct >= 99.5
      ? 'text-accent-emerald'
      : pct >= 95
        ? 'text-accent-amber'
        : 'text-accent-rose';
  // 3 decimals feels overprecise; 1 decimal reads like a status page.
  return (
    <span className={clsx('font-mono text-[0.7rem] tabular-nums', tone)}>
      {pct >= 99.95 ? '100' : pct.toFixed(1)}%
    </span>
  );
}
