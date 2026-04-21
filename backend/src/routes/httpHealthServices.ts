/**
 * CRUD over HTTP service health checks. The ServiceHealthPoller reads from
 * the same repo on each tick, so creates/updates take effect on the next
 * poll cycle without any extra wiring.
 */

import { Router, Request, Response } from "express";
import {
  createCheck,
  deleteCheck,
  getCheck,
  listChecks,
  updateCheck,
} from "../pollers/httpHealth/repo";

const httpHealthServicesRouter = Router();

function isValidHttpUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.trim().length === 0) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function clampTimeout(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  // Keep probes short — nothing the dashboard cares about should take >60s.
  return Math.max(500, Math.min(60_000, Math.round(n)));
}

httpHealthServicesRouter.get("/", (_req: Request, res: Response) => {
  res.json({ checks: listChecks() });
});

httpHealthServicesRouter.get("/:id", (req: Request, res: Response) => {
  const c = getCheck(req.params.id);
  if (!c) return res.status(404).json({ error: "not_found" });
  res.json(c);
});

httpHealthServicesRouter.post("/", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length === 0) {
    return res.status(400).json({ error: "name_required" });
  }
  if (!isValidHttpUrl(body.url)) {
    return res.status(400).json({ error: "invalid_url" });
  }
  let expectedStatus: number | null | undefined;
  if (body.expectedStatus === null || body.expectedStatus === undefined) {
    expectedStatus = null;
  } else {
    const n = Number(body.expectedStatus);
    if (!Number.isFinite(n) || n < 100 || n > 599) {
      return res.status(400).json({ error: "invalid_expected_status" });
    }
    expectedStatus = n;
  }
  const created = createCheck({
    name,
    url: body.url as string,
    expectedStatus,
    timeoutMs: clampTimeout(body.timeoutMs),
    insecureTls: body.insecureTls === true,
    enabled: body.enabled === undefined ? true : body.enabled === true,
  });
  res.status(201).json(created);
});

httpHealthServicesRouter.patch("/:id", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: Parameters<typeof updateCheck>[1] = {};
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    patch.name = body.name.trim();
  }
  if (body.url !== undefined) {
    if (!isValidHttpUrl(body.url)) {
      return res.status(400).json({ error: "invalid_url" });
    }
    patch.url = body.url as string;
  }
  if (body.enabled !== undefined) {
    patch.enabled = body.enabled === true;
  }
  if (body.expectedStatus !== undefined) {
    if (body.expectedStatus === null) {
      patch.expectedStatus = null;
    } else {
      const n = Number(body.expectedStatus);
      if (!Number.isFinite(n) || n < 100 || n > 599) {
        return res.status(400).json({ error: "invalid_expected_status" });
      }
      patch.expectedStatus = n;
    }
  }
  if (body.timeoutMs !== undefined) {
    const t = clampTimeout(body.timeoutMs);
    if (t === undefined) {
      return res.status(400).json({ error: "invalid_timeout" });
    }
    patch.timeoutMs = t;
  }
  if (body.insecureTls !== undefined) {
    patch.insecureTls = body.insecureTls === true;
  }
  const updated = updateCheck(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "not_found" });
  res.json(updated);
});

httpHealthServicesRouter.delete("/:id", (req: Request, res: Response) => {
  const ok = deleteCheck(req.params.id);
  if (!ok) return res.status(404).json({ error: "not_found" });
  res.status(204).end();
});

export default httpHealthServicesRouter;
