from pathlib import Path

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


def test_presentation_lines_import_as_raw_action_nodes():
    graph = import_mouse_graph()
    raw_actions = {node.content for node in graph.nodes if node.type == "raw_action"}

    assert "scene kitchen morning" in raw_actions
    assert "show renpy curious at left with dissolve" in raw_actions
    assert "show renpy happy at right with hpunch" in raw_actions
    assert "play music \"tiny_footsteps.ogg\" fadein 1.0" in raw_actions
    assert "with dissolve" in raw_actions


def test_dialogue_lines_import_as_dialogue_nodes():
    graph = import_mouse_graph()
    dialogue = {node.content for node in graph.nodes if node.type == "dialogue"}

    assert 'r "I smell a cheese commit."' in dialogue
    assert '"The tiny editor cursor blinks like a lighthouse."' in dialogue
    assert 'r "Stable export tastes better than exact whitespace."' in dialogue


def test_python_and_atl_blocks_import_as_raw_block_nodes():
    graph = import_mouse_graph()
    raw_blocks = {node.content for node in graph.nodes if node.type == "raw_block"}

    assert any(block.startswith("show renpy happy:") and "linear 0.2 yoffset -10" in block for block in raw_blocks)
    assert any(block.startswith("python:") and "raw python block survives the graph" in block for block in raw_blocks)


def test_raw_action_and_raw_block_nodes_are_non_blocking():
    graph = import_mouse_graph()

    assert graph.diagnostics == []
    assert any(node.type == "raw_action" for node in graph.nodes)
    assert any(node.type == "raw_block" for node in graph.nodes)


def test_action_and_raw_nodes_survive_snapshot_roundtrip():
    graph = import_mouse_graph()
    restored = ProjectGraphSnapshotCodec.load(ProjectGraphSnapshotCodec.dump(graph))

    original = [(node.id, node.type, node.content, node.label_id) for node in graph.nodes]
    roundtripped = [(node.id, node.type, node.content, node.label_id) for node in restored.nodes]

    assert roundtripped == original
