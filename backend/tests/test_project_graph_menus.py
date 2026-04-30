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


def test_import_creates_menu_prompt_and_choice_nodes():
    graph = import_mouse_graph()

    menus = nodes_by_type(graph, "menu")
    prompts = nodes_by_type(graph, "menu_prompt")
    choices = nodes_by_type(graph, "menu_choice")

    assert len(menus) == 2
    assert {prompt.content for prompt in prompts} == {
        '"Which snack path should RenPy inspect?"',
        '"What should RenPy do with the cheese?"',
    }
    assert {choice.content for choice in choices} >= {
        '"Follow the golden crumb trail" if crumb_count == 0:',
        '"Ask the rubber duck for review":',
        '"Export it carefully":',
        '"Call a dynamic snack route":',
    }

    for prompt in prompts:
        assert prompt.parent_node_id in {menu.id for menu in menus}

    for choice in choices:
        assert choice.parent_node_id in {menu.id for menu in menus}


def test_menu_choice_condition_is_preserved_as_metadata():
    graph = import_mouse_graph()
    conditioned_choice = next(
        node for node in graph.nodes
        if node.type == "menu_choice" and "golden crumb" in node.content
    )

    assert conditioned_choice.metadata["choice_text"] == "Follow the golden crumb trail"
    assert conditioned_choice.metadata["condition"] == "crumb_count == 0"


def test_statements_inside_menu_choice_are_child_nodes():
    graph = import_mouse_graph()
    choices = nodes_by_type(graph, "menu_choice")
    jumps = nodes_by_type(graph, "jump")
    calls = nodes_by_type(graph, "call")

    crumb_choice = next(choice for choice in choices if "golden crumb" in choice.content)
    duck_choice = next(choice for choice in choices if "rubber duck" in choice.content)

    assert any(node.parent_node_id == crumb_choice.id and node.content == "jump .crumb_trail" for node in jumps)
    assert any(node.parent_node_id == duck_choice.id and node.content.startswith("call ask_duck") for node in calls)


def test_menu_nodes_survive_snapshot_roundtrip():
    graph = import_mouse_graph()
    restored = ProjectGraphSnapshotCodec.load(ProjectGraphSnapshotCodec.dump(graph))

    assert [(node.id, node.type, node.content, node.parent_node_id) for node in restored.nodes] == [
        (node.id, node.type, node.content, node.parent_node_id) for node in graph.nodes
    ]