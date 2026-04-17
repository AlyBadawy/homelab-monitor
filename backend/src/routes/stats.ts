import { Router, Request, Response } from 'express';
import { downsample, history, type HistoryPoint } from '../db';
import { getSummary } from '../state';

const router = Router();

/**
 * Flat list of every target the poller has seen so far. If the Proxmox
 * poller hasn't completed its first tick yet, this returns an empty list —
 * the UI handles that by showing "Establishing link…".
 */
router.get('/summary', (_req: Request, res: Response) => {
  res.json(getSummary());
});

/**
 * 24h history for one target + metric. Kept for backward compatibility /
 * direct probing; the UI now prefers the batch endpoint below.
 */
router.get('/history/:targetId/:metric', (req: Request, res: Response) => {
  const { targetId, metric } = req.params;
  const windowMs = parseWindowMs(req.query.windowMs);
  const maxPoints = parseMaxPoints(req.query.points);
  const raw = history(targetId, metric, windowMs);
  const points = maxPoints ? downsample(raw, maxPoints) : raw;
  res.json({ targetId, metric, points });
});

/**
 * Batch history — fetch N metrics for one target in a single round-trip.
 * Example: /api/stats/history/qemu-101?metrics=cpu_pct,mem_pct&points=200
 *
 * Query params:
 *   - metrics   (required) comma-separated metric names
 *   - windowMs  (optional) how far back to query. Default: full 24h retention.
 *   - points    (optional) max points per series (server-side downsample).
 *               Default: 200. Pass 0 to disable downsampling.
 */
router.get('/history/:targetId', (req: Request, res: Response) => {
  const { targetId } = req.params;
  const metricsParam = typeof req.query.metrics === 'string'
    ? req.query.metrics
    : '';
  const metrics = metricsParam
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);

  if (metrics.length === 0) {
    res.status(400).json({ error: 'metrics query param is required' });
    return;
  }

  const windowMs = parseWindowMs(req.query.windowMs);
  const maxPoints = parseMaxPoints(req.query.points);

  const series: Record<string, HistoryPoint[]> = {};
  for (const metric of metrics) {
    const raw = history(targetId, metric, windowMs);
    series[metric] = maxPoints ? downsample(raw, maxPoints) : raw;
  }
  res.json({ targetId, series, generatedAt: Date.now() });
});

function parseWindowMs(v: unknown): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function parseMaxPoints(v: unknown): number {
  if (typeof v !== 'string') return 200;
  const n = Number(v);
  if (!Number.isFinite(n)) return 200;
  if (n === 0) return 0; // 0 = disable downsampling
  if (n < 10) return 10;
  if (n > 5000) return 5000;
  return Math.floor(n);
}

export default router;
