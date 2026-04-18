import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;
let dataDir: string = '/data';
let retentionMs: number = 24 * 60 * 60 * 1000;
let retentionTimer: NodeJS.Timeout | null = null;

// Prepared statements — created once after the db opens.
let stmtInsert: Database.Statement<[number, string, string, number]>;
let stmtPrune: Database.Statement<[number]>;
let stmtHistory: Database.Statement<[string, string, number]>;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export interface InitDbOptions {
  dataDir?: string;
  retentionMs?: number;
}

export function initDb(opts: InitDbOptions = {}): void {
  dataDir = opts.dataDir ?? dataDir;
  retentionMs = opts.retentionMs ?? retentionMs;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'monitor.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS samples (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          INTEGER NOT NULL,
      target_id   TEXT    NOT NULL,
      metric      TEXT    NOT NULL,
      value       REAL    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_samples_target_metric_ts
      ON samples(target_id, metric, ts DESC);

    CREATE TABLE IF NOT EXISTS service_checks (
      id              TEXT    PRIMARY KEY,
      name            TEXT    NOT NULL,
      url             TEXT    NOT NULL,
      enabled         INTEGER NOT NULL DEFAULT 1,
      expected_status INTEGER,
      timeout_ms      INTEGER NOT NULL DEFAULT 5000,
      insecure_tls    INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL
    );
  `);

  stmtInsert = db.prepare(
    'INSERT INTO samples (ts, target_id, metric, value) VALUES (?, ?, ?, ?)',
  );
  stmtPrune = db.prepare('DELETE FROM samples WHERE ts < ?');
  stmtHistory = db.prepare(
    `SELECT ts, value FROM samples
     WHERE target_id = ? AND metric = ? AND ts >= ?
     ORDER BY ts ASC`,
  );

  // Prune old rows every 5 minutes.
  retentionTimer = setInterval(() => pruneOld(), 5 * 60 * 1000);
  pruneOld();

  // eslint-disable-next-line no-console
  console.log(`[homelab-monitor] sqlite ready at ${dbPath}`);
}

export function closeDb(): void {
  if (retentionTimer) clearInterval(retentionTimer);
  retentionTimer = null;
  db?.close();
  db = null;
}

export function recordSample(
  targetId: string,
  metric: string,
  value: number,
  ts: number = Date.now(),
): void {
  if (!db) return;
  if (!Number.isFinite(value)) return;
  stmtInsert.run(ts, targetId, metric, value);
}

export function pruneOld(): void {
  if (!db) return;
  const cutoff = Date.now() - retentionMs;
  const info = stmtPrune.run(cutoff);
  if (info.changes > 0) {
    // eslint-disable-next-line no-console
    console.log(`[homelab-monitor] pruned ${info.changes} rows older than 24h`);
  }
}

export interface HistoryPoint {
  ts: number;
  value: number;
}

export function history(
  targetId: string,
  metric: string,
  windowMs: number = retentionMs,
): HistoryPoint[] {
  if (!db) return [];
  const since = Date.now() - windowMs;
  return stmtHistory.all(targetId, metric, since) as HistoryPoint[];
}

/**
 * Downsample a monotonically-timestamped series to at most `maxPoints` points
 * using equal-width time buckets and averaging the value inside each bucket.
 * Cheap, deterministic, and good enough for sparkline rendering. For series
 * shorter than maxPoints we just return the raw points.
 */
export function downsample(
  points: HistoryPoint[],
  maxPoints: number,
): HistoryPoint[] {
  if (!Number.isFinite(maxPoints) || maxPoints <= 0) return points;
  if (points.length <= maxPoints) return points;
  const first = points[0].ts;
  const last = points[points.length - 1].ts;
  const span = last - first;
  if (span <= 0) return points.slice(-maxPoints);
  const bucketSize = span / maxPoints;
  const buckets: Array<{ sum: number; count: number; tsSum: number }> =
    Array.from({ length: maxPoints }, () => ({ sum: 0, count: 0, tsSum: 0 }));
  for (const p of points) {
    let idx = Math.floor((p.ts - first) / bucketSize);
    if (idx >= maxPoints) idx = maxPoints - 1;
    if (idx < 0) idx = 0;
    buckets[idx].sum += p.value;
    buckets[idx].count += 1;
    buckets[idx].tsSum += p.ts;
  }
  const out: HistoryPoint[] = [];
  for (const b of buckets) {
    if (b.count === 0) continue;
    out.push({ ts: Math.round(b.tsSum / b.count), value: b.sum / b.count });
  }
  return out;
}
