/**
 * CRUD over the `service_checks` table. Kept tiny and synchronous — better-sqlite3
 * is fast enough that the HTTP routes can call straight into this without a
 * promise wrapper.
 */

import { randomUUID } from 'crypto';
import { getDb } from '../db';

export interface ServiceCheck {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  /** null = treat any 2xx as healthy. */
  expectedStatus: number | null;
  timeoutMs: number;
  insecureTls: boolean;
  createdAt: number;
}

interface Row {
  id: string;
  name: string;
  url: string;
  enabled: number;
  expected_status: number | null;
  timeout_ms: number;
  insecure_tls: number;
  created_at: number;
}

function rowToCheck(r: Row): ServiceCheck {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    enabled: r.enabled === 1,
    expectedStatus: r.expected_status,
    timeoutMs: r.timeout_ms,
    insecureTls: r.insecure_tls === 1,
    createdAt: r.created_at,
  };
}

export function listChecks(): ServiceCheck[] {
  const rows = getDb()
    .prepare('SELECT * FROM service_checks ORDER BY name ASC')
    .all() as Row[];
  return rows.map(rowToCheck);
}

export function listEnabledChecks(): ServiceCheck[] {
  const rows = getDb()
    .prepare('SELECT * FROM service_checks WHERE enabled = 1 ORDER BY name ASC')
    .all() as Row[];
  return rows.map(rowToCheck);
}

export function getCheck(id: string): ServiceCheck | null {
  const r = getDb()
    .prepare('SELECT * FROM service_checks WHERE id = ?')
    .get(id) as Row | undefined;
  return r ? rowToCheck(r) : null;
}

export interface CreateCheckInput {
  name: string;
  url: string;
  expectedStatus?: number | null;
  timeoutMs?: number;
  insecureTls?: boolean;
  enabled?: boolean;
}

export function createCheck(input: CreateCheckInput): ServiceCheck {
  const id = randomUUID();
  const createdAt = Date.now();
  const row: ServiceCheck = {
    id,
    name: input.name.trim(),
    url: input.url.trim(),
    enabled: input.enabled ?? true,
    expectedStatus: input.expectedStatus ?? null,
    timeoutMs: input.timeoutMs ?? 5000,
    insecureTls: input.insecureTls ?? false,
    createdAt,
  };
  getDb()
    .prepare(
      `INSERT INTO service_checks
         (id, name, url, enabled, expected_status, timeout_ms, insecure_tls, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.name,
      row.url,
      row.enabled ? 1 : 0,
      row.expectedStatus,
      row.timeoutMs,
      row.insecureTls ? 1 : 0,
      row.createdAt,
    );
  return row;
}

export interface UpdateCheckInput {
  name?: string;
  url?: string;
  enabled?: boolean;
  expectedStatus?: number | null;
  timeoutMs?: number;
  insecureTls?: boolean;
}

/**
 * Partial update. Returns the updated check, or null if the id doesn't exist.
 */
export function updateCheck(
  id: string,
  input: UpdateCheckInput,
): ServiceCheck | null {
  const existing = getCheck(id);
  if (!existing) return null;
  const next: ServiceCheck = {
    ...existing,
    ...input,
    // Guard against partial updates nulling out optional numerics unintentionally.
    expectedStatus:
      input.expectedStatus === undefined
        ? existing.expectedStatus
        : input.expectedStatus,
    name: input.name?.trim() ?? existing.name,
    url: input.url?.trim() ?? existing.url,
  };
  getDb()
    .prepare(
      `UPDATE service_checks
         SET name = ?, url = ?, enabled = ?, expected_status = ?,
             timeout_ms = ?, insecure_tls = ?
       WHERE id = ?`,
    )
    .run(
      next.name,
      next.url,
      next.enabled ? 1 : 0,
      next.expectedStatus,
      next.timeoutMs,
      next.insecureTls ? 1 : 0,
      id,
    );
  return next;
}

export function deleteCheck(id: string): boolean {
  const info = getDb()
    .prepare('DELETE FROM service_checks WHERE id = ?')
    .run(id);
  return info.changes > 0;
}
