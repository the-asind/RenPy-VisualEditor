import pytest

from app.services.project_graph.continuation_validator import validate_continuation_request
from app.services.project_graph.models import FileFrame, ProjectGraph, LabelFrame, FrameVisual, FramePosition, FrameSize


def _graph() -> ProjectGraph:
    visual = FrameVisual(position=FramePosition(0, 0), size=FrameSize(100, 100))
    return ProjectGraph(
        project_id="mouse-project",
        files=[
            FileFrame(
                id="file-story",
                path="renpy_mouse_day_1.rpy",
                order="a0",
                visual=visual,
            ),
            FileFrame(
                id="file-template",
                path="renpy_template.rpy",
                order="a1",
                visual=visual,
                metadata={"code_only": True, "code_only_reason": "renpy_template"},
            ),
        ],
        labels=[LabelFrame(
            id="label-ending", file_id="file-story", parent_label_id=None, name="ending",
            qualified_name="ending", scope="global", label_start_node_id="start-ending",
            source_span=None, visual=visual,
        )],
    )


def test_accepts_supported_raw_if_with_existing_relation_target():
    payload = {
        "action": "conditional",
        "conditionalDraft": {
            "mode": "raw",
            "raw": "if hungry:\n    jump ending",
            "ifBranch": {"condition": "hungry", "continuation": {"kind": "jump", "targetLabelId": "label-ending"}},
            "elifBranches": [],
            "elseBranch": None,
        },
    }
    assert validate_continuation_request(payload, _graph())["valid"] is True


def test_rejects_nested_raw_structure_and_forged_target():
    nested = {
        "action": "conditional",
        "conditionalDraft": {
            "mode": "raw", "raw": "if hungry:\n    menu:\n        \"No\":\n            pass",
            "ifBranch": {"condition": "hungry", "continuation": {"kind": "action", "content": "menu:\n    pass", "comment": ""}},
            "elifBranches": [], "elseBranch": None,
        },
    }
    with pytest.raises(ValueError, match="Unsupported nested"):
        validate_continuation_request(nested, _graph())

    forged = {
        "action": "call",
        "targetLabelId": "label-forged",
    }
    with pytest.raises(ValueError, match="Unknown target"):
        validate_continuation_request(forged, _graph())


def test_accepts_new_global_relation_target_in_new_file():
    payload = {
        "action": "jump",
        "target": {
            "kind": "new",
            "draftId": "draft-cheese-heist",
            "file": {"kind": "new", "path": "chapters\\cheese_heist.rpy"},
            "scope": "global",
            "ownerLabelId": None,
            "name": "cheese_heist",
        },
    }

    result = validate_continuation_request(payload, _graph())

    assert result == {
        "valid": True,
        "action": "jump",
        "target": {
            "kind": "new",
            "draftId": "draft-cheese-heist",
            "file": {"kind": "new", "path": "chapters/cheese_heist.rpy"},
            "scope": "global",
            "ownerLabelId": None,
            "name": "cheese_heist",
            "filePath": "chapters/cheese_heist.rpy",
            "qualifiedName": "cheese_heist",
        },
        "targetDrafts": [
            {
                "kind": "new",
                "draftId": "draft-cheese-heist",
                "file": {"kind": "new", "path": "chapters/cheese_heist.rpy"},
                "scope": "global",
                "ownerLabelId": None,
                "name": "cheese_heist",
                "filePath": "chapters/cheese_heist.rpy",
                "qualifiedName": "cheese_heist",
            }
        ],
    }


def test_accepts_new_local_relation_target_under_global_owner_in_same_file():
    payload = {
        "action": "conditional",
        "conditionalDraft": {
            "mode": "builder",
            "ifBranch": {
                "condition": "renpy_mouse_hungry",
                "continuation": {
                    "kind": "call",
                    "target": {
                        "kind": "new",
                        "draftId": "draft-cache",
                        "file": {"kind": "existing", "fileId": "file-story"},
                        "scope": "local",
                        "ownerLabelId": "label-ending",
                        "name": "cheese_cache",
                    },
                },
            },
            "elifBranches": [],
            "elseBranch": None,
        },
    }

    result = validate_continuation_request(payload, _graph())

    assert result["valid"] is True
    assert result["targetDrafts"] == [
        {
            "kind": "new",
            "draftId": "draft-cache",
            "file": {"kind": "existing", "fileId": "file-story"},
            "scope": "local",
            "ownerLabelId": "label-ending",
            "name": "cheese_cache",
            "filePath": "renpy_mouse_day_1.rpy",
            "qualifiedName": "ending.cheese_cache",
        }
    ]


def test_rejects_duplicate_new_relation_target_before_mutation():
    payload = {
        "action": "call",
        "target": {
            "kind": "new",
            "draftId": "draft-ending",
            "file": {"kind": "existing", "fileId": "file-story"},
            "scope": "global",
            "ownerLabelId": None,
            "name": "ending",
        },
    }

    with pytest.raises(ValueError, match="already exists"):
        validate_continuation_request(payload, _graph())


def test_rejects_unsafe_new_relation_target_path_and_template_file():
    unsafe_path = {
        "action": "jump",
        "target": {
            "kind": "new",
            "draftId": "draft-unsafe",
            "file": {"kind": "new", "path": "../cheese.rpy"},
            "scope": "global",
            "ownerLabelId": None,
            "name": "cheese",
        },
    }
    with pytest.raises(ValueError, match="filePath"):
        validate_continuation_request(unsafe_path, _graph())

    template_file = {
        "action": "jump",
        "target": {
            "kind": "new",
            "draftId": "draft-template",
            "file": {"kind": "existing", "fileId": "file-template"},
            "scope": "global",
            "ownerLabelId": None,
            "name": "template_escape",
        },
    }
    with pytest.raises(ValueError, match="fileId"):
        validate_continuation_request(template_file, _graph())
