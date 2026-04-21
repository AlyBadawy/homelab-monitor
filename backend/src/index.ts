import dotenv from "dotenv";

import { createApp } from "./app/createApp";
import { loadConfig } from "./app/loadConfig";
import { initDb } from "./db";
import { PollerManager } from "./pollers/pollerManager";
import { LogLevel, logToConsole } from "./utils/logger";
import { shutdownApp } from "./app/shutdownApp";

dotenv.config();

const cfg = loadConfig();

initDb({
  dataDir: cfg.dataDir,
  retentionMs: cfg.historyRetentionMs,
});

const app = createApp();

const pollers = new PollerManager();
pollers.startAll();

const server = app.listen(cfg.port, () => {
  logToConsole(
    LogLevel.info,
    `[homelab-monitor] backend listening on :${cfg.port}`,
  );
});

process.on("SIGTERM", () => shutdownApp(server, pollers, "SIGTERM"));
process.on("SIGINT", () => shutdownApp(server, pollers, "SIGINT"));
