import pytest

from app.services.project_graph.structure_validator import validate_structure_command
from test_project_graph_continuation_validator import _graph


def test_validates_new_file_and_normalizes_path():
    result = validate_structure_command(
        {"kind": "file", "path": "chapters\\mouse_day_2.rpy", "position": {"x": 120, "y": 80}},
        _graph(),
    )
    assert result == {
        "kind": "file",
        "path": "chapters/mouse_day_2.rpy",
        "position": {"x": 120.0, "y": 80.0},
    }
    assert validate_structure_command(
        {"kind": "file", "path": "chapters\\mouse_bonus", "position": {"x": 0, "y": 0}},
        _graph(),
    )["path"] == "chapters/mouse_bonus.rpy"


@pytest.mark.parametrize("path", [".rpy", "mouse.txt", "COM¹", "LPT².rpy", "trailing. ", f"{'a' * 256}.rpy"])
def test_rejects_non_rpy_and_windows_invalid_file_names(path):
    with pytest.raises(ValueError, match="Invalid ProjectGraph file path"):
        validate_structure_command({"kind": "file", "path": path, "position": {"x": 0, "y": 0}}, _graph())


def test_validates_global_and_nested_label_ownership():
    global_label = validate_structure_command(
        {"kind": "label", "fileId": "file-story", "name": "mouse_day_2"},
        _graph(),
    )
    nested = validate_structure_command(
        {"kind": "sublabel", "parentLabelId": "label-ending", "name": "cheese"},
        _graph(),
    )
    assert global_label["qualifiedName"] == "mouse_day_2"
    assert global_label["scope"] == "global"
    assert nested["qualifiedName"] == "ending.cheese"
    assert nested["labelHeader"] == ".cheese"
    assert nested["fileId"] == "file-story"


def test_rejects_duplicate_file_label_and_technical_template():
    graph = _graph()
    with pytest.raises(ValueError, match="already exists"):
        validate_structure_command(
            {"kind": "file", "path": "RENPY_MOUSE_DAY_1.RPY", "position": {"x": 0, "y": 0}},
            graph,
        )
    with pytest.raises(ValueError, match="already exists"):
        validate_structure_command({"kind": "label", "fileId": "file-story", "name": "ending"}, graph)
    with pytest.raises(ValueError, match="technical"):
        validate_structure_command({"kind": "label", "fileId": "file-template", "name": "mouse"}, graph)
