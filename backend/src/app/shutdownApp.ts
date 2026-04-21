import { IncomingMessage, Server, ServerResponse } from "node:http";
import { closeDb } from "../db";
import { PollerManager } from "../pollers/pollerManager";
import { LogLevel, logToConsole } from "../utils/logger";

export function shutdownApp(
  server: Server<typeof IncomingMessage, typeof ServerResponse>,
  pollers: PollerManager,
  signal: string,
) {
  logToConsole(
    LogLevel.info,
    `[homelab-monitor] ${signal} received, shutting down…`,
  );

  pollers.stopAll();

  server.close(() => {
    closeDb();
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 5000).unref();
}
