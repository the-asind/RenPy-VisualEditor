# Production Operations

The public application runs on the MSK VPS behind the host nginx. Prometheus and Grafana run as a standalone Compose project on the FIN VPS.

## MSK Application Host

Set `FORWARDED_ALLOW_IPS` to the actual backend Docker-network gateway through which host nginx connects (MSK existing `renpy-visualeditor_default`: `172.18.0.1`). The default trusts only loopback. nginx overwrites incoming forwarded IP headers; Uvicorn must trust only that known proxy gateway. Verify real client addresses in backend access logs after deployment.

1. Back up the `renpy_editor_db` Docker volume and verify the archive before changing containers.
2. Copy `example.env` to `.env`, set the public `VITE_API_URL`/`VITE_WS_URL`, generate a unique `JWT_SECRET_KEY`, and list only the public site origins in `CORS_ALLOW_ORIGINS`.
3. Run `docker compose config --quiet`, then `docker compose build` and the release tests before replacing the running containers.
4. Install `ops/nginx/renpy.online.conf` as the host's RenPy site, run `sudo nginx -t`, and reload nginx only after the test succeeds.
5. Start with `docker compose up -d` and verify `/healthz`, registration/login, demo preview, project create/import/edit/export and WebSocket collaboration.

The Compose ports bind to `127.0.0.1`; nginx is the only public application ingress. The nginx metrics location accepts the FIN VPS address and denies other clients.

## FIN Observability Host

The monitoring containers use Linux host networking to reach the host's existing VPN; each server explicitly binds to `127.0.0.1`. Grafana uses the host-loopback Prometheus datasource. Verify bindings with `ss -lnt` after start; no Docker port publication is used for monitoring.

FIN reaches MSK over the existing VPN: Prometheus resolves `renpy.online` to `10.20.30.2` via Compose `extra_hosts`, preserving the HTTPS hostname and certificate verification. Set `MSK_METRICS_IP` to override that address. nginx permits the FIN VPN address `10.20.30.1` as well as its public address. Public FIN→MSK TCP/443 was unreachable during setup; VPN HTTPS was reachable.

1. Copy the repository's `docker-compose.observability.yml` and `ops/` directory.
2. Set a unique `GRAFANA_ADMIN_PASSWORD` in `.env`.
3. Run `docker compose -f docker-compose.observability.yml config --quiet` and then `docker compose -f docker-compose.observability.yml up -d`.
4. Keep Prometheus and Grafana on loopback. Reach Grafana through an SSH tunnel unless a separately authenticated HTTPS ingress is configured.
5. In Prometheus, confirm the `renpy-visual-editor-backend` target is up. In Grafana, open each provisioned dashboard and confirm current HTTP, ProjectGraph and collaboration series.

## Release Evidence

## Telegram alerts on FIN

Put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `telegram-relay.env` next to the monitoring Compose file; keep it outside Git and set mode `0600`. The existing MSK bot cannot reach Telegram directly; the owner authorized copying its credentials to FIN. Never include credentials in commands, logs or release artifacts.

Run `docker compose -p renpy-alerts -f ops/docker-compose.telegram.yml up -d`. The relay uses host networking but binds only `127.0.0.1:9081`, accepts only local webhook requests and limits payloads to 64 KiB. Then run `python3 ops/configure_grafana_alerts.py` from the FIN account whose monitoring configuration is in `~/renpy-observability`. This idempotently configures the contact point, notification policy and backend availability / HTTP failure rules, and sends a real test notification. The command fails if notification delivery fails. Keep the monitoring volume: API-provisioned rules live in Grafana's persistent database.

The optional systemd unit uses `/etc/renpy-telegram-relay.env` for hosts with administrator access; FIN currently runs the Docker variant. Do not run both on the same port.

The backend now admits at most two concurrent project writes or password operations per worker, returning `503` with `Retry-After: 2` instead of queueing extra work. Request bodies are bounded to 10 MiB before JSON/multipart parsing, with a 30-second read deadline and at most 16 simultaneous body readers. Imports, exports, graph commands and password work run outside the event loop. Use one backend worker: admission and IP counters are process-local.

Persisted graph snapshots, catalogs and legacy script text share a 32 MiB owner budget, including catalog writes by collaborators. Each snapshot is limited to 8 MiB and each catalog to 1 MiB. Import replaces graph/catalog atomically; rejected writes preserve existing data and revisions. This is a logical payload quota, not a cap on SQLite file size, backups, logs or legacy version history. Existing owners above the budget can shrink data or delete projects.

WebSocket admission includes unauthenticated connections: 200 total and 20 per source IP per worker, in addition to authenticated user/project limits. Uvicorn bounds frames to 1 MiB and its incoming queue to four frames. Membership is rechecked before processing messages and delivering broadcasts; idle revoked sessions close within 15 seconds. Slow recipients have a two-second send deadline and do not block delivery to other peers.

Before deployment, configure trusted proxy addresses explicitly and verify that the application sees distinct real client IPs through nginx and Docker. Do not trust arbitrary forwarded headers. These changes have local automated coverage; they still require real ingress/load testing, container CPU/memory/PID/log limits and disk monitoring on the VPS.

Project WebSocket defaults allow 300 incoming messages and 8 MiB per connection per fixed 10-second window; incoming text frames are limited to 16 KiB. Compose exposes `MAX_WS_MESSAGES_PER_WINDOW`, `MAX_WS_BYTES_PER_WINDOW`, and `WS_RATE_WINDOW_SECONDS`. These budgets apply after authentication and do not replace service-wide connection admission or ingress/transport limits. Anonymous preview uses a committed artifact; run `python backend/scripts/build_demo_preview.py --check` before deployment.

For each deployment, record the Git commit, image IDs, database-backup checksum, Compose status, `/healthz` result, Prometheus target health, dashboard timestamps and one delivered test alert. Test restore into a temporary volume before calling the public beta recoverable.
