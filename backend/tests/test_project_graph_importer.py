from pathlib import Path

from app.services.project_graph.importer import ProjectGraphImporter

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"


def test_imports_multiple_rpy_files_into_one_project_graph():
    files = [
        FIXTURE_DIR / "renpy_mouse_day_1.rpy",
        FIXTURE_DIR / "renpy_mouse_day_2.rpy",
        FIXTURE_DIR / "renpy_mouse_diagnostics.rpy",
    ]

    graph = ProjectGraphImporter().import_files(
        project_id="mouse-renpy-project",
        files=files,
    )

    assert graph.project_id == "mouse-renpy-project"
    assert [file.path for file in graph.files] == [path.name for path in files]
    assert [file.order for file in graph.files] == ["0000", "0001", "0002"]
    assert len({file.id for file in graph.files}) == 3
    assert graph.labels == []
    assert graph.label_starts == []
    assert graph.nodes == []
    assert graph.edges == []


def test_import_rejects_non_rpy_file(tmp_path):
    bad_file = tmp_path / "notes.txt"
    bad_file.write_text("label start:\n    return\n", encoding="utf-8")

    try:
        ProjectGraphImporter().import_files(
            project_id="mouse-renpy-project",
            files=[bad_file],
        )
    except ValueError as error:
        assert "Only .rpy files" in str(error)
    else:
        raise AssertionError("Expected non-.rpy import to fail")


def test_import_rejects_missing_file(tmp_path):
    missing_file = tmp_path / "missing.rpy"

    try:
        ProjectGraphImporter().import_files(
            project_id="mouse-renpy-project",
            files=[missing_file],
        )
    except FileNotFoundError as error:
        assert str(missing_file) in str(error)
    else:
        raise AssertionError("Expected missing file import to fail")