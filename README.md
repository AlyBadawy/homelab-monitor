# Homelab Monitor

A small, self-hosted dashboard that monitors the pieces of a homelab: a Proxmox host, its VMs, Docker containers (Portainer, Nextcloud, Immich, Postgres), and a Unifi UNAS. Read-only, LAN-only, no auth. Dark techy look.

## Current status: v0.13.3 — sectioned layout

The homepage is now organised into a fixed sequence of sections (each with its own TypeScript module under `frontend/src/sections/`):

1. **Status tiles** — a 12-slot rollup strip at the very top (6×2 on desktop, 2×6 on mobile). Slots cover Hypervisor, UNAS, Switch, Router, Nextcloud, Immich, Docker, Services, VMs, Databases, Backups, UPS. Integrations that aren't wired yet show as dimmed **TBD** tiles, so the grid shape never shifts.
2. **UniFi Network** — placeholder card with router status, external IP, downlink / uplink throughput, 5 router ports, and 10 switch ports. Visual stub today; the UniFi poller will backfill the values.
3. **UNAS** — full-row card with drives + storage pools.
4. **Hypervisor** — full-row card with host metrics + a mini-grid of VM / LXC cards embedded inside.
5. **Docker** — full-row card: per-endpoint networks + volumes on top, then per-stack subsections with two-line container rows (uptime / CPU / memory on line 1, net in / net out / 24h sparkline on line 2).
6. **Services** — HTTP health checks table.
7. **Databases** — placeholder.
8. **Nextcloud** — full-row card.
9. **Immich** — full-row card.

The dashboard now shows live data for:

- **The Proxmox host** — CPU, memory, uptime, **CPU temperature (24h sparkline)**, and a list of **every enabled storage pool** (NFS, PBS, dir, lvmthin, zfspool, …) sorted biggest-used first. Pools with unknown size show "—" rather than being hidden.
- **Every VM & LXC container** — CPU, memory, disk (LXC only — see note), uptime, **live network ↓/↑ rate**, and **count of backups** found for that VMID across every backup-content storage.
- **Unifi UNAS Pro** (over SSH) — CPU, memory, uptime, **CPU temperature (24h sparkline)**, **storage pools with RAID health + nested share list**, and **per-drive SMART + temperature** (also with per-drive 24h temperature sparkline).
- **Docker containers (via Portainer)** — one card per running container with CPU, memory, uptime, and live network ↓/↑ rate. Containers are **grouped into sections by compose/swarm stack** (from `com.docker.compose.project` / `com.docker.stack.namespace`); containers started with plain `docker run` fall into a final "Unstacked" section. Each Portainer-managed endpoint (standalone Docker, agent, Swarm) is polled individually.
- **Docker networks & volumes** — a "Docker Resources" section with one pair of cards per endpoint. The **Networks** card lists driver, scope, subnet/gateway, internal flag, and live attached-container count (derived from container inspects, so it only counts running containers). The **Volumes** card lists driver, stack, mount path, size, and reference count — with orphans (refCount = 0) dimmed under a divider so "safe to prune" jumps out. Sizes come from `/system/df` which runs on its own slower interval (default 60s) so the fast tick stays fast even on hosts with many volumes.
- **Nextcloud** — an "Applications" tile with a dedicated Nextcloud card: **storage free**, **file count**, **active users (5m / 1h)**, plus a secondary row of **total users**, **shares**, **apps-with-updates** (amber-tinted when > 0), **version**, and **uptime**. Each primary chip has its own 24h sparkline; the drawer adds full 24h charts for active-users (5m / 1h / 24h overlaid), storage free, and total files. Powered by Nextcloud's monitoring token against `/ocs/v2.php/apps/serverinfo/api/v1/info` — no user login required, purely read-only.
- **Immich** — an "Applications" tile with a dedicated Immich card: **total photos**, **total videos**, **library bytes**, **registered users**, a **top-5 per-user usage table**, and a **live job-queue grid** that shows every BullMQ queue with its active / waiting / failed counts. The header carries a **jobs-backlog chip** that tints amber when anything is queued and rose when any queue has failures. Each queue chip follows the same rule — rose wins over amber wins over muted — so a single glance tells you whether Immich's background processing is healthy. The drawer adds 24h charts for photos, videos, library bytes, and the aggregate backlog. Powered by Immich's admin API (`/api/server/statistics` + `/api/jobs`), read-only.
- **HTTP service checks** — add arbitrary URLs in the Services card to monitor latency, status code, and 24h availability strip. CRUD lives directly in the UI.

Data is polled every 10 seconds (60s for Nextcloud + Immich — those calls are heavier) and 24 hours of samples are persisted to SQLite. Every tile has a 24h drawer with per-metric charts.

### Known limitation: QEMU disk usage

For QEMU VMs, the dashboard shows "—" for Disk with the hint _"guest agent not reporting"_. That's intentional — Proxmox's `/cluster/resources` only knows actual in-VM filesystem usage when the **qemu-guest-agent** is installed inside each VM. Install it (`apt install qemu-guest-agent && systemctl enable --now qemu-guest-agent` on Debian/Ubuntu, `dnf install qemu-guest-agent` on RHEL) and enable it on the VM's Options tab in Proxmox. A follow-up chunk will wire up `/agent/get-fsinfo` once the agent is in place on all your VMs.

