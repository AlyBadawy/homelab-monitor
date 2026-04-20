import { useMemo } from "react";
import {
  Server,
  Cpu,
  Box,
  Database,
  HardDrive,
  HardDriveDownload,
  ArrowDownToLine,
  ArrowUpFromLine,
  Archive,
  Clock,
  Thermometer,
  Globe,
  Gauge,
  Cloud,
  Image as ImageIcon,
  Expand,
  type LucideIcon,
} from "lucide-react";
import type { TargetSummary, TargetKind } from "../lib/api";
import { StatusPill } from "./StatusPill";
import { MetricBar } from "./MetricBar";
import { StoragePoolList } from "./StoragePoolList";
import { DrivesTable } from "./DrivesTable";
import { MiniStat } from "./MiniStat";
import { Sparkline } from "./Sparkline";
import { useHistory } from "../lib/useHistory";
import { fmtRate, fmtUptime } from "../lib/format";

const KIND_ICON: Record<TargetKind, LucideIcon> = {
  "proxmox-host": Server,
  vm: Cpu,
  container: Box,
  "docker-container": Box,
  database: Database,
  storage: HardDrive,
  unas: HardDriveDownload,
  service: Globe,
  nextcloud: Cloud,
  immich: ImageIcon,
};

const KIND_LABEL: Record<TargetKind, string> = {
  "proxmox-host": "HYPERVISOR",
  vm: "VM",
  container: "CONTAINER",
  "docker-container": "DOCKER",
  database: "DATABASE",
  storage: "STORAGE",
  unas: "UNAS",
  service: "SERVICE",
  nextcloud: "NEXTCLOUD",
  immich: "IMMICH",
};

interface TargetCardProps {
  target: TargetSummary;
  /** Called when the user clicks the card to open the detail drawer. */
  onSelect?: (target: TargetSummary) => void;
}

