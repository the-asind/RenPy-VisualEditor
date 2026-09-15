import re
import os

import pytest
from fastapi.testclient import TestClient

from app.api.routes import projects
from app.api.routes.auth import get_current_user
from app.main import app
from app.services.database import DatabaseService


@pytest.fixture
def temp_database(tmp_path):
    original_db_path = os.environ.get("DATABASE_PATH")
    os.environ["DATABASE_PATH"] = str(tmp_path / "renpy_editor_metrics_test.db")
    db_service = DatabaseService()
    try:
        yield db_service
    finally:
        db_service.close()
        if original_db_path is None:
            os.environ.pop("DATABASE_PATH", None)
        else:
            os.environ["DATABASE_PATH"] = original_db_path


@pytest.fixture
def project_owner(temp_database):
    user_id = temp_database.create_user(
        username="metrics_owner",
        email="metrics_owner@example.com",
        password_hash="hash",
    )
    project_id = temp_database.create_project("Metrics Mouse Project", user_id)
    temp_database.grant_project_access(project_id, user_id, "role_owner")
    return {"id": user_id, "username": "metrics_owner", "project_id": project_id}


@pytest.fixture
def authenticated_client(temp_database, project_owner):
    original_projects_db = projects.db_service
    original_current_user_override = app.dependency_overrides.get(get_current_user)
    projects.db_service = temp_database

    async def override_current_user():
        return {"id": project_owner["id"], "username": project_owner["username"]}

    app.dependency_overrides[get_current_user] = override_current_user
    try:
        yield TestClient(app)
    finally:
        if original_current_user_override is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = original_current_user_override
        projects.db_service = original_projects_db


def minimal_export_graph(project_id: str, diagnostics=None):
    return {
        "project_id": project_id,
        "files": [
            {
                "id": "file-metrics",
                "path": "metrics_mouse.rpy",
                "order": "0000",
                "visual": {"position": {"x": 0, "y": 0}, "size": {"width": 800, "height": 600}},
            }
        ],
        "labels": [
            {
                "id": "label-start",
                "file_id": "file-metrics",
                "parent_label_id": None,
                "name": "start",
                "qualified_name": "start",
                "scope": "global",
                "label_start_node_id": "label-start-node",
                "source_span": {"start_line": 0, "end_line": 0},
                "visual": {"position": {"x": 48, "y": 48}, "size": {"width": 640, "height": 420}},
            }
        ],
        "label_starts": [
            {
                "id": "label-start-node",
                "file_id": "file-metrics",
                "label_id": "label-start",
                "qualified_name": "start",
                "content": "label start:",
                "visual": {"position": {"x": 32, "y": 32}, "size": {"width": 180, "height": 56}},
            }
        ],
        "nodes": [
            {
                "id": "node-action",
                "file_id": "file-metrics",
                "label_id": "label-start",
                "parent_node_id": None,
                "type": "action",
                "content": '"RenPy the mouse checks observability."',
                "order": "0001",
                "source_span": {"start_line": 1, "end_line": 1},
                "metadata": {},
                "visual": {"position": {"x": 32, "y": 120}, "size": {"width": 300, "height": 96}},
            }
        ],
        "edges": [],
        "diagnostics": diagnostics or [],
        "source_index": {"files": {}},
    }


def test_metrics_endpoint_exposes_prometheus_text_after_health_request():
    client = TestClient(app)

    health_response = client.get("/health")
    metrics_response = client.get("/metrics")

    assert health_response.status_code == 200
    assert metrics_response.status_code == 200
    assert "text/plain" in metrics_response.headers["content-type"]
    assert "rve_http_requests_total" in metrics_response.text
    assert 'route="/health"' in metrics_response.text


def test_http_metrics_use_route_templates_instead_of_concrete_project_ids():
    client = TestClient(app)

    client.get("/api/projects/project-123/graph-snapshot")
    metrics_response = client.get("/metrics")

    assert metrics_response.status_code == 200
    assert 'route="/api/projects/{project_id}/graph-snapshot"' in metrics_response.text
    assert 'route="/api/projects/project-123/graph-snapshot"' not in metrics_response.text


