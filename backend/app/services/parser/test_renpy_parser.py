import os
import pytest
import tempfile
import textwrap
from pathlib import Path
from .renpy_parser import RenPyParser, ChoiceNodeType

@pytest.fixture
def sample_renpy_script():
    """Create a temporary RenPy script file for testing."""
    script_content = """
    label start:
        "Это начало истории."

        menu:
            "Выбрать первый путь":
                jump path_one
            "Выбрать второй путь":
                jump path_two

    label path_one:
        "Вы выбрали первый путь."

        if condition:
            "Что-то происходит при выполнении условия."
        else:
            "Что-то происходит, если условие не выполнено."

        return

    label path_two:
        "Вы выбрали второй путь."
        return
    """

    with tempfile.NamedTemporaryFile(suffix='.rpy', delete=False, mode='w', encoding='utf-8') as f:
        f.write(textwrap.dedent(script_content))

    yield f.name

    os.unlink(f.name)

@pytest.mark.asyncio
async def test_parse_async_basic(sample_renpy_script):
    """Test basic parsing functionality."""
    parser = RenPyParser()
    root_node = await parser.parse_async(sample_renpy_script)

    assert root_node is not None
    assert root_node.label_name == "root"

    labels = [child.label_name for child in root_node.children
              if child.node_type == ChoiceNodeType.LABEL_BLOCK]

    assert len(root_node.children) > 1  # Should have INIT and other labels
    assert "start" in labels
    assert "path_one" in labels
    assert "path_two" in labels

@pytest.mark.asyncio
async def test_parse_async_nonexistent_file():
    """Test error handling when file is not found."""
    parser = RenPyParser()
    with pytest.raises(IOError):
        await parser.parse_async("nonexistent_file.rpy")

@pytest.mark.asyncio
async def test_parse_menu_structure(sample_renpy_script):
    """Test if menu structures are parsed correctly."""
    parser = RenPyParser()
    root_node = await parser.parse_async(sample_renpy_script)

    start_label = next((child for child in root_node.children
                        if child.label_name == "start"), None)
    assert start_label is not None

    menu_node = None
    for action_node in start_label.children:
        if action_node.node_type == ChoiceNodeType.MENU_BLOCK:
            menu_node = action_node
            break

    assert menu_node is not None
    assert menu_node.node_type == ChoiceNodeType.MENU_BLOCK
    assert len(menu_node.children) == 2  # Two options
    assert all(child.label_name for child in menu_node.children), "Меню содержит опцию без имени"
    menu_options = [child.label_name.strip('"') for child in menu_node.children]
    assert "Выбрать первый путь" in menu_options
    assert "Выбрать второй путь" in menu_options

@pytest.mark.asyncio
async def test_parse_if_else_structure(sample_renpy_script):
    """Test if conditional structures are parsed correctly."""
    parser = RenPyParser()
    root_node = await parser.parse_async(sample_renpy_script)

    path_one_label = next((child for child in root_node.children
                          if child.label_name == "path_one"), None)
    assert path_one_label is not None

    if_node = None
    for action_node in path_one_label.children:
        if action_node.node_type == ChoiceNodeType.IF_BLOCK:
            if_node = action_node
            break

    assert if_node is not None
    assert if_node.label_name.startswith("if condition")

    # Check if else branch exists
    assert if_node.false_branch is not None
    assert if_node.false_branch.node_type == ChoiceNodeType.ELSE_BLOCK