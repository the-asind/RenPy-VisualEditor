import json
import os
import subprocess
from collections import Counter
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.routes import projects
from app.api.routes.auth import get_current_user
from app.main import app
from app.services.database import DatabaseService
from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.resolver import ProjectGraphResolver

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"
ROOT_DIR = Path(__file__).resolve().parents[2]


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
        username="import_owner",
        email="import_owner@example.com",
        password_hash="hash",
    )
    project_id = temp_database.create_project("Mouse RenPy Import", user_id)
    temp_database.grant_project_access(project_id, user_id, "role_owner")
    return {"id": user_id, "username": "import_owner", "project_id": project_id}


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


def _upload_files(client: TestClient, project_id: str, filenames: list[str]):
    handles = []
    try:
        files = []
        for filename in filenames:
            handle = (FIXTURE_DIR / filename).open("rb")
            handles.append(handle)
            files.append(("files", (filename, handle, "text/plain")))

        return client.post(f"/api/projects/{project_id}/graph-import", files=files)
    finally:
        for handle in handles:
            handle.close()


def _upload_directory_import(
    client: TestClient,
    project_id: str,
    file_specs: list[tuple[str, str]],
    asset_catalog: dict,
):
    handles = []
    try:
        files = []
        file_paths = []
        for relative_path, fixture_name in file_specs:
            handle = (FIXTURE_DIR / fixture_name).open("rb")
            handles.append(handle)
            files.append(("files", (Path(relative_path).name, handle, "text/plain")))
            file_paths.append(relative_path)

        return client.post(
            f"/api/projects/{project_id}/graph-import",
            data={
                "file_paths": file_paths,
                "asset_catalog": json.dumps(asset_catalog),
            },
            files=files,
        )
    finally:
        for handle in handles:
            handle.close()


def _decode_loro_snapshot(snapshot: bytes) -> dict:
    result = subprocess.run(
        ["node", "scripts/project-graph-snapshot-cli.mjs", "decode"],
        input=snapshot,
        cwd=ROOT_DIR / "frontend",
        check=True,
        capture_output=True,
    )
    return json.loads(result.stdout.decode("utf-8"))


def test_project_graph_import_route_preserves_directory_paths_and_catalog(client, project_owner):
    asset_catalog = {
        "root_kind": "renpy-game-root",
        "game_directory": "game",
        "entries": [
            {
                "path": "scripts/renpy_mouse_day_1.rpy",
                "name": "renpy_mouse_day_1.rpy",
                "extension": ".rpy",
                "kind": "script",
                "size": 100,
                "lastModified": 1000,
            },
            {
                "path": "images/monika/monika 1a.png",
                "name": "monika 1a.png",
                "extension": ".png",
                "kind": "image",
                "size": 200,
                "lastModified": 2000,
            },
            {
                "path": "audio/t2.ogg",
                "name": "t2.ogg",
                "extension": ".ogg",
                "kind": "audio",
                "size": 300,
                "lastModified": 3000,
                "renpyNames": ["t2", "audio.t2"],
            },
        ],
        "characterImages": {"s": "sayori", "y": "yuri"},
    }

    response = _upload_directory_import(
        client,
        project_owner["project_id"],
        [
            ("scripts/renpy_mouse_day_1.rpy", "renpy_mouse_day_1.rpy"),
            ("chapters/renpy_mouse_day_2.rpy", "renpy_mouse_day_2.rpy"),
        ],
        asset_catalog,
    )

    assert response.status_code == 200
    assert response.json()["catalog_entry_count"] == 3

    snapshot_response = client.get(f"/api/projects/{project_owner['project_id']}/graph-snapshot")
    restored_graph = _decode_loro_snapshot(snapshot_response.content)

    assert [file["path"] for file in restored_graph["files"]] == [
        "scripts/renpy_mouse_day_1.rpy",
        "chapters/renpy_mouse_day_2.rpy",
    ]

    catalog_response = client.get(f"/api/projects/{project_owner['project_id']}/asset-catalog")
    assert catalog_response.status_code == 200
    catalog_payload = catalog_response.json()
    assert catalog_payload["project_id"] == project_owner["project_id"]
    assert catalog_payload["revision"] == 1
    assert catalog_payload["catalog"]["entries"] == sorted(asset_catalog["entries"], key=lambda entry: entry["path"].lower())


