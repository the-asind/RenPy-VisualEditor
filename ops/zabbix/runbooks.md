# Zabbix Runbooks

These runbooks cover the first-response path for the Zabbix triggers defined in `ops/zabbix/templates/renpy-visual-editor-saas.yaml`.

## Backend down

1. Check whether the host is reachable.
2. Check whether Docker is running.
3. Check the backend container state and restart count.
4. Check backend logs.
5. Check free space on the SQLite data volume.
6. Check `GET /health` directly.
7. After recovery, check the Prometheus backend target health.

## Frontend down

1. Check the frontend container state.
2. Check frontend container logs.
3. Check whether nginx is serving static files.
4. Check the backend separately; frontend failure may hide a healthy backend.
5. Check public ingress or reverse proxy if production uses one.

## Snapshot saves failing

1. Check backend `/health`.
2. Check data volume free space and permissions.
3. Check whether `/app/data/renpy_editor.db` exists inside the backend container.
4. Check backend logs for SQLite or permission errors.
5. Check the Prometheus trend for `rve_crdt_snapshot_saves_total`.
6. Review the most recent deploy or config change.

## Loro bridge failing

1. Check that the backend image contains the Node.js runtime.
2. Check that `frontend/scripts/project-graph-snapshot-cli.mjs` exists in the backend image context.
3. Check backend logs for subprocess errors.
4. Check whether imports are failing at the same time.
5. Roll back the last image change if the bridge started failing after deployment.

## Prometheus down

1. Check the Prometheus container state.
2. Check the Prometheus data volume free space.
3. Check `ops/prometheus/prometheus.yml`.
4. Check whether backend `/metrics` is reachable.
5. Restart Prometheus only after confirming the volume is not full.

## Grafana down

1. Check the Grafana container state.
2. Check Grafana logs.
3. Check Grafana data volume free space.
4. Check whether Prometheus is reachable from the Grafana container.
5. Check datasource and dashboard provisioning paths.

## Backend 5xx rate above zero

1. Check backend logs for recent exceptions.
2. Check whether errors align with import, export, snapshot, auth, or WebSocket activity.
3. Use Grafana for detailed `rve_http_requests_total` route analysis.
4. Check host CPU, memory, and disk pressure.
5. Escalate if the rate stays non-zero across two collection windows.

## Auth synthetic check failed

1. Confirm the synthetic account exists and is not locked or deleted.
2. Confirm `{$RVE_SYNTH_USERNAME}` and `{$RVE_SYNTH_PASSWORD}` are set on the Zabbix host, not committed in repository files.
3. Check `POST /api/auth/token` from the Zabbix server container.
4. Check `GET /api/auth/me` with a fresh token.
5. If auth works manually, check whether the external script path is mounted into `/usr/lib/zabbix/externalscripts`.
6. Rotate the synthetic password if credentials may have leaked.

## ProjectGraph synthetic check failed

1. Keep the check disabled in production unless disposable-project cleanup is already verified.
2. Check auth first; this check depends on the same synthetic credentials.
3. Check `POST /api/projects/` for project creation failures.
4. Check `POST /api/projects/{id}/graph-import` using a tiny `.rpy` file in staging.
5. Check `GET /api/projects/{id}/graph-snapshot` for snapshot persistence failures.
6. Check `POST /api/projects/{id}/graph-export` for exporter failures.
7. Confirm disposable projects are deleted after both success and failure paths.
