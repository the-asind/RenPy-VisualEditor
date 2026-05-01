import json
import os
from pathlib import Path

import pytest

from app.services.database import DatabaseService
from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.snapshot import ProjectGraphSnapshotCodec

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"


@pytest.fixture
def temp_database(tmp_path):
    original_db_path = os.environ.get("DATABASE_PATH")
    os.environ["DATABASE_PATH"] = str(tmp_path / "renpy_editor_test.db")
    try:
        yield DatabaseService()
    finally:
        if original_db_path is None:
            os.environ.pop("DATABASE_PATH", None)
        else:
            os.environ["DATABASE_PATH"] = original_db_path


def create_project(db_service: DatabaseService) -> str:
    user_id = db_service.create_user(
        username="renpy_snapshot_keeper",
        email="renpy_snapshot_keeper@example.com",
        password_hash="hash",
    )
    return db_service.create_project("Mouse RenPy CRDT", user_id)


def import_mouse_graph(project_id: str):
    return ProjectGraphImporter().import_files(
        project_id=project_id,
        files=[
            FIXTURE_DIR / "renpy_mouse_day_1.rpy",
            FIXTURE_DIR / "renpy_mouse_day_2.rpy",
        ],
    )


def encode_project_graph_snapshot(graph) -> bytes:
    payload = ProjectGraphSnapshotCodec.dump(graph)
    return json.dumps(payload, sort_keys=True).encode("utf-8")


def decode_project_graph_snapshot(snapshot: bytes):
    return ProjectGraphSnapshotCodec.load(json.loads(snapshot.decode("utf-8")))


def test_project_crdt_snapshot_roundtrip_preserves_project_graph_ids(temp_database):
    project_id = create_project(temp_database)
    graph = import_mouse_graph(project_id)
    snapshot = encode_project_graph_snapshot(graph)

    temp_database.save_project_crdt_snapshot(project_id, snapshot)
    restored_snapshot = temp_database.get_project_crdt_snapshot(project_id)
    restored_graph = decode_project_graph_snapshot(restored_snapshot)

    assert restored_snapshot == snapshot
    assert [file.id for file in restored_graph.files] == [file.id for file in graph.files]
    assert [label.id for label in restored_graph.labels] == [label.id for label in graph.labels]
    assert [node.id for node in restored_graph.nodes] == [node.id for node in graph.nodes]


def test_project_crdt_snapshot_can_be_overwritten_with_opaque_binary(temp_database):
    project_id = create_project(temp_database)

    assert temp_database.get_project_crdt_snapshot(project_id) is None

    first_snapshot = b"\x00loro-snapshot-v1\xff"
    second_snapshot = b"\x00loro-snapshot-v2\xff\x10"

    temp_database.save_project_crdt_snapshot(project_id, first_snapshot)
    temp_database.save_project_crdt_snapshot(project_id, second_snapshot)

    assert temp_database.get_project_crdt_snapshot(project_id) == second_snapshot


def test_database_initialization_migrates_existing_database_with_missing_crdt_snapshot_table(temp_database):
    with temp_database._get_connection() as conn:
        conn.execute("DROP TABLE IF EXISTS project_crdt_snapshots")

    migrated = DatabaseService()

    with migrated._get_connection() as conn:
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_crdt_snapshots'"
        )
        assert cursor.fetchone() is not None