def test_project_graph_import_route_rejects_unsafe_directory_paths(client, project_owner):
    response = _upload_directory_import(
        client,
        project_owner["project_id"],
        [("../outside.rpy", "renpy_mouse_day_1.rpy")],
        {
            "root_kind": "renpy-game-root",
            "game_directory": "game",
            "entries": [],
        },
    )

    assert response.status_code == 400
    assert "Unsafe project file path" in response.json()["detail"]


def test_project_asset_catalog_update_is_owner_only(temp_database, project_owner):
    collaborator_id = temp_database.create_user(
        username="catalog_collaborator",
        email="catalog_collaborator@example.com",
        password_hash="hash",
    )
    temp_database.grant_project_access(project_owner["project_id"], collaborator_id, "role_editor")

    original_projects_db = projects.db_service
    original_current_user_override = app.dependency_overrides.get(get_current_user)
    projects.db_service = temp_database

    async def collaborator_user():
        return {"id": collaborator_id, "username": "catalog_collaborator"}

    app.dependency_overrides[get_current_user] = collaborator_user
    try:
        test_client = TestClient(app)
        response = test_client.put(
            f"/api/projects/{project_owner['project_id']}/asset-catalog",
            json={
                "root_kind": "renpy-game-root",
                "game_directory": "game",
                "entries": [
                    {
                        "path": "images/private/local-only.png",
                        "name": "local-only.png",
                        "extension": ".png",
                        "kind": "image",
                        "size": 10,
                        "lastModified": 10,
                    }
                ],
            },
        )
    finally:
        if original_current_user_override is None:
            app.dependency_overrides.pop(get_current_user, None)
        else:
            app.dependency_overrides[get_current_user] = original_current_user_override
        projects.db_service = original_projects_db

    assert response.status_code == 403
    assert temp_database.get_project_asset_catalog(project_owner["project_id"]) is None


