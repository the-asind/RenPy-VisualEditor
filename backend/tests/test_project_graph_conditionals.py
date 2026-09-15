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


def nodes_by_type(graph, node_type):
    return [node for node in graph.nodes if node.type == node_type]


def test_if_elif_else_import_as_first_class_branch_nodes():
    graph = import_mouse_graph()

    if_nodes = nodes_by_type(graph, "if")
    elif_nodes = nodes_by_type(graph, "elif")
    else_nodes = nodes_by_type(graph, "else")

    assert [node.content for node in if_nodes] == ["if crumb_count > 2:"]
    assert [node.content for node in elif_nodes] == ["elif crumb_count == 1:"]
    assert [node.content for node in else_nodes] == ["else:"]
    assert if_nodes[0].metadata["condition"] == "crumb_count > 2"
    assert elif_nodes[0].metadata["condition"] == "crumb_count == 1"
    assert else_nodes[0].metadata["condition"] is None


def test_statements_inside_if_elif_else_are_child_nodes():
    graph = import_mouse_graph()
    branches = {node.type: node for node in graph.nodes if node.type in {"if", "elif", "else"}}

    branch_children = [
        node
        for node in graph.nodes
        if node.parent_node_id in {branch.id for branch in branches.values()}
    ]

    assert {
        (child.parent_node_id, child.type, child.content)
        for child in branch_children
    } == {
        (branches["if"].id, "action", 'r "This is either a feast or a cycle."'),
        (branches["elif"].id, "action", 'r "One crumb is enough for a prototype."'),
        (branches["else"].id, "action", 'r "No crumbs, no graph."'),
    }


def test_comments_inside_labels_are_preserved_inside_action_blocks():
    graph = import_mouse_graph()
    action_blocks = {node.content for node in nodes_by_type(graph, "action")}

    assert any("# RenPy wakes up under the keyboard." in block for block in action_blocks)
    assert any("# The duck says nothing, which RenPy treats as approval." in block for block in action_blocks)
    assert any("# Presentation and timing statements should stay action/raw nodes." in block for block in action_blocks)


def test_conditionals_and_comments_survive_snapshot_roundtrip():
    graph = import_mouse_graph()
    restored = ProjectGraphSnapshotCodec.load(ProjectGraphSnapshotCodec.dump(graph))

    original = [
        (node.id, node.type, node.content, node.parent_node_id, node.metadata)
        for node in graph.nodes
        if node.type in {"if", "elif", "else", "action"}
    ]
    roundtripped = [
        (node.id, node.type, node.content, node.parent_node_id, node.metadata)
        for node in restored.nodes
        if node.type in {"if", "elif", "else", "action"}
    ]

    assert roundtripped == original
