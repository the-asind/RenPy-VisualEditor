# Zabbix Local PoC

This directory contains the optional Zabbix integration for Plotmio.

Zabbix is an operational monitoring layer for availability, host/container health, synthetic checks, incident routing, and runbooks. Prometheus remains the application metrics source, and Grafana remains the dashboard layer for `rve_*` metrics.

## Files

```text
docker-compose.zabbix.yml
ops/zabbix/templates/renpy-visual-editor-saas.yaml
ops/zabbix/runbooks.md
```

## Local Run

Start the app, Prometheus/Grafana, and Zabbix together:

```powershell
docker compose `
  -f docker-compose.yml `
  -f docker-compose.observability.yml `
  -f docker-compose.zabbix.yml `
  up -d --build
```

Expected local URLs:

1. Frontend: `http://127.0.0.1:5137`
2. Backend health: `http://127.0.0.1:9000/health`
3. Backend metrics: `http://127.0.0.1:9000/metrics`
4. Prometheus: `http://127.0.0.1:9090`
5. Grafana: `http://127.0.0.1:3000`
6. Zabbix web: `http://127.0.0.1:8080`

Default Zabbix UI credentials for the official image are:

```text
admin / zabbix
```

Do not commit production credentials. The compose defaults are for local PoC only.

## Import The Template

Automated import:

```powershell
python ops/zabbix/scripts/bootstrap_zabbix.py `
  --url http://127.0.0.1:8080 `
  --user Admin `
  --password zabbix
```

The bootstrap script imports the template, creates the `Plotmio` host group when missing, and creates or updates `renpy-visual-editor-local` with bounded URL macros.

Manual import:

1. Open Zabbix web.
2. Go to `Data collection` -> `Templates`.
3. Import `ops/zabbix/templates/renpy-visual-editor-saas.yaml`.
4. Create a host such as `renpy-visual-editor-local`.
5. Link `Template App Plotmio SaaS`.
6. Override macros if the default internal Docker URLs do not match your environment.

Default template macros:

| Macro | Local value |
| --- | --- |
| `{$RVE_FRONTEND_URL}` | `http://frontend/` |
| `{$RVE_BACKEND_URL}` | `http://backend:9000` |
| `{$RVE_PROMETHEUS_URL}` | `http://prometheus:9090` |
| `{$RVE_GRAFANA_URL}` | `http://grafana:3000` |

## Scope Boundary

Use Zabbix for:

1. Frontend/backend availability.
2. Prometheus/Grafana availability.
3. Selected Prometheus-derived incident signals.
4. Host/container/Docker checks when Agent 2 can access the runtime.
5. Operator runbooks and notifications.

Do not use Zabbix for:

1. ProjectGraph dashboards.
2. Mirroring every Prometheus metric.
3. Customer, project, node, asset, or Ren'Py-content dimensions.
4. Browser File System Access state.

## Optional Auth Synthetic Check

The template includes a disabled external check:

```text
auth_synthetic_check.py["{$RVE_BACKEND_URL}","{$RVE_SYNTH_USERNAME}","{$RVE_SYNTH_PASSWORD}"]
```

Enable it only after creating a dedicated synthetic user and setting host-level macros:

1. `{$RVE_SYNTH_USERNAME}`
2. `{$RVE_SYNTH_PASSWORD}`

The script prints `1` for success and `0` for failure. It never prints the bearer token.

## Optional Staging ProjectGraph Synthetic Check

The template also includes a disabled staging-only external check:

```text
projectgraph_synthetic_check.py["{$RVE_BACKEND_URL}","{$RVE_SYNTH_USERNAME}","{$RVE_SYNTH_PASSWORD}"]
```

It creates a disposable project, imports a tiny `.rpy`, verifies a graph snapshot, calls graph export with a minimal ProjectGraph payload, and deletes the disposable project.

Keep this check disabled in production until cleanup has been verified in the target environment. It intentionally creates and deletes data.

## Docker Socket Note

`zabbix-agent2` mounts `/var/run/docker.sock` read-only for Linux-host Docker checks. Docker Desktop on Windows may behave differently. If the socket mount is not available, keep the HTTP and Prometheus checks and treat Docker checks as production-host guidance.

## Stop

```powershell
docker compose `
  -f docker-compose.yml `
  -f docker-compose.observability.yml `
  -f docker-compose.zabbix.yml `
  down
```