def test_project_graph_import_route_imports_files_and_saves_loro_snapshot(client, project_owner):
    response = _upload_files(
        client,
        project_owner["project_id"],
        [
            "renpy_mouse_day_1.rpy",
            "renpy_mouse_day_2.rpy",
            "renpy_mouse_diagnostics.rpy",
        ],
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["project_id"] == project_owner["project_id"]
    assert payload["file_count"] == 3
    assert payload["label_count"] >= 10
    assert payload["node_count"] >= 20
    assert payload["edge_count"] >= 3
    assert payload["snapshot_available"] is True
    assert payload["diagnostics"] == {
        "total": 5,
        "blocking": 0,
        "info": 2,
        "warning": 3,
        "error": 0,
    }

    snapshot_response = client.get(f"/api/projects/{project_owner['project_id']}/graph-snapshot")
    assert snapshot_response.status_code == 200
    assert snapshot_response.headers["content-type"] == "application/octet-stream"

    restored_graph = _decode_loro_snapshot(snapshot_response.content)
    assert restored_graph["project_id"] == project_owner["project_id"]
    assert [file["path"] for file in restored_graph["files"]] == [
        "renpy_mouse_day_1.rpy",
        "renpy_mouse_day_2.rpy",
        "renpy_mouse_diagnostics.rpy",
    ]
    assert {label["qualified_name"] for label in restored_graph["labels"]} >= {
        "start",
        "start.crumb_trail",
        "day_two.cheese_cache",
        "duplicate_cheese",
    }
    assert {
        edge["metadata"]["resolved_qualified_name"]
        for edge in restored_graph["edges"]
        if "resolved_qualified_name" in edge["metadata"]
    } >= {"start.shared_nook", "day_two.cheese_cache", "ending_export"}


def test_project_graph_import_route_export_contract_has_no_editor_metadata(client, project_owner):
    response = _upload_files(
        client,
        project_owner["project_id"],
        ["renpy_mouse_day_1.rpy", "renpy_mouse_day_2.rpy"],
    )
    assert response.status_code == 200

    snapshot_response = client.get(f"/api/projects/{project_owner['project_id']}/graph-snapshot")
    graph = _decode_loro_snapshot(snapshot_response.content)

    export_response = client.post(f"/api/projects/{project_owner['project_id']}/graph-export", json=graph)

    assert export_response.status_code == 200
    exported = export_response.json()["files"]
    assert set(exported) == {"renpy_mouse_day_1.rpy", "renpy_mouse_day_2.rpy"}
    joined = "\n".join(exported.values())
    assert "editor_note" not in joined
    assert "position_x" not in joined
    assert "project_graph" not in joined
    assert "label start:" in exported["renpy_mouse_day_1.rpy"]
    assert "label day_two:" in exported["renpy_mouse_day_2.rpy"]


def test_project_graph_import_route_preserves_non_blocking_diagnostics(client, project_owner):
    response = _upload_files(
        client,
        project_owner["project_id"],
        [
            "renpy_mouse_day_1.rpy",
            "renpy_mouse_day_2.rpy",
            "renpy_mouse_diagnostics.rpy",
        ],
    )
    assert response.status_code == 200
    assert response.json()["diagnostics"]["blocking"] == 0

    snapshot_response = client.get(f"/api/projects/{project_owner['project_id']}/graph-snapshot")
    graph = _decode_loro_snapshot(snapshot_response.content)
    diagnostics = graph["diagnostics"]
    diagnostics_by_code = {}
    for diagnostic in diagnostics:
        diagnostics_by_code.setdefault(diagnostic["code"], []).append(diagnostic)

    assert {diagnostic["blocking"] for diagnostic in diagnostics} == {False}
    assert len(diagnostics_by_code["duplicate_global_label"]) == 1
    assert len(diagnostics_by_code["unresolved_target"]) == 1
    assert len(diagnostics_by_code["dynamic_target"]) == 2
    assert len(diagnostics_by_code["unsupported_control_block"]) == 1
    assert all(diagnostic["node_id"] for diagnostic in diagnostics_by_code["dynamic_target"])
    assert all(diagnostic["node_id"] for diagnostic in diagnostics_by_code["unsupported_control_block"])
    assert not any(diagnostic["code"] in {"scene", "show", "play", "python"} for diagnostic in diagnostics)


def _semantic_signature(graph: dict) -> dict:
    return {
        "labels": sorted((label["path"], label["qualified_name"], label["scope"]) for label in _labels_with_paths(graph)),
        "node_types": Counter(node["type"] for node in graph["nodes"]),
        "edges": sorted(
            (
                edge["kind"],
                edge["metadata"].get("target"),
                edge["metadata"].get("resolved_qualified_name"),
            )
            for edge in graph["edges"]
        ),
        "diagnostics": Counter(diagnostic["code"] for diagnostic in graph["diagnostics"]),
        "dialogue": sorted(node["content"] for node in graph["nodes"] if node["type"] == "dialogue"),
        "comments": sorted(node["content"] for node in graph["nodes"] if node["type"] == "comment"),
        "raw_blocks": sorted(node["metadata"].get("raw_block_type") for node in graph["nodes"] if node["type"] == "raw_block"),
        "actions": sorted(
            node["content"]
            for node in graph["nodes"]
            if node["type"] in {"raw_action", "action"} and not node["content"].startswith("$ ")
        ),
    }


def _labels_with_paths(graph: dict) -> list[dict]:
    files_by_id = {file["id"]: file for file in graph["files"]}
    return [
        {
            **label,
            "path": files_by_id[label["file_id"]]["path"],
        }
        for label in graph["labels"]
    ]


def test_project_graph_import_export_reimport_preserves_mvp_semantics(client, project_owner, tmp_path):
    import_response = _upload_files(
        client,
        project_owner["project_id"],
        [
            "renpy_mouse_day_1.rpy",
            "renpy_mouse_day_2.rpy",
            "renpy_mouse_diagnostics.rpy",
        ],
    )
    assert import_response.status_code == 200

    snapshot_response = client.get(f"/api/projects/{project_owner['project_id']}/graph-snapshot")
    imported_graph = _decode_loro_snapshot(snapshot_response.content)

    export_response = client.post(f"/api/projects/{project_owner['project_id']}/graph-export", json=imported_graph)
    assert export_response.status_code == 200

    exported_paths = []
    for filename, content in export_response.json()["files"].items():
        path = tmp_path / filename
        path.write_text(content, encoding="utf-8")
        exported_paths.append(path)

    reimported_graph = ProjectGraphResolver().resolve(
        ProjectGraphImporter().import_files(project_owner["project_id"], sorted(exported_paths))
    )
    reimported_snapshot = {
        "project_id": reimported_graph.project_id,
        "files": [
            {"id": file.id, "path": file.path, "order": file.order}
            for file in reimported_graph.files
        ],
        "labels": [
            {
                "id": label.id,
                "file_id": label.file_id,
                "qualified_name": label.qualified_name,
                "scope": label.scope,
            }
            for label in reimported_graph.labels
        ],
        "nodes": [
            {
                "type": node.type,
                "content": node.content,
                "metadata": node.metadata,
            }
            for node in reimported_graph.nodes
        ],
        "edges": [
            {
                "kind": edge.kind,
                "metadata": edge.metadata,
            }
            for edge in reimported_graph.edges
        ],
        "diagnostics": [
            {
                "code": diagnostic.code,
            }
            for diagnostic in reimported_graph.diagnostics
        ],
    }

    assert _semantic_signature(reimported_snapshot) == _semantic_signature(imported_graph)
    joined_export = "\n".join(export_response.json()["files"].values())
    assert "# RenPy wakes up under the keyboard." in joined_export
    assert "show renpy happy:" in joined_export
    assert "renpy_note = \"raw python block survives the graph\"" in joined_export


def test_mvp_2_release_contract_import_open_edit_export_reimport(client, project_owner, tmp_path):
    import_response = _upload_files(
        client,
        project_owner["project_id"],
        [
            "renpy_mouse_day_1.rpy",
            "renpy_mouse_day_2.rpy",
            "renpy_mouse_diagnostics.rpy",
        ],
    )
    assert import_response.status_code == 200
    assert import_response.json()["diagnostics"]["blocking"] == 0

    snapshot_response = client.get(f"/api/projects/{project_owner['project_id']}/graph-snapshot")
    assert snapshot_response.status_code == 200
    opened_graph = _decode_loro_snapshot(snapshot_response.content)

    edited_action = next(node for node in opened_graph["nodes"] if node["type"] == "action")
    edited_action["content"] = 'r "RenPy Mouse signs the MVP 2 release scroll."'
    edited_action["metadata"]["editor_state"] = "must not export"
    opened_graph["files"][0]["visual"]["position"] = {"x": 321, "y": 123}

    export_response = client.post(f"/api/projects/{project_owner['project_id']}/graph-export", json=opened_graph)
    assert export_response.status_code == 200
    exported = export_response.json()["files"]
    assert set(exported) == {
        "renpy_mouse_day_1.rpy",
        "renpy_mouse_day_2.rpy",
        "renpy_mouse_diagnostics.rpy",
    }

    joined_export = "\n".join(exported.values())
    assert 'r "RenPy Mouse signs the MVP 2 release scroll."' in joined_export
    assert "editor_state" not in joined_export
    assert "position" not in joined_export

    exported_paths = []
    for filename, content in exported.items():
        path = tmp_path / filename
        path.write_text(content, encoding="utf-8")
        exported_paths.append(path)

    reimported_graph = ProjectGraphResolver().resolve(
        ProjectGraphImporter().import_files(project_owner["project_id"], sorted(exported_paths))
    )
    reimported_snapshot = {
        "project_id": reimported_graph.project_id,
        "files": [
            {"id": file.id, "path": file.path, "order": file.order}
            for file in reimported_graph.files
        ],
        "labels": [
            {
                "id": label.id,
                "file_id": label.file_id,
                "qualified_name": label.qualified_name,
                "scope": label.scope,
            }
            for label in reimported_graph.labels
        ],
        "nodes": [
            {
                "type": node.type,
                "content": node.content,
                "metadata": node.metadata,
            }
            for node in reimported_graph.nodes
        ],
        "edges": [
            {
                "kind": edge.kind,
                "metadata": edge.metadata,
            }
            for edge in reimported_graph.edges
        ],
        "diagnostics": [
            {
                "code": diagnostic.code,
            }
            for diagnostic in reimported_graph.diagnostics
        ],
    }

    assert _semantic_signature(reimported_snapshot) == _semantic_signature(opened_graph)
