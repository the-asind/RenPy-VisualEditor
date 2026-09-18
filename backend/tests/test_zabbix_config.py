from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]

BASE_COMPOSE = REPO_ROOT / "docker-compose.yml"
ZABBIX_COMPOSE = REPO_ROOT / "docker-compose.zabbix.yml"
ZABBIX_README = REPO_ROOT / "ops" / "zabbix" / "README.md"
ZABBIX_RUNBOOKS = REPO_ROOT / "ops" / "zabbix" / "runbooks.md"
ZABBIX_TEMPLATE = (
    REPO_ROOT / "ops" / "zabbix" / "templates" / "renpy-visual-editor-saas.yaml"
)

FORBIDDEN_ZABBIX_DIMENSIONS = {
    "project_id",
    "user_id",
    "node_id",
    "file_path",
    "asset_path",
    "renpy_name",
}


def test_zabbix_compose_is_optional_and_declares_local_poc_services():
    base_compose = BASE_COMPOSE.read_text(encoding="utf-8")
    zabbix_compose = ZABBIX_COMPOSE.read_text(encoding="utf-8")

    assert "zabbix-server" not in base_compose
    assert "zabbix-web" not in base_compose
    assert "zabbix-agent2" not in base_compose

    assert "zabbix-db:" in zabbix_compose
    assert "zabbix-server:" in zabbix_compose
    assert "zabbix-web:" in zabbix_compose
    assert "zabbix-agent2:" in zabbix_compose
    assert "zabbix/zabbix-server-pgsql:alpine-7.4-latest" in zabbix_compose
    assert "zabbix/zabbix-web-nginx-pgsql:alpine-7.4-latest" in zabbix_compose
    assert "zabbix/zabbix-agent2:alpine-7.4-latest" in zabbix_compose
    assert "./ops/zabbix/scripts:/usr/lib/zabbix/externalscripts:ro" in zabbix_compose
    assert "8080:8080" in zabbix_compose
    assert "10051:10051" in zabbix_compose


def test_zabbix_template_defines_bounded_macros_and_availability_items():
    template = ZABBIX_TEMPLATE.read_text(encoding="utf-8")

    assert "version: '7.4'" in template
    assert "Template App Plotmio SaaS" in template
    assert "{$RVE_FRONTEND_URL}" in template
    assert "{$RVE_BACKEND_URL}" in template
    assert "{$RVE_PROMETHEUS_URL}" in template
    assert "{$RVE_GRAFANA_URL}" in template
    assert "{$RVE_HEALTH_WARN_MS}" in template
    assert "{$RVE_FRONTEND_WARN_MS}" in template
    assert "{$RVE_SYNTH_USERNAME}" in template
    assert "{$RVE_SYNTH_PASSWORD}" in template

    assert "rve.frontend.status" in template
    assert "rve.backend.health.status" in template
    assert "rve.prometheus.ready.status" in template
    assert "rve.grafana.health.status" in template
    assert "rve.prometheus.backend.target.health" in template
    assert 'auth_synthetic_check.py["{$RVE_BACKEND_URL}","{$RVE_SYNTH_USERNAME}","{$RVE_SYNTH_PASSWORD}"]' in template
    assert "Auth synthetic status" in template
    assert 'projectgraph_synthetic_check.py["{$RVE_BACKEND_URL}","{$RVE_SYNTH_USERNAME}","{$RVE_SYNTH_PASSWORD}"]' in template
    assert "ProjectGraph synthetic status" in template

    assert "Backend health is unavailable" in template
    assert "Frontend is unavailable" in template
    assert "Prometheus is unavailable" in template
    assert "Grafana is unavailable" in template


def test_zabbix_template_bridges_only_selected_prometheus_incident_signals():
    template = ZABBIX_TEMPLATE.read_text(encoding="utf-8")

    assert "rve.prometheus.backend.5xx.rate" in template
    assert "rve.prometheus.snapshot.save.failure.rate" in template
    assert "rve.prometheus.loro.bridge.failure.rate" in template
    assert "rve.prometheus.import.failure.rate" in template
    assert "rve.prometheus.export.failure.rate" in template

    assert "rve_http_requests_total" in template
    assert "rve_crdt_snapshot_saves_total" in template
    assert "rve_loro_bridge_runs_total" in template
    assert "rve_graph_import_requests_total" in template
    assert "rve_graph_export_requests_total" in template
    assert "rve_ws_messages_total" not in template
    assert "rve_ws_binary_update_bytes_bucket" not in template


def test_zabbix_template_does_not_use_customer_data_dimensions():
    template = ZABBIX_TEMPLATE.read_text(encoding="utf-8").lower()

    for forbidden in FORBIDDEN_ZABBIX_DIMENSIONS:
        assert forbidden not in template


def test_zabbix_operator_docs_exist_and_reference_safe_run_commands():
    readme = ZABBIX_README.read_text(encoding="utf-8")
    runbooks = ZABBIX_RUNBOOKS.read_text(encoding="utf-8")

    assert "docker compose" in readme
    assert "docker-compose.zabbix.yml" in readme
    assert "Template App Plotmio SaaS" in readme
    assert "admin / zabbix" in readme
    assert "Do not commit production credentials" in readme

    assert "Backend down" in runbooks
    assert "Snapshot saves failing" in runbooks
    assert "Prometheus down" in runbooks
    assert "Grafana down" in runbooks
