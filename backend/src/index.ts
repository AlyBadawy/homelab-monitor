import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { loadConfig } from './config';
import { closeDb, initDb } from './db';
import statsRouter from './routes/stats';
import { ProxmoxPoller } from './proxmox/poller';
import { UnasPoller } from './unas/poller';

dotenv.config();

const cfg = loadConfig();

initDb({ dataDir: cfg.dataDir, retentionMs: cfg.historyRetentionMs });

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    proxmox: cfg.proxmox.enabled ? 'enabled' : 'disabled',
    unas: cfg.unas.enabled ? 'enabled' : 'disabled',
  });
});

app.use('/api/stats', statsRouter);

// --- Pollers ---
let proxmoxPoller: ProxmoxPoller | null = null;
if (cfg.proxmox.enabled) {
  proxmoxPoller = new ProxmoxPoller(cfg);
  proxmoxPoller.start();
  // eslint-disable-next-line no-console
  console.log('[homelab-monitor] proxmox poller started');
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[homelab-monitor] proxmox disabled (missing PROXMOX_BASE_URL/TOKEN_ID/TOKEN_SECRET)',
  );
}

let unasPoller: UnasPoller | null = null;
if (cfg.unas.enabled) {
  unasPoller = new UnasPoller(cfg);
  unasPoller.start();
  // eslint-disable-next-line no-console
  console.log('[homelab-monitor] unas poller started');
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[homelab-monitor] unas disabled (missing UNAS_HOST/UNAS_USER and a credential)',
  );
}

const server = app.listen(cfg.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[homelab-monitor] backend listening on :${cfg.port}`);
});

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`[homelab-monitor] ${signal} received, shutting down…`);
  proxmoxPoller?.stop();
  unasPoller?.stop();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  // Hard timeout in case something hangs.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
