import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { loadConfig } from './config';
import { closeDb, initDb } from './db';
import statsRouter from './routes/stats';
import servicesRouter from './routes/services';
import { ProxmoxPoller } from './proxmox/poller';
import { UnasPoller } from './unas/poller';
import { PortainerPoller } from './portainer/poller';
import { NextcloudPoller } from './nextcloud/poller';
import { ImmichPoller } from './immich/poller';
import { ServiceHealthPoller } from './services/poller';
import { listChecks } from './services/repo';

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
    portainer: cfg.portainer.enabled ? 'enabled' : 'disabled',
    nextcloud: cfg.nextcloud.enabled ? 'enabled' : 'disabled',
    immich: cfg.immich.enabled ? 'enabled' : 'disabled',
  });
});

app.use('/api/stats', statsRouter);
app.use('/api/services', servicesRouter);

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

let portainerPoller: PortainerPoller | null = null;
if (cfg.portainer.enabled) {
  portainerPoller = new PortainerPoller(cfg);
  portainerPoller.start();
  // eslint-disable-next-line no-console
  console.log('[homelab-monitor] portainer poller started');
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[homelab-monitor] portainer disabled (missing PORTAINER_BASE_URL/API_KEY)',
  );
}

let nextcloudPoller: NextcloudPoller | null = null;
if (cfg.nextcloud.enabled) {
  nextcloudPoller = new NextcloudPoller(cfg);
  nextcloudPoller.start();
  // eslint-disable-next-line no-console
  console.log('[homelab-monitor] nextcloud poller started');
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[homelab-monitor] nextcloud disabled (missing NEXTCLOUD_BASE_URL/NEXTCLOUD_TOKEN)',
  );
}

let immichPoller: ImmichPoller | null = null;
if (cfg.immich.enabled) {
  immichPoller = new ImmichPoller(cfg);
  immichPoller.start();
  // eslint-disable-next-line no-console
  console.log('[homelab-monitor] immich poller started');
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '[homelab-monitor] immich disabled (missing IMMICH_BASE_URL/IMMICH_API_KEY)',
  );
}

// Service health poller always runs; if the DB has no checks, it no-ops.
const serviceHealthPoller = new ServiceHealthPoller(cfg);
serviceHealthPoller.start();
// eslint-disable-next-line no-console
console.log(
  `[homelab-monitor] service-health poller started (${listChecks().length} checks)`,
);

const server = app.listen(cfg.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[homelab-monitor] backend listening on :${cfg.port}`);
});

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`[homelab-monitor] ${signal} received, shutting down…`);
  proxmoxPoller?.stop();
  unasPoller?.stop();
  portainerPoller?.stop();
  nextcloudPoller?.stop();
  immichPoller?.stop();
  serviceHealthPoller.stop();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  // Hard timeout in case something hangs.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
