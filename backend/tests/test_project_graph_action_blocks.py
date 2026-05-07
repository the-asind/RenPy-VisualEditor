from pathlib import Path

from app.services.project_graph.exporter import ProjectGraphExporter
from app.services.project_graph.importer import ProjectGraphImporter
from app.services.project_graph.resolver import ProjectGraphResolver

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "renpy_mouse"


def import_nested_if_graph():
    return ProjectGraphResolver().resolve(
        ProjectGraphImporter().import_files(
            project_id="mouse-renpy-action-blocks",
            files=[FIXTURE_DIR / "renpy_mouse_nested_if_blocks.rpy"],
        )
    )


def test_linear_story_chunks_import_as_single_action_blocks_until_branch_or_jump():
    graph = import_nested_if_graph()
    start_label = next(label for label in graph.labels if label.qualified_name == "nested_if_maze")
    top_level_nodes = [
        node
        for node in sorted(graph.nodes, key=lambda item: item.source_span["start_line"])
        if node.label_id == start_label.id and node.parent_node_id is None
    ]

    assert [node.type for node in top_level_nodes] == ["action", "if", "else", "action", "jump"]
    assert top_level_nodes[0].content == "\n".join(
        [
            "# RenPy Mouse enters the maze with too many tiny monologues.",
            "scene maze morning",
            "show renpy curious at center",
            'r "The first corridor smells like compiled cheese."',
            'r "The second corridor smells like a suspicious branch."',
            'r "The third corridor is just here to prove this stays one block."',
        ]
    )
    assert top_level_nodes[0].metadata["default_title"] == "# RenPy Mouse enters the maze with too many tiny monologues."
    assert top_level_nodes[-2].content == 'r "After the maze, the story becomes linear again."'


def test_nested_if_else_hierarchy_is_preserved_without_flattening_branch_blocks():
    graph = import_nested_if_graph()

    outer_if = next(node for node in graph.nodes if node.type == "if" and node.content == "if cheese_compass_ready:")
    outer_else = next(node for node in graph.nodes if node.type == "else" and node.parent_node_id is None)
    crumb_if = next(node for node in graph.nodes if node.type == "if" and node.content == "if crumb_count > 3:")
    crumb_else = next(node for node in graph.nodes if node.type == "else" and node.parent_node_id == outer_if.id)
    duck_if = next(node for node in graph.nodes if node.type == "if" and node.content == "if secret_duck_mode:")
    duck_else = next(node for node in graph.nodes if node.type == "else" and node.parent_node_id == crumb_if.id)
    backup_if = next(node for node in graph.nodes if node.type == "if" and node.content == "if backup_duck_ready:")
    backup_else = next(node for node in graph.nodes if node.type == "else" and node.parent_node_id == outer_else.id)

    assert crumb_if.parent_node_id == outer_if.id
    assert crumb_else.parent_node_id == outer_if.id
    assert duck_if.parent_node_id == crumb_if.id
    assert duck_else.parent_node_id == crumb_if.id
    assert backup_if.parent_node_id == outer_else.id
    assert backup_else.parent_node_id == outer_else.id

    action_children = [
        (node.parent_node_id, node.content)
        for node in graph.nodes
        if node.type == "action" and node.parent_node_id in {outer_if.id, crumb_if.id, duck_if.id, duck_else.id}
    ]
    assert (outer_if.id, 'r "The compass spins toward cheddar."') in action_children
    assert (
        crumb_if.id,
        "\n".join(["scene maze_core afternoon", 'r "The core has more crumbs than expected."']),
    ) in action_children
    assert (duck_if.id, 'r "The duck is wearing a tiny debugger."') in action_children
    assert (duck_else.id, 'r "No duck debugger. Only crumbs."') in action_children


def test_action_blocks_export_back_to_normalized_renpy_text(tmp_path):
    graph = import_nested_if_graph()
    exported = ProjectGraphExporter().export(graph)

    exported_path = tmp_path / "renpy_mouse_nested_if_blocks.rpy"
    exported_path.write_text(exported["renpy_mouse_nested_if_blocks.rpy"], encoding="utf-8")
    roundtripped = ProjectGraphResolver().resolve(
        ProjectGraphImporter().import_files(
            project_id="mouse-renpy-action-blocks",
            files=[exported_path],
        )
    )

    assert "scene maze morning" in exported["renpy_mouse_nested_if_blocks.rpy"]
    assert "if secret_duck_mode:" in exported["renpy_mouse_nested_if_blocks.rpy"]
    assert 'r "RenPy Mouse escapes with a smaller canvas."' in exported["renpy_mouse_nested_if_blocks.rpy"]
    assert [node.type for node in roundtripped.nodes].count("action") == [node.type for node in graph.nodes].count("action")
    assert [node.type for node in roundtripped.nodes].count("if") == [node.type for node in graph.nodes].count("if")
    assert [node.type for node in roundtripped.nodes].count("else") == [node.type for node in graph.nodes].count("else")
