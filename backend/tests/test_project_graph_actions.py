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


def test_presentation_and_dialogue_lines_import_as_grouped_action_blocks():
    graph = import_mouse_graph()
    action_blocks = {node.content for node in graph.nodes if node.type == "action"}

    assert any(
        "\n".join(
            [
                "# RenPy wakes up under the keyboard.",
                "scene kitchen morning",
                "show renpy curious at left with dissolve",
                'r "I smell a cheese commit."',
                '"The tiny editor cursor blinks like a lighthouse."',
            ]
        ) in block
        for block in action_blocks
    )
    assert any("show renpy happy at right with hpunch" == block for block in action_blocks)
    assert any("play music \"tiny_footsteps.ogg\" fadein 1.0" in block for block in action_blocks)
    assert any("with dissolve" in block for block in action_blocks)


def test_action_blocks_keep_dialogue_searchable_and_editable_in_context():
    graph = import_mouse_graph()
    action_blocks = {node.content for node in graph.nodes if node.type == "action"}

    assert any('r "I smell a cheese commit."' in block for block in action_blocks)
    assert any('"The tiny editor cursor blinks like a lighthouse."' in block for block in action_blocks)
    assert any('r "Stable export tastes better than exact whitespace."' in block for block in action_blocks)


def test_python_and_atl_blocks_import_as_action_text():
    graph = import_mouse_graph()
    action_blocks = {node.content for node in graph.nodes if node.type == "action"}

    assert not any(node.type == "raw_block" for node in graph.nodes)
    assert any("show renpy happy:" in block and "    linear 0.2 yoffset -10" in block for block in action_blocks)
    assert any("python:" in block and "    renpy_note = \"raw python block survives the graph\"" in block for block in action_blocks)


def test_action_text_blocks_are_non_blocking():
    graph = import_mouse_graph()

    assert graph.diagnostics == []
    assert any(node.type == "action" for node in graph.nodes)
    assert not any(node.type == "raw_block" for node in graph.nodes)


def test_adjacent_linear_raw_and_action_statements_merge_into_one_action_block(tmp_path):
    source = tmp_path / "renpy_mouse_raw_scene.rpy"
    source.write_text(
        "\n".join(
            [
                "label start:",
                "    scene black",
                "    \"audio/love_music.mp3\" fadein 4.5 volume 0.4",
                "    show yuli happy:",
                "        xalign 0.7",
                "        yalign 0.5",
                "        zoom 0.77",
                "    show firstDays foreground cafe",
                "    r \"RenPy Mouse keeps the whole presentation beat in one block.\"",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    graph = ProjectGraphImporter().import_files(project_id="mouse-raw-scene", files=[source])
    top_level_nodes = [node for node in graph.nodes if node.parent_node_id is None]

    assert [node.type for node in top_level_nodes] == ["action"]
    assert top_level_nodes[0].content == "\n".join(
        [
            "scene black",
            "\"audio/love_music.mp3\" fadein 4.5 volume 0.4",
            "show yuli happy:",
            "    xalign 0.7",
            "    yalign 0.5",
            "    zoom 0.77",
            "show firstDays foreground cafe",
            "r \"RenPy Mouse keeps the whole presentation beat in one block.\"",
        ]
    )


def test_action_and_raw_nodes_survive_snapshot_roundtrip():
    graph = import_mouse_graph()
    restored = ProjectGraphSnapshotCodec.load(ProjectGraphSnapshotCodec.dump(graph))

    original = [(node.id, node.type, node.content, node.label_id) for node in graph.nodes]
    roundtripped = [(node.id, node.type, node.content, node.label_id) for node in restored.nodes]

    assert roundtripped == original