LXC containers don't need this — their Disk value is already real.

Docker containers do not surface a rootfs usage % via the stats API, so the Disk bar is hidden on Docker cards by design.

Still to come: Postgres app-level metrics; real UniFi / UPS / Backups pollers to fill the TBD tiles + UniFi card.

## Stack

| Layer    | Choice                                                   |
| -------- | -------------------------------------------------------- |
| Frontend | React 18 + TypeScript + Vite + Tailwind                  |
| Backend  | Node 20 + TypeScript + Express + better-sqlite3 + undici |
| Storage  | SQLite file — 24h rolling history                        |
| Deploy   | Two containers via `docker-compose` (nginx + node)       |

## Configuration (docker-compose.yml)

All config is inline in `docker-compose.yml` under the `backend` service:

```yaml
environment:
  PROXMOX_BASE_URL: "https://proxmox.in.alybadawy.com"
  PROXMOX_TOKEN_ID: "monitor@pve!dashboard"
  PROXMOX_TOKEN_SECRET: "…rotate after first run…"
  PROXMOX_INSECURE_TLS: "false" # flip to "true" if hitting a self-signed cert directly
  POLL_INTERVAL_MS: "10000"
```

Optional env vars:

| Var                          | Default                     | Notes                                                                                                                             |
| ---------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                       | `4000`                      | Backend listen port (inside the container)                                                                                        |
| `DATA_DIR`                   | `/data`                     | Where `monitor.db` is written                                                                                                     |
| `POLL_INTERVAL_MS`           | `10000`                     | How often each poller runs                                                                                                        |
| `HISTORY_RETENTION_MS`       | `86400000`                  | 24h. Samples older than this are pruned every 5 min                                                                               |
| `PROXMOX_INSECURE_TLS`       | `false`                     | Skip TLS verification — needed if hitting PVE's self-signed cert directly                                                         |
| `UNAS_HOST` / `UNAS_USER`    | —                           | SSH host + user. When both (plus a credential) are set, the UNAS poller starts.                                                   |
| `UNAS_SSH_KEY_PATH`          | —                           | Path to the read-only SSH key inside the container (mounted from `./secrets`).                                                    |
| `UNAS_PASSWORD`              | —                           | Password fallback if no key is mounted.                                                                                           |
| `PORTAINER_BASE_URL`         | —                           | e.g. `https://portainer.in.example.com` — no trailing slash.                                                                      |
| `PORTAINER_API_KEY`          | —                           | Read-only API token (User settings → Access tokens in Portainer).                                                                 |
| `PORTAINER_INSECURE_TLS`     | `false`                     | Flip to `true` if Portainer serves a self-signed cert.                                                                            |
| `PORTAINER_POLL_INTERVAL_MS` | inherits `POLL_INTERVAL_MS` | Docker stats are heavier — bump to 15–30s if your host is busy.                                                                   |
| `PORTAINER_DF_INTERVAL_MS`   | `60000`                     | How often to refresh volume sizes via `/system/df` (the heavy call). Raise on hosts with many large volumes.                      |
| `NEXTCLOUD_BASE_URL`         | —                           | e.g. `https://nextcloud.example.com`, no trailing slash. Enables the Nextcloud tile.                                              |
| `NEXTCLOUD_TOKEN`            | —                           | Monitoring token from Settings → Administration → Monitoring → _Metrics token_.                                                   |
| `NEXTCLOUD_INSECURE_TLS`     | `false`                     | Flip to `true` if Nextcloud serves a self-signed cert.                                                                            |
| `NEXTCLOUD_POLL_INTERVAL_MS` | `60000`                     | Serverinfo walks the installed-apps list; 60s is a healthy default on small-to-medium instances.                                  |
| `IMMICH_BASE_URL`            | —                           | e.g. `https://immich.example.com`, no trailing slash. Enables the Immich tile.                                                    |
| `IMMICH_API_KEY`             | —                           | API key minted under Account → API keys with the `admin` permission set (required for `/api/server/statistics` and `/api/jobs`).  |
| `IMMICH_INSECURE_TLS`        | `false`                     | Flip to `true` if Immich serves a self-signed cert.                                                                               |
| `IMMICH_POLL_INTERVAL_MS`    | `60000`                     | `/api/server/statistics` walks every user — 60s is a safe default on medium instances; raise on installs with thousands of users. |

Each poller is optional. If its required env vars are missing, it's disabled at startup with a warning; the other pollers keep running. Any live poller error shows up as an amber banner in the UI with the exact message.

## Proxmox API token setup

Create a dedicated user + token in Proxmox (Datacenter → Permissions):

