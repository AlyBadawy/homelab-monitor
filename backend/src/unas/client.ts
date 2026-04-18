import { existsSync, readFileSync } from 'node:fs';
import { Client, type ConnectConfig } from 'ssh2';
import type { UnasConfig } from '../config';

/**
 * Thin SSH wrapper for UNAS. Each poll opens a short-lived connection,
 * runs a batch of read-only commands, and closes. No persistent sessions,
 * no scripts deployed on the UNAS.
 *
 * We deliberately don't pool connections — the poll cadence is 10s and the
 * cost of a fresh handshake is negligible compared to the clarity win of
 * not having to worry about stale sockets after sleep/network blips.
 */

/** Result of a single exec — captured stdout + exit code. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export class UnasClient {
  private readonly cfg: UnasConfig;
  private readonly privateKey: Buffer | null;

  constructor(cfg: UnasConfig) {
    this.cfg = cfg;
    // Read the key lazily-ish: only if the path was supplied AND the file
    // actually exists. When the user is doing password auth, the compose
    // default still seeds UNAS_SSH_KEY_PATH, so "exists" is the deciding
    // factor. A bare password + missing key file falls back cleanly to
    // password auth below.
    if (cfg.privateKeyPath && existsSync(cfg.privateKeyPath)) {
      this.privateKey = readFileSync(cfg.privateKeyPath);
    } else {
      this.privateKey = null;
      if (cfg.privateKeyPath && !cfg.password) {
        // Neither a reachable key nor a password — we'll fail at connect
        // time with a clearer message, rather than at boot.
        // eslint-disable-next-line no-console
        console.warn(
          `[homelab-monitor] unas: key path '${cfg.privateKeyPath}' not found ` +
            `and no UNAS_PASSWORD set — connections will fail until fixed`,
        );
      }
    }
  }

  /** Connect, run a batch of commands sequentially, disconnect. */
  async runBatch(commands: string[]): Promise<ExecResult[]> {
    const conn = new Client();
    const connectCfg: ConnectConfig = {
      host: this.cfg.host,
      port: this.cfg.port,
      username: this.cfg.user,
      readyTimeout: 8000,
      // Only support the newer hashes — openssh defaults.
      algorithms: {
        serverHostKey: [
          'ssh-ed25519',
          'ecdsa-sha2-nistp256',
          'ecdsa-sha2-nistp384',
          'ecdsa-sha2-nistp521',
          'rsa-sha2-512',
          'rsa-sha2-256',
        ],
      },
    };

    if (this.privateKey) {
      connectCfg.privateKey = this.privateKey;
      if (this.cfg.passphrase) connectCfg.passphrase = this.cfg.passphrase;
    } else if (this.cfg.password) {
      connectCfg.password = this.cfg.password;
    } else {
      throw new Error('unas: no SSH credentials configured (need key or password)');
    }

    return new Promise<ExecResult[]>((resolve, reject) => {
      const results: ExecResult[] = [];
      let done = false;

      const finish = (err: Error | null): void => {
        if (done) return;
        done = true;
        try { conn.end(); } catch { /* already closed */ }
        if (err) reject(err);
        else resolve(results);
      };

      // Hard ceiling — any network hiccup shouldn't wedge the poller.
      const timeout = setTimeout(
        () => finish(new Error(`unas: batch timed out after ${this.cfg.execTimeoutMs}ms`)),
        this.cfg.execTimeoutMs,
      );

      conn.once('ready', async () => {
        try {
          for (const cmd of commands) {
            results.push(await execOnce(conn, cmd));
          }
          clearTimeout(timeout);
          finish(null);
        } catch (e) {
          clearTimeout(timeout);
          finish(e instanceof Error ? e : new Error(String(e)));
        }
      });

      conn.once('error', (err) => {
        clearTimeout(timeout);
        finish(err instanceof Error ? err : new Error(String(err)));
      });

      conn.connect(connectCfg);
    });
  }
}

function execOnce(conn: Client, cmd: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      let code: number | null = null;

      stream.on('data', (chunk: Buffer | string) => {
        stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      });
      stream.stderr.on('data', (chunk: Buffer | string) => {
        stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      });
      stream.on('close', (exitCode: number | null) => {
        code = exitCode;
        resolve({ stdout, stderr, code });
      });
      stream.on('error', reject);
    });
  });
}
