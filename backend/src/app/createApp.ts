import express from "express";
import cors from "cors";
import statsRouter from "../routes/stats";
import httpHealthServicesRouter from "../routes/httpHealthServices";
import { loadConfig } from "./loadConfig";

export function createApp() {
  const cfg = loadConfig();
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSec: Math.round(process.uptime()),
      proxmox: cfg.proxmox.enabled ? "enabled" : "disabled",
      unas: cfg.unas.enabled ? "enabled" : "disabled",
      portainer: cfg.portainer.enabled ? "enabled" : "disabled",
      nextcloud: cfg.nextcloud.enabled ? "enabled" : "disabled",
      immich: cfg.immich.enabled ? "enabled" : "disabled",
    });
  });

  app.use("/api/stats", statsRouter); // stats received from the pollers
  app.use("/api/services", httpHealthServicesRouter); // CRUD api endpoint for the Http Service Health poller

  return app;
}