export function TargetCard({ target, onSelect }: TargetCardProps) {
  const Icon = KIND_ICON[target.kind];
  const isHost = target.kind === "proxmox-host";
  const isUnas = target.kind === "unas";
  const isService = target.kind === "service";
  const isDocker = target.kind === "docker-container";
  const showMiniStats =
    target.kind === "vm" ||
    target.kind === "container" ||
    target.kind === "docker-container";

  // Metrics we care about per-card — kept lean for the inline sparklines.
  // Disk is intentionally NOT fetched here for VMs/LXCs because (a) the disk
  // MetricBar is already a bar-graph and (b) it keeps the per-card request
  // small. The detail drawer fetches the full set.
  const metrics = useMemo(() => {
    if (isService) return ["http_latency_ms"];
    const m = ["cpu_pct", "mem_pct"];
    if (showMiniStats) {
      m.push("net_in_bps", "net_out_bps");
    }
    // Host-style cards (Proxmox/UNAS) also plot a 24h CPU temp sparkline
    // inside the CPU Temp MiniStat. Drivers of this extra history request:
    //   - UNAS:      cpu_temp_c recorded from /sys/class/thermal/*
    //   - Proxmox:   cpu_temp_c recorded from PVE's thermalstate field
    if (isHost || isUnas) {
      m.push("cpu_temp_c");
    }
    return m;
  }, [showMiniStats, isService, isHost, isUnas]);

  const { series } = useHistory(target.id, metrics, {
    points: 120, // sparkline-sized
    refreshMs: 30_000, // history changes slowly, poll less often than summary
  });

  const cpuPoints = series.cpu_pct ?? [];
  const memPoints = series.mem_pct ?? [];
  const netInPoints = series.net_in_bps ?? [];
  const netOutPoints = series.net_out_bps ?? [];
  const cpuTempPoints = series.cpu_temp_c ?? [];

  // Shared y-domain for the combined net sparkline so in/out are comparable.
  const netDomain = useMemo<[number, number] | undefined>(() => {
    if (netInPoints.length < 2 && netOutPoints.length < 2) return undefined;
    let max = 0;
    for (const p of netInPoints) if (p.value > max) max = p.value;
    for (const p of netOutPoints) if (p.value > max) max = p.value;
    if (max <= 0) return [0, 1];
    return [0, max];
  }, [netInPoints, netOutPoints]);

  const clickable = !!onSelect;
  const handleOpen = () => onSelect?.(target);

  return (
    <div
      className={`card group ${
        clickable ? "cursor-pointer focus-within:border-border-strong" : ""
      }`}
      onClick={clickable ? handleOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleOpen();
              }
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Open history for ${target.name}` : undefined}
    >
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
        <div className="flex items-center gap-2">
          <StatusPill status={target.status} />
          {clickable && (
            <Expand
              className="h-3.5 w-3.5 text-text-dim opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          )}
        </div>
      </div>

      {!isService && (
        <div className="space-y-3 flex items-center justify-between gap-3">
          <MetricBar
            label="CPU"
            value={target.cpuPct}
            sparkline={
              <Sparkline
                points={cpuPoints}
                width={80}
                height={14}
                domain={[0, 100]}
                stroke="#22d3ee"
                fill="rgba(34, 211, 238, 0.12)"
                ariaLabel="CPU history"
              />
            }
          />
          <MetricBar
            label="Memory"
            value={target.memPct}
            sparkline={
              <Sparkline
                points={memPoints}
                width={80}
                height={14}
                domain={[0, 100]}
                stroke="#34d399"
                fill="rgba(52, 211, 153, 0.12)"
                ariaLabel="Memory history"
              />
            }
          />
          {!isHost && !isUnas && !isDocker && (
            <MetricBar
              label="Disk"
              value={target.diskPct}
              unavailableReason={target.diskUnavailableReason}
            />
          )}
        </div>
      )}

      {isService && (
        <ServiceBody
          target={target}
          latencyPoints={series.http_latency_ms ?? []}
        />
      )}

      {showMiniStats && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat
              icon={ArrowDownToLine}
              label="Net In"
              value={fmtRate(target.netInBps)}
              tone="cyan"
              title="Current download rate"
            />
            <MiniStat
              icon={ArrowUpFromLine}
              label="Net Out"
              value={fmtRate(target.netOutBps)}
              tone="emerald"
              title="Current upload rate"
            />
            {!isDocker && (
              <MiniStat
                icon={Archive}
                label="Backups"
                value={
                  target.backupCount === null ||
                  target.backupCount === undefined
                    ? "—"
                    : String(target.backupCount)
                }
                tone={
                  target.backupCount && target.backupCount > 0
                    ? "muted"
                    : "amber"
                }
                title="Backups found across all backup-content storages"
              />
            )}
            <MiniStat
              icon={Clock}
              label="Uptime"
              value={fmtUptime(target.uptimeSec)}
              tone="muted"
            />
          </div>

          {/* Combined net-rate sparkline — in (cyan) + out (emerald) overlaid. */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
                Net rate · 24h
              </span>
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
                <span className="text-accent-cyan">in</span>
                <span className="mx-1">/</span>
                <span className="text-accent-emerald">out</span>
              </span>
            </div>
            <div className="relative h-7 w-full">
              <div className="absolute inset-0">
                <Sparkline
                  points={netInPoints}
                  width={400}
                  height={28}
                  baselineZero
                  domain={netDomain}
                  stroke="#22d3ee"
                  fill="rgba(34, 211, 238, 0.10)"
                  strokeWidth={1.25}
                  className="h-full w-full"
                  ariaLabel="Network in history"
                />
              </div>
              <div className="absolute inset-0">
                <Sparkline
                  points={netOutPoints}
                  width={400}
                  height={28}
                  baselineZero
                  domain={netDomain}
                  stroke="#34d399"
                  strokeWidth={1.25}
                  className="h-full w-full"
                  ariaLabel="Network out history"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {(isHost || isUnas) && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat
              icon={Thermometer}
              label="CPU Temp"
              value={
                target.cpuTempC === null || target.cpuTempC === undefined
                  ? "—"
                  : `${target.cpuTempC.toFixed(0)}°C`
              }
              tone={
                target.cpuTempC && target.cpuTempC >= 75
                  ? "rose"
                  : target.cpuTempC && target.cpuTempC >= 65
                    ? "amber"
                    : "muted"
              }
              title={
                isUnas
                  ? "Max temperature across thermal zones"
                  : "Max CPU-package/core temperature from PVE sensors"
              }
              sparklinePoints={cpuTempPoints}
              sparklineAriaLabel="CPU temperature 24h trend"
            />
            <MiniStat
              icon={Clock}
              label="Uptime"
              value={fmtUptime(target.uptimeSec)}
              tone="muted"
            />
          </div>
        </div>
      )}

      {isHost && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
            Storage Pools
          </div>
          <StoragePoolList pools={target.storages ?? []} />
        </div>
      )}

      {isUnas && (
        <>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
              Storage Pools
            </div>
            <StoragePoolList pools={target.storages ?? []} />
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
              Drives
            </div>
            <DrivesTable targetId={target.id} drives={target.drives ?? []} />
          </div>
        </>
      )}

      {!showMiniStats && !isHost && !isUnas && !isService && (
        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
            Uptime
          </span>
          <span className="font-mono text-xs text-text-muted">
            {fmtUptime(target.uptimeSec)}
          </span>
        </div>
      )}

      {target.error && (
        <div className="mt-3 rounded-md border border-accent-rose/30 bg-accent-rose/5 px-2 py-1.5 font-mono text-[0.7rem] text-accent-rose">
          {target.error}
        </div>
      )}
    </div>
  );
}

/* ---------------- service kind ---------------- */

function latencyTone(
  ms: number | null | undefined,
): "muted" | "amber" | "rose" {
  if (ms === null || ms === undefined) return "muted";
  if (ms >= 2000) return "rose";
  if (ms >= 750) return "amber";
  return "muted";
}

interface ServiceBodyProps {
  target: TargetSummary;
  latencyPoints: Array<{ ts: number; value: number }>;
}

function ServiceBody({ target, latencyPoints }: ServiceBodyProps) {
  const statusCode = target.httpStatusCode;
  const latency = target.latencyMs;
  return (
    <>
      {target.url && (
        <div
          className="mb-3 font-mono text-[0.7rem] text-text-dim truncate"
          title={target.url}
        >
          {target.url}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <MiniStat
          icon={Gauge}
          label="Latency"
          value={
            latency === null || latency === undefined ? "—" : `${latency} ms`
          }
          tone={latencyTone(latency)}
          title="Wall-clock time of the last GET"
        />
        <MiniStat
          icon={Globe}
          label="HTTP"
          value={
            statusCode === null || statusCode === undefined
              ? "—"
              : String(statusCode)
          }
          tone={
            statusCode === null || statusCode === undefined
              ? "rose"
              : statusCode >= 200 && statusCode < 300
                ? "emerald"
                : "rose"
          }
          title="Last response status code"
        />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-text-dim">
            Latency · 24h
          </span>
        </div>
        <Sparkline
          points={latencyPoints}
          width={400}
          height={28}
          baselineZero
          stroke="#a78bfa"
          fill="rgba(167, 139, 250, 0.10)"
          strokeWidth={1.25}
          className="h-7 w-full"
          ariaLabel="Latency history"
        />
      </div>
    </>
  );
}