1. Add a user `monitor@pve` (any password — it's not used by the token)
2. Add a user permission at path `/` with role `PVEAuditor` (read-only) and _Propagate_ checked
3. Add an API token for that user — un-check _Privilege Separation_ so it inherits the user's permissions
4. Copy the shown secret once; paste it into `PROXMOX_TOKEN_SECRET`

## Run

### Option A — Portainer (recommended if you already run Portainer)

1. **Create the network first**
   Portainer → _Networks_ → _Add network_. Name it exactly `homelab-monitor`, driver `bridge`, leave other defaults. The compose file references this as an external network.

2. **Push this project to a git repo** (GitHub, Gitea, GitLab, etc). Do **not** commit real Proxmox credentials — `docker-compose.yml` reads them from stack env vars.

3. **Create the stack**
   Portainer → _Stacks_ → _Add stack_. Name: `homelab-monitor`.
   - Build method: **Repository**
   - Repository URL: your git URL
   - Reference: `refs/heads/main`
   - Compose path: `docker-compose.yml`
   - (Private repo: set _Authentication_ ON and paste a GitHub Personal Access Token)

4. **Set environment variables** (same screen, _Environment variables_ section — this is where the real token lives):
   - `PROXMOX_TOKEN_ID` = `monitor@pve!dashboard`
   - `PROXMOX_TOKEN_SECRET` = the new secret (rotate the old one first!)
   - `PROXMOX_BASE_URL` = `https://proxmox.in.alybadawy.com` (optional; this is the default)
   - `PROXMOX_INSECURE_TLS` = `false` (flip to `true` only if you point at the direct PVE IP)
   - `FRONTEND_PORT` = the host port you want (e.g. `8080`)

5. **Deploy** → _Deploy the stack_. Portainer clones the repo, builds both images on the docker host, pulls them up, and attaches them to the pre-created `homelab-monitor` network.

6. Open `http://<docker-vm-ip>:<FRONTEND_PORT>`.

To update later: Stack → _Pull and redeploy_. Or configure a webhook in Portainer and push `main` to redeploy automatically.

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

| Method | Path                                     | Purpose                                                                           |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/health`                            | Liveness + per-poller enabled flags (proxmox, unas, portainer, nextcloud, immich) |
| GET    | `/api/stats/summary`                     | All target tiles + last per-poller error                                          |
| GET    | `/api/stats/history/:target?metrics=a,b` | 24h sample history (batched, server-downsampled)                                  |
| GET    | `/api/services`                          | List configured HTTP checks                                                       |
| POST   | `/api/services`                          | Create a new HTTP check                                                           |
| PATCH  | `/api/services/:id`                      | Update an existing check                                                          |
| DELETE | `/api/services/:id`                      | Remove a check                                                                    |

Metrics recorded per target today:

- `cpu_pct`, `mem_pct` — for hosts, VMs, LXCs, Docker containers, and UNAS
- `rootfs_pct` — for the Proxmox host and the UNAS
- `cpu_temp_c` — for the Proxmox host and the UNAS
- `storage:<poolname>:used_pct` — one per active pool on the Proxmox host / UNAS
- `drive:<device>:temp_c` — one per UNAS drive that reports SMART temperature
- `disk_pct` — for LXC containers (QEMU VMs will be added once guest-agent integration lands; Docker does not expose this)
- `net_in_bps`, `net_out_bps` — for VMs, LXCs, and Docker containers
- `http_up`, `http_latency_ms` — for configured HTTP service checks
- `active_users_5m`, `active_users_1h`, `active_users_24h`, `storage_free_bytes`, `files_count` — for the Nextcloud tile
- `photos_total`, `videos_total`, `library_bytes`, `jobs_backlog` — for the Immich tile

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

| Kind             | ID format                                | Example                   |
| ---------------- | ---------------------------------------- | ------------------------- |
| Proxmox host     | `proxmox-host`                           | (first / only node)       |
| Extra PVE nodes  | `proxmox-host-<node>`                    | `proxmox-host-pve2`       |
| Proxmox VM       | `qemu-<vmid>`                            | `qemu-101`                |
| Proxmox LXC      | `lxc-<vmid>`                             | `lxc-200`                 |
| UNAS             | `unas`                                   | —                         |
| Docker container | `docker-<endpointId>-<first12charsOfId>` | `docker-1-a3f90b21cc47`   |
| HTTP service     | `service-<uuid>`                         | `service-…`               |
| Nextcloud        | `app-nextcloud`                          | — (single-instance today) |
| Immich           | `app-immich`                             | — (single-instance today) |

## Roadmap

1. ~~**Chunk 1** — scaffold~~
2. ~~**Chunk 2** — Proxmox: host + VMs + storage pools~~
3. ~~**Chunk 3** — Portainer integration: container-level CPU/mem/network/status~~
4. **Chunk 4** — Postgres metrics: connections, db size, replication lag
5. ~~**Chunk 5a** — Nextcloud serverinfo (storage, users, files, shares, app updates)~~
6. ~~**Chunk 5b** — Immich app-level stats (assets, library size, jobs)~~
7. ~~**Chunk 6** — Unifi UNAS: capacity, temps, SMART, RAID health~~
8. ~~**Chunk 7** — Sparkline + 24h history charts~~

Each chunk starts with a round of questions before any code lands.
