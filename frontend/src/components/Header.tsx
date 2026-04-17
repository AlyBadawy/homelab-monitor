import { Activity, RefreshCcw } from "lucide-react";
import { fmtRelative } from "../lib/format";

interface HeaderProps {
  lastUpdated: number | null;
  onRefresh: () => void;
  loading: boolean;
}

export function Header({ lastUpdated, onRefresh, loading }: HeaderProps) {
  return (
    <header className="relative z-10 border-b border-border bg-bg-900/80 backdrop-blur">
      <div className="mx-auto max-w-[1600px] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Activity className="h-6 w-6 text-accent-cyan" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent-emerald animate-pulse" />
          </div>
          <div>
            <h1 className="font-mono text-sm uppercase tracking-[0.24em] text-text">
              Homelab <span className="text-accent-cyan">Monitor</span>
            </h1>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-dim">
              SA Cloud - Monitor Dashboard
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right font-mono text-[0.7rem] uppercase tracking-[0.2em] text-text-muted">
            <div>last sync</div>
            <div className="text-text">
              {lastUpdated === null ? "—" : fmtRelative(lastUpdated)}
            </div>
          </div>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-800 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-text-muted transition hover:border-accent-cyan hover:text-accent-cyan disabled:opacity-50"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>
    </header>
  );
}