def test_metrics_do_not_expose_forbidden_high_cardinality_label_names():
    client = TestClient(app)

    client.get("/api/projects/project-456/graph-snapshot")
    metrics_response = client.get("/metrics")

    assert metrics_response.status_code == 200
    assert not re.search(
        r'\b(project_id|user_id|node_id|file_path|asset_path|renpy_name)="',
        metrics_response.text,
    )


def test_snapshot_save_and_load_record_crdt_metrics(authenticated_client, project_owner):
    project_id = project_owner["project_id"]

    save_response = authenticated_client.put(
        f"/api/projects/{project_id}/graph-snapshot",
        content=b"metrics-snapshot",
        headers={"Content-Type": "application/octet-stream"},
    )
    load_response = authenticated_client.get(f"/api/projects/{project_id}/graph-snapshot")
    metrics_response = authenticated_client.get("/metrics")

    assert save_response.status_code == 200
    assert load_response.status_code == 200
    assert 'rve_crdt_snapshot_saves_total{result="success"}' in metrics_response.text
    assert 'rve_crdt_snapshot_loads_total{result="success"}' in metrics_response.text
    assert "rve_crdt_snapshot_bytes_bucket" in metrics_response.text


def test_export_blocked_by_diagnostics_records_export_metrics(authenticated_client, project_owner):
    project_id = project_owner["project_id"]
    graph = minimal_export_graph(
        project_id,
        diagnostics=[
            {
                "id": "diag-blocking",
                "code": "blocking_for_metrics",
                "severity": "error",
                "message": "Metrics mouse cannot export this graph.",
                "node_id": "node-action",
                "blocking": True,
            }
        ],
    )

    export_response = authenticated_client.post(f"/api/projects/{project_id}/graph-export", json=graph)
    metrics_response = authenticated_client.get("/metrics")

    assert export_response.status_code == 400
    assert 'rve_graph_export_requests_total{result="blocked"}' in metrics_response.text
    assert "rve_graph_export_blocking_diagnostics_bucket" in metrics_response.text


def test_asset_catalog_update_records_catalog_metrics(authenticated_client, project_owner):
    project_id = project_owner["project_id"]
    catalog = {
        "root_kind": "renpy-game-root",
        "game_directory": "game",
        "characterImages": {"m": "mouse"},
        "entries": [
            {"path": "images/mouse.png", "kind": "image", "size": 12, "lastModified": 1},
            {"path": "audio/squeak.ogg", "kind": "audio", "size": 34, "lastModified": 2},
        ],
    }

    response = authenticated_client.put(f"/api/projects/{project_id}/asset-catalog", json=catalog)
    metrics_response = authenticated_client.get("/metrics")

    assert response.status_code == 200
    assert 'rve_asset_catalog_requests_total{operation="save",result="success"}' in metrics_response.text
    assert 'rve_asset_catalog_entries_count{kind="image",operation="save"}' in metrics_response.text
    assert 'rve_asset_catalog_entries_count{kind="audio",operation="save"}' in metrics_response.text
    assert "rve_asset_catalog_character_image_mappings_bucket" in metrics_response.text


def test_graph_import_records_import_and_loro_bridge_metrics(authenticated_client, project_owner):
    project_id = project_owner["project_id"]
    files = [
        (
            "files",
            (
                "metrics_mouse.rpy",
                b'label start:\n    "RenPy the mouse imports metrics."\n    return\n',
                "text/plain",
            ),
        )
    ]

    import_response = authenticated_client.post(f"/api/projects/{project_id}/graph-import", files=files)
    metrics_response = authenticated_client.get("/metrics")

    assert import_response.status_code == 200
    assert 'rve_graph_import_requests_total{result="success",source="upload"}' in metrics_response.text
    assert "rve_graph_import_files_bucket" in metrics_response.text
    assert 'rve_loro_bridge_runs_total{operation="encode",result="success"}' in metrics_response.text
