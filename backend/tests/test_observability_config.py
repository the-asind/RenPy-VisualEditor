import json
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]

COMPOSE_FILE = REPO_ROOT / "docker-compose.observability.yml"
PROMETHEUS_CONFIG = REPO_ROOT / "ops" / "prometheus" / "prometheus.yml"
GRAFANA_DATASOURCE = (
    REPO_ROOT / "ops" / "grafana" / "provisioning" / "datasources" / "prometheus.yml"
)
GRAFANA_DASHBOARD_PROVISIONING = (
    REPO_ROOT / "ops" / "grafana" / "provisioning" / "dashboards" / "dashboards.yml"
)
DASHBOARD_FILES = [
    REPO_ROOT / "ops" / "grafana" / "dashboards" / "renpy-visual-editor-overview.json",
    REPO_ROOT / "ops" / "grafana" / "dashboards" / "renpy-visual-editor-projectgraph.json",
    REPO_ROOT / "ops" / "grafana" / "dashboards" / "renpy-visual-editor-collaboration.json",
]

IMPLEMENTED_METRIC_NAMES = {
    "rve_http_requests_total",
    "rve_http_request_duration_seconds_bucket",
    "rve_graph_import_requests_total",
    "rve_graph_import_duration_seconds_bucket",
    "rve_graph_import_files_bucket",
    "rve_graph_import_nodes_bucket",
    "rve_graph_import_edges_bucket",
    "rve_graph_import_diagnostics_bucket",
    "rve_crdt_snapshot_loads_total",
    "rve_crdt_snapshot_saves_total",
    "rve_crdt_snapshot_load_duration_seconds_bucket",
    "rve_crdt_snapshot_save_duration_seconds_bucket",
    "rve_loro_bridge_runs_total",
    "rve_graph_export_requests_total",
    "rve_graph_export_duration_seconds_bucket",
    "rve_graph_export_blocking_diagnostics_bucket",
    "rve_asset_catalog_requests_total",
    "rve_ws_project_connections_current",
    "rve_ws_project_rooms_current",
    "rve_ws_project_connections_total",
    "rve_ws_project_disconnects_total",
    "rve_ws_messages_total",
    "rve_ws_binary_update_bytes_bucket",
    "rve_ws_json_messages_total",
    "rve_ws_broadcast_duration_seconds_bucket",
}


def test_observability_compose_declares_prometheus_and_grafana():
    compose = COMPOSE_FILE.read_text(encoding="utf-8")

    assert "prometheus:" in compose
    assert "grafana:" in compose
    assert "--web.listen-address=127.0.0.1:9090" in compose
    assert "GF_SERVER_HTTP_ADDR=127.0.0.1" in compose
    assert "./ops/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro" in compose
    assert "./ops/grafana/provisioning:/etc/grafana/provisioning:ro" in compose
    assert "./ops/grafana/dashboards:/var/lib/grafana/dashboards:ro" in compose


def test_prometheus_scrapes_allowlisted_backend_metrics_bridge():
    config = PROMETHEUS_CONFIG.read_text(encoding="utf-8")

    assert "job_name: renpy-visual-editor-backend" in config
    assert "scheme: https" in config
    assert "metrics_path: /internal/metrics" in config
    assert "renpy.online:443" in config


def test_grafana_provisions_prometheus_datasource_and_dashboards():
    datasource = GRAFANA_DATASOURCE.read_text(encoding="utf-8")
    dashboards = GRAFANA_DASHBOARD_PROVISIONING.read_text(encoding="utf-8")

    assert "type: prometheus" in datasource
    assert "url: http://127.0.0.1:9090" in datasource
    assert "isDefault: true" in datasource
    assert "/var/lib/grafana/dashboards" in dashboards


def test_grafana_dashboards_are_json_and_reference_implemented_metrics():
    referenced_metrics = set()

    for dashboard_file in DASHBOARD_FILES:
        dashboard = json.loads(dashboard_file.read_text(encoding="utf-8"))
        assert dashboard["title"].startswith("RenPy Visual Editor")
        assert dashboard.get("panels")

        dashboard_text = json.dumps(dashboard)
        referenced_metrics.update(re.findall(r"\brve_[a-z0-9_]+(?:_bucket|_total|_current)?\b", dashboard_text))

    assert {
        "rve_http_requests_total",
        "rve_graph_import_requests_total",
        "rve_graph_export_requests_total",
        "rve_ws_project_connections_current",
        "rve_ws_messages_total",
    }.issubset(referenced_metrics)
    assert referenced_metrics <= IMPLEMENTED_METRIC_NAMES
