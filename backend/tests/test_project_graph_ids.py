from pathlib import Path

from app.services.project_graph.editor import ProjectGraphEditor
from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.snapshot import ProjectGraphSnapshotCodec

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"


def import_mouse_graph():
    return ProjectGraphImporter().import_files(
        project_id="mouse-renpy-project",
        files=[
            FIXTURE_DIR / "renpy_mouse_day_1.rpy",
            FIXTURE_DIR / "renpy_mouse_day_2.rpy",
        ],
    )


def test_project_graph_snapshot_roundtrip_preserves_generated_ids():
    graph = import_mouse_graph()
    original_file_ids = [file.id for file in graph.files]

    snapshot = ProjectGraphSnapshotCodec.dump(graph)
    restored = ProjectGraphSnapshotCodec.load(snapshot)

    assert restored.project_id == graph.project_id
    assert [file.id for file in restored.files] == original_file_ids
    assert [file.path for file in restored.files] == [file.path for file in graph.files]
    assert restored.source_index == graph.source_index


def test_source_content_edit_preserves_file_frame_id():
    graph = import_mouse_graph()
    file_id = graph.files[0].id
    old_path = graph.files[0].path

    updated = ProjectGraphEditor().update_source_content(
        graph=graph,
        file_id=file_id,
        content="label start:\n    \"RenPy edits a crumb.\"\n    return\n",
    )

    assert updated.files[0].id == file_id
    assert updated.files[0].path == old_path
    assert updated.source_index["files"][file_id]["content"].startswith("label start:")