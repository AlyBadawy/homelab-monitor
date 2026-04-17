import { Router, Request, Response } from 'express';
import { history } from '../db';
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
 * 24h history for one target + metric. Used by Chunk 7's sparklines.
 */
router.get('/history/:targetId/:metric', (req: Request, res: Response) => {
  const { targetId, metric } = req.params;
  const points = history(targetId, metric);
  res.json({ targetId, metric, points });
});

export default router;
