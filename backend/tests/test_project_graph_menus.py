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


def test_menu_prompt_say_statement_does_not_absorb_choices(tmp_path):
    source = tmp_path / "renpy_mouse_menu_say_prompt.rpy"
    source.write_text(
        "\n".join(
            [
                "label cheese_commit_helpers:",
                "    $ help_sayori = True",
                '    r "RenPy Mouse checks which helper knows the cheese maze."',
                "    menu:",
                '        m "Just think of the club, okay?"',
                '        "Natsuki.":',
                "            call ch3_end_natsuki",
                '        "Yuri.":',
                "            call ch3_end_yuri",
                '        "Monika." if help_monika == None:',
                "            call ch3_end_monika",
                "    return",
            ]
        ),
        encoding="utf-8",
    )

    graph = ProjectGraphImporter().import_files(
        project_id="mouse-renpy-menu-say-prompt-project",
        files=[source],
    )

    menu = next(node for node in graph.nodes if node.type == "menu")
    prompt = next(node for node in graph.nodes if node.type == "menu_prompt")
    choices = [node for node in graph.nodes if node.type == "menu_choice"]
    calls = [node for node in graph.nodes if node.type == "call"]

    top_level_nodes = [node for node in graph.nodes if node.parent_node_id is None]
    assert [node.type for node in top_level_nodes] == ["action", "menu", "return"]
    assert prompt.parent_node_id == menu.id
    assert prompt.content == 'm "Just think of the club, okay?"'
    assert {choice.content for choice in choices} == {
        '"Natsuki.":',
        '"Yuri.":',
        '"Monika." if help_monika == None:',
    }
    assert all(choice.parent_node_id == menu.id for choice in choices)
    assert {call.content for call in calls} == {
        "call ch3_end_natsuki",
        "call ch3_end_yuri",
        "call ch3_end_monika",
    }
    assert all(call.parent_node_id in {choice.id for choice in choices} for call in calls)
    assert not any(
        node.type == "action" and "Natsuki" in node.content and "ch3_end_natsuki" in node.content
        for node in graph.nodes
    )


def test_menu_nodes_survive_snapshot_roundtrip():
    graph = import_mouse_graph()
    restored = ProjectGraphSnapshotCodec.load(ProjectGraphSnapshotCodec.dump(graph))

    assert [(node.id, node.type, node.content, node.parent_node_id) for node in restored.nodes] == [
        (node.id, node.type, node.content, node.parent_node_id) for node in graph.nodes
    ]
