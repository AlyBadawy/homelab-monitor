# Homelab Monitor

A small, self-hosted dashboard that monitors the pieces of a homelab: a Proxmox host, its VMs, Docker containers (Portainer, Nextcloud, Immich, Postgres), and a Unifi UNAS. Read-only, LAN-only, no auth. Dark techy look.

## Current status: Chunk 2 — Proxmox integration

The dashboard now shows live data for:

- **The Proxmox host** — CPU, memory, uptime, and a list of all active storage pools sorted by usage (biggest-used first)
- **Every VM & LXC container** in the cluster, auto-discovered from `/cluster/resources`

Data is polled every 10 seconds and 24 hours of samples are persisted to SQLite for future sparkline charts.

Still to come: Portainer container stats, Postgres, Nextcloud, Immich, and the Unifi UNAS.

## Stack

| Layer    | Choice |
| -------- | ------ |
| Frontend | React 18 + TypeScript + Vite + Tailwind |
| Backend  | Node 20 + TypeScript + Express + better-sqlite3 + undici |
| Storage  | SQLite file — 24h rolling history |
| Deploy   | Two containers via `docker-compose` (nginx + node) |

## Configuration (docker-compose.yml)

All config is inline in `docker-compose.yml` under the `backend` service:

```yaml
environment:
  PROXMOX_BASE_URL:     "https://proxmox.in.alybadawy.com"
  PROXMOX_TOKEN_ID:     "monitor@pve!dashboard"
  PROXMOX_TOKEN_SECRET: "…rotate after first run…"
  PROXMOX_INSECURE_TLS: "false"     # flip to "true" if hitting a self-signed cert directly
  POLL_INTERVAL_MS:     "10000"
```

Optional env vars:

| Var                      | Default | Notes |
| ------------------------ | ------- | ----- |
| `PORT`                   | `4000`  | Backend listen port (inside the container) |
| `DATA_DIR`               | `/data` | Where `monitor.db` is written |
| `POLL_INTERVAL_MS`       | `10000` | How often the Proxmox poller runs |
| `HISTORY_RETENTION_MS`   | `86400000` | 24h. Samples older than this are pruned every 5 min |
| `PROXMOX_INSECURE_TLS`   | `false` | Skip TLS verification — needed if hitting PVE's self-signed cert directly |

If any of `PROXMOX_BASE_URL`, `PROXMOX_TOKEN_ID`, or `PROXMOX_TOKEN_SECRET` are missing, the Proxmox poller is disabled and the backend logs a warning on startup (the dashboard will then show an empty-state card explaining that).

## Proxmox API token setup

Create a dedicated user + token in Proxmox (Datacenter → Permissions):

1. Add a user `monitor@pve` (any password — it's not used by the token)
2. Add a user permission at path `/` with role `PVEAuditor` (read-only) and *Propagate* checked
3. Add an API token for that user — un-check *Privilege Separation* so it inherits the user's permissions
4. Copy the shown secret once; paste it into `PROXMOX_TOKEN_SECRET`

## Run

### Option A — Portainer (recommended if you already run Portainer)

1. **Create the network first**
   Portainer → *Networks* → *Add network*. Name it exactly `homelab-monitor`, driver `bridge`, leave other defaults. The compose file references this as an external network.

2. **Push this project to a git repo** (GitHub, Gitea, GitLab, etc). Do **not** commit real Proxmox credentials — `docker-compose.yml` reads them from stack env vars.

3. **Create the stack**
   Portainer → *Stacks* → *Add stack*. Name: `homelab-monitor`.
   - Build method: **Repository**
   - Repository URL: your git URL
   - Reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`
   - (Private repo: set *Authentication* ON and paste a GitHub Personal Access Token)

4. **Set environment variables** (same screen, *Environment variables* section — this is where the real token lives):
   - `PROXMOX_TOKEN_ID` = `monitor@pve!dashboard`
   - `PROXMOX_TOKEN_SECRET` = the new secret (rotate the old one first!)
   - `PROXMOX_BASE_URL` = `https://proxmox.in.alybadawy.com` (optional; this is the default)
   - `PROXMOX_INSECURE_TLS` = `false` (flip to `true` only if you point at the direct PVE IP)
   - `FRONTEND_PORT` = the host port you want (e.g. `8080`)

5. **Deploy** → *Deploy the stack*. Portainer clones the repo, builds both images on the docker host, pulls them up, and attaches them to the pre-created `homelab-monitor` network.

6. Open `http://<docker-vm-ip>:<FRONTEND_PORT>`.

To update later: Stack → *Pull and redeploy*. Or configure a webhook in Portainer and push `main` to redeploy automatically.

### Option B — docker compose directly on the VM

```bash
cd "homelab monitor"
# fill in real values:
export PROXMOX_TOKEN_ID="monitor@pve!dashboard"
export PROXMOX_TOKEN_SECRET="…"
export FRONTEND_PORT="8080"
# external network must exist first:
docker network create homelab-monitor
docker compose up -d --build
# open http://<docker-vm-ip>:8080
```

The frontend auto-refreshes every 10s. A manual refresh button in the header forces an immediate fetch.

If Proxmox polling fails you'll see an amber banner with the exact error message (e.g. `proxmox /nodes → 401 authentication failure`). Common causes:

- Wrong token ID format — must be `user@realm!tokenname` (e.g. `monitor@pve!dashboard`)
- Wrong/expired secret
- NPM forwarding to the wrong backend — switch `PROXMOX_BASE_URL` to the direct `https://<ip>:8006` and set `PROXMOX_INSECURE_TLS: "true"`
- PVEAuditor role wasn't propagated — re-check the permission

## Endpoints

| Method | Path                                | Purpose |
| ------ | ----------------------------------- | ------- |
| GET    | `/api/health`                       | Liveness + whether Proxmox poller is enabled |
| GET    | `/api/stats/summary`                | All target tiles + last poller error |
| GET    | `/api/stats/history/:target/:metric` | 24h sample history (used by Chunk 7) |

Metrics recorded per target today:

- `cpu_pct`, `mem_pct` — for hosts, VMs, and containers
- `rootfs_pct` — for the Proxmox host
- `storage:<poolname>:used_pct` — one per active pool on the Proxmox host

## Data model

Wide, long-format — lets us add targets/metrics without migrations.

```sql
samples(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,        -- unix epoch ms
  target_id TEXT NOT NULL,    -- 'proxmox-host', 'qemu-101', 'lxc-200', …
  metric TEXT NOT NULL,       -- 'cpu_pct', 'mem_pct', 'storage:local-lvm:used_pct'
  value REAL NOT NULL
);
CREATE INDEX idx_samples_target_metric_ts ON samples(target_id, metric, ts DESC);
```

SQLite file lives on the `backend_data` docker volume (`/data/monitor.db` inside the container). Rows older than 24h are pruned every 5 minutes.

## Target ID scheme

| Kind             | ID format              | Example |
| ---------------- | ---------------------- | ------- |
| Proxmox host     | `proxmox-host`         | (first / only node) |
| Extra PVE nodes  | `proxmox-host-<node>`  | `proxmox-host-pve2` |
| Proxmox VM       | `qemu-<vmid>`          | `qemu-101` |
| Proxmox LXC      | `lxc-<vmid>`           | `lxc-200` |

## Roadmap (next chunks)

1. ~~**Chunk 1** — scaffold~~
2. ~~**Chunk 2** — Proxmox: host + VMs + storage pools~~
3. **Chunk 3** — Portainer integration: container-level CPU/mem/status from both Portainer instances
4. **Chunk 4** — Postgres metrics: connections, db size, replication lag
5. **Chunk 5** — Nextcloud / Immich app-level stats
6. **Chunk 6** — Unifi UNAS: capacity, temps, SMART, RAID health
7. **Chunk 7** — Sparkline charts using the SQLite 24h history

Each chunk will start with a round of questions before any code lands.
