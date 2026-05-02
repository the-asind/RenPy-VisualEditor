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
    os.environ["DATABASE_PATH"] = str(tmp_path / "renpy_editor_test.db")
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
        username="snapshot_owner",
        email="snapshot_owner@example.com",
        password_hash="hash",
    )
    project_id = temp_database.create_project("Mouse RenPy Snapshot", user_id)
    temp_database.grant_project_access(project_id, user_id, "role_owner")
    return {"id": user_id, "username": "snapshot_owner", "project_id": project_id}


@pytest.fixture
def client(temp_database, project_owner):
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


def minimal_export_graph(project_id, diagnostics=None):
    return {
        "project_id": project_id,
        "files": [
            {
                "id": "file-day-1",
                "path": "renpy_mouse_day_1.rpy",
                "order": "0000",
                "visual": {"position": {"x": 0, "y": 0}, "size": {"width": 800, "height": 600}},
            }
        ],
        "labels": [
            {
                "id": "label-start",
                "file_id": "file-day-1",
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
                "file_id": "file-day-1",
                "label_id": "label-start",
                "qualified_name": "start",
                "content": "label start:",
                "visual": {"position": {"x": 32, "y": 32}, "size": {"width": 260, "height": 72}},
            }
        ],
        "nodes": [
            {
                "id": "node-intro",
                "file_id": "file-day-1",
                "label_id": "label-start",
                "parent_node_id": None,
                "type": "dialogue",
                "content": 'r "RenPy Mouse exports from ProjectGraph."',
                "order": "0000",
                "source_span": {"start_line": 1, "end_line": 1},
                "metadata": {"editor_note": "must not export"},
                "visual": {"position": {"x": 64, "y": 136}, "size": {"width": 360, "height": 88}},
            }
        ],
        "edges": [],
        "diagnostics": diagnostics or [],
        "source_index": {"files": {}},
    }


def test_project_graph_snapshot_route_returns_opaque_binary_snapshot(client, temp_database, project_owner):
    snapshot = b"\x00loro-project-graph-snapshot\xff"
    temp_database.save_project_crdt_snapshot(project_owner["project_id"], snapshot)

    response = client.get(f"/api/projects/{project_owner['project_id']}/graph-snapshot")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.content == snapshot


def test_project_graph_snapshot_route_returns_404_when_snapshot_missing(client, project_owner):
    response = client.get(f"/api/projects/{project_owner['project_id']}/graph-snapshot")

    assert response.status_code == 404
    assert response.json()["detail"] == "Project graph snapshot not found"


def test_project_graph_snapshot_route_saves_opaque_binary_snapshot(client, temp_database, project_owner):
    snapshot = b"\x01updated-loro-project-graph-snapshot\x02"

    response = client.put(
        f"/api/projects/{project_owner['project_id']}/graph-snapshot",
        content=snapshot,
        headers={"content-type": "application/octet-stream"},
    )

    assert response.status_code == 200
    assert response.json() == {"status": "success"}
    assert temp_database.get_project_crdt_snapshot(project_owner["project_id"]) == snapshot


def test_project_graph_export_route_uses_project_graph_payload(client, project_owner):
    graph = minimal_export_graph(project_owner["project_id"])

    response = client.post(f"/api/projects/{project_owner['project_id']}/graph-export", json=graph)

    assert response.status_code == 200
    assert response.json() == {
        "files": {
            "renpy_mouse_day_1.rpy": 'label start:\n    r "RenPy Mouse exports from ProjectGraph."\n'
        }
    }


def test_project_graph_export_route_allows_non_blocking_diagnostics(client, project_owner):
    graph = minimal_export_graph(
        project_owner["project_id"],
        diagnostics=[
            {
                "id": "diagnostic-unresolved",
                "code": "unresolved_target",
                "severity": "warning",
                "message": "RenPy Mouse has not built this tunnel yet.",
                "blocking": False,
                "file_id": "file-day-1",
                "label_id": "label-start",
                "node_id": "node-intro",
                "source_span": {"start_line": 2, "end_line": 2},
                "metadata": {"target": "missing_tunnel"},
            }
        ],
    )

    response = client.post(f"/api/projects/{project_owner['project_id']}/graph-export", json=graph)

    assert response.status_code == 200
    assert "renpy_mouse_day_1.rpy" in response.json()["files"]


def test_project_graph_export_route_blocks_explicitly_blocking_diagnostics(client, project_owner):
    graph = minimal_export_graph(
        project_owner["project_id"],
        diagnostics=[
            {
                "id": "diagnostic-blocking",
                "code": "unsafe_containment",
                "severity": "error",
                "message": "RenPy Mouse cannot safely export this nested crumb.",
                "blocking": True,
                "file_id": "file-day-1",
                "label_id": "label-start",
                "node_id": "node-intro",
                "source_span": {"start_line": 2, "end_line": 3},
                "metadata": {"reason": "ambiguous indentation"},
            }
        ],
    )

    response = client.post(f"/api/projects/{project_owner['project_id']}/graph-export", json=graph)

    assert response.status_code == 400
    assert response.json()["detail"] == {
        "message": "ProjectGraph export blocked by blocking diagnostics",
        "diagnostics": [
            {
                "id": "diagnostic-blocking",
                "code": "unsafe_containment",
                "severity": "error",
                "message": "RenPy Mouse cannot safely export this nested crumb.",
                "node_id": "node-intro",
            }
        ],
    }
