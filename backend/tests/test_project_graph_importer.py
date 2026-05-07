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
    assert len(graph.labels) > 0
    assert len(graph.label_starts) == len(graph.labels)
    assert len(graph.nodes) > 0
    assert graph.edges == []


def _rect(entity):
    return {
        "x": entity.visual.position.x,
        "y": entity.visual.position.y,
        "width": entity.visual.size.width,
        "height": entity.visual.size.height,
    }


def _overlaps(left, right):
    left_rect = _rect(left)
    right_rect = _rect(right)
    return (
        left_rect["x"] < right_rect["x"] + right_rect["width"]
        and left_rect["x"] + left_rect["width"] > right_rect["x"]
        and left_rect["y"] < right_rect["y"] + right_rect["height"]
        and left_rect["y"] + left_rect["height"] > right_rect["y"]
    )


def test_import_assigns_compact_local_layout_for_label_and_nested_scenario_children():
    graph = ProjectGraphImporter().import_files(
        project_id="mouse-renpy-project",
        files=[
            FIXTURE_DIR / "renpy_mouse_day_1.rpy",
            FIXTURE_DIR / "renpy_mouse_day_2.rpy",
        ],
    )

    nodes_by_parent: dict[str, list] = {}
    for node in graph.nodes:
        parent_key = node.parent_node_id or node.label_id
        nodes_by_parent.setdefault(parent_key, []).append(node)

    for siblings in nodes_by_parent.values():
        ordered_siblings = sorted(
            siblings,
            key=lambda node: (
                node.source_span["start_line"] if node.source_span is not None else 999999,
                node.order,
            ),
        )
        for left_index, left in enumerate(ordered_siblings):
            for right in ordered_siblings[left_index + 1:]:
                assert not _overlaps(left, right), (
                    f"{left.content!r} overlaps {right.content!r} under "
                    f"{left.parent_node_id or left.label_id}"
                )

    nested_nodes = [node for node in graph.nodes if node.parent_node_id is not None]
    assert nested_nodes
    assert all(node.visual.position.x <= 48 for node in nested_nodes)
    for siblings in nodes_by_parent.values():
        if all(node.parent_node_id is not None for node in siblings):
            ordered = sorted(
                siblings,
                key=lambda node: (
                    node.source_span["start_line"] if node.source_span is not None else 999999,
                    node.order,
                ),
            )
            assert ordered[0].visual.position.y == 64.0
            cursor_y = 64.0
            for node in ordered:
                assert node.visual.position.y == cursor_y
                cursor_y += node.visual.size.height + 24.0


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
