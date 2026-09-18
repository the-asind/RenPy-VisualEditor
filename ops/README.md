# Production Operations

Plotmio uses two roles: an **application host** running the frontend, API and host nginx, and an **observability host** running Prometheus, Grafana, alert delivery and off-host backup copies. These roles may run on any suitable machines. Keep deployment-specific hostnames, account names, public addresses and VPN addresses in private environment or inventory files.

## Application host

Set `FORWARDED_ALLOW_IPS` to the exact Docker-network gateway through which host nginx reaches the backend. The default trusts only loopback. nginx overwrites incoming forwarded-address headers; Uvicorn must trust only that known proxy gateway.

1. Back up the SQLite Docker volume with `release_host.py backup`, verify integrity, and confirm a recent off-host copy.
2. Copy `example.env` to a private `.env`. Set the Plotmio API/WebSocket URLs, generate a unique `JWT_SECRET_KEY`, and list only required HTTPS origins in `CORS_ALLOW_ORIGINS`.
3. Run `docker compose config --quiet`, the release tests and the image build before replacing running containers.
4. Render the nginx configuration with explicit deployment values:

   ```sh
   python3 ops/render_nginx_config.py \
     --application-host plotmio.com \
     --observability-source-ip "$OBSERVABILITY_SOURCE_IP" \
     --observability-vpn-ip "$OBSERVABILITY_VPN_IP" \
     --output /tmp/plotmio.conf
   ```

   The renderer validates all values and refuses unresolved placeholders. Inspect the result, install it as a private host configuration, run `nginx -t`, then reload nginx.
5. Keep Compose ports on `127.0.0.1`; nginx is the only public ingress. Verify that public requests cannot read either internal metrics endpoint.
6. Verify `/healthz`, account login, demo preview, project import/edit/export and WebSocket collaboration.

Use Certbot's nginx or webroot authenticator only after the DNS A/AAAA records resolve to the application host. Keep old-domain TLS while permanent redirects are in service.

## Observability host

The monitoring containers use host networking so they can reach a private tunnel while binding Prometheus and Grafana only to loopback. Set these private environment values:

- `APPLICATION_METRICS_IP`: private route to the application host used by Compose `extra_hosts`.
- `GRAFANA_ADMIN_PASSWORD`: unique Grafana administrator password.
- `BACKUP_SSH_TARGET`: restricted SSH target in `user@host` form for `pull_backup.py`.

Run:

```sh
docker compose -f docker-compose.observability.yml config --quiet
docker compose -f docker-compose.observability.yml up -d
```

Confirm all three Prometheus jobs are up: `plotmio-backend`, `plotmio-application-host`, and `plotmio-offhost-backup`. TLS hostname verification must remain enabled.

## Telegram alerts

Put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in a mode-0600 `telegram-relay.env` outside Git. Start the loopback-only relay with:

```sh
docker compose -p renpy-alerts -f ops/docker-compose.telegram.yml up -d
python3 ops/configure_grafana_alerts.py
```

The stable `renpy-*` alert UIDs and Compose project name are retained to update the existing Grafana objects rather than duplicate them. User-visible alert names use Plotmio. All relay messages set `disable_notification=true`.

## Backups and host health

The selected recovery-point objective is six hours. The application host runs `renpy-backup.timer` every four hours and `renpy-host-metrics.timer` each minute. Unit names remain stable for deployment continuity.

Install `release_host.py` outside the checkout, create the private backup directory, enable the timers, and run one backup before enabling alerts. The restricted backup key must:

- be accepted only from the observability host's private address;
- force `release_host.py export`;
- disable port, agent and X11 forwarding;
- use a pinned host key with `StrictHostKeyChecking=yes`.

Run `pull_backup.py` with `BACKUP_SSH_TARGET` set in its private cron environment. It validates SQLite before replacing a known-good copy, retains latest/previous, and writes only a success timestamp to the loopback metrics bridge.

Test restores in an isolated volume with the production DatabaseService. Never overwrite the live database as a restore test.

## Release evidence

For each deployment record privately: Git commit, image IDs, database-backup checksum, Compose status, `/healthz`, Prometheus target health, dashboard timestamps, one delivered silent alert, TLS renewal status and the smoke-test results. Do not commit rendered infrastructure configuration, credentials, personal host aliases or server addresses.
