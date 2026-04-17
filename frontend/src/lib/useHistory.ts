import { useEffect, useRef, useState } from 'react';
import { fetchHistory, type HistoryPoint } from './api';

export interface UseHistoryResult {
  series: Record<string, HistoryPoint[]>;
  generatedAt: number | null;
  loading: boolean;
  error: string | null;
  /** Manual refetch (used by the detail drawer's refresh button). */
  refresh: () => void;
}

interface UseHistoryOptions {
  /** Auto-refresh interval in ms. Default 30_000. Pass 0 to disable. */
  refreshMs?: number;
  /** Max points per series (server-side downsample). Default 200. */
  points?: number;
  /** How far back in ms. Default 24h. */
  windowMs?: number;
  /** Skip fetching entirely when false (e.g. lazy-load for drawer). */
  enabled?: boolean;
}

/**
 * Fetch and keep fresh the 24h history for one target + a fixed set of metrics.
 * All metrics are batched into a single request.
 */
export function useHistory(
  targetId: string,
  metrics: string[],
  opts: UseHistoryOptions = {},
): UseHistoryResult {
  const { refreshMs = 30_000, points = 200, windowMs, enabled = true } = opts;

  const [series, setSeries] = useState<Record<string, HistoryPoint[]>>({});
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep metric list stable across renders by joining it — callers typically
  // pass a literal array so this avoids a re-run every render.
  const metricsKey = metrics.join(',');

  // Track the latest request so an in-flight response doesn't overwrite newer state.
  const gen = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (!targetId || metrics.length === 0) return;

    const ctrl = new AbortController();
    const myGen = ++gen.current;

    const run = async () => {
      setLoading(true);
      try {
        const data = await fetchHistory(targetId, metrics, {
          points,
          windowMs,
          signal: ctrl.signal,
        });
        if (gen.current !== myGen) return;
        setSeries(data.series);
        setGeneratedAt(data.generatedAt);
        setError(null);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        if (gen.current !== myGen) return;
        setError((e as Error).message);
      } finally {
        if (gen.current === myGen) setLoading(false);
      }
    };

    void run();

    if (refreshMs > 0) {
      const id = window.setInterval(() => void run(), refreshMs);
      return () => {
        ctrl.abort();
        window.clearInterval(id);
      };
    }
    return () => ctrl.abort();
    // Re-run when target/metrics/window/refresh change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, metricsKey, refreshMs, points, windowMs, enabled]);

  const refresh = () => {
    // Bump gen so the next useEffect invocation is considered latest.
    gen.current++;
    // Trigger a fresh fetch by temporarily flipping a dependency — simplest is
    // to just call fetchHistory directly here.
    const ctrl = new AbortController();
    const myGen = gen.current;
    setLoading(true);
    fetchHistory(targetId, metrics, { points, windowMs, signal: ctrl.signal })
      .then((data) => {
        if (gen.current !== myGen) return;
        setSeries(data.series);
        setGeneratedAt(data.generatedAt);
        setError(null);
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        if (gen.current !== myGen) return;
        setError((e as Error).message);
      })
      .finally(() => {
        if (gen.current === myGen) setLoading(false);
      });
  };

  return { series, generatedAt, loading, error, refresh };
}
