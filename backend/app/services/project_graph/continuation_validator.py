import re
from typing import Any

from .models import ProjectGraph
from .relation_target_validator import validate_relation_target_selection


_NESTED_STRUCTURE = re.compile(r"^\s*(?:if|elif|else|menu|label|while|for|screen|python|call|jump|return)\b")
_RAW_NESTED_STRUCTURE = re.compile(r"^\s*(?:if|elif|else|menu|label|while|for|screen|python)\b")


def _require_text(value: Any, field: str, maximum: int = 20_000) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required")
    if len(value) > maximum or "\n" in value or "\r" in value:
        raise ValueError(f"{field} is too long")
    return value.strip()


def _validate_leaf(leaf: Any, graph: ProjectGraph, target_drafts: list[dict[str, Any]]) -> None:
    if not isinstance(leaf, dict):
        raise ValueError("Continuation leaf is required")
    kind = leaf.get("kind")
    if kind in {"call", "jump"}:
        if "target" in leaf:
            target = validate_relation_target_selection(leaf.get("target"), graph)
            if target["kind"] == "new":
                target_drafts.append(target)
            return
        target_label_id = leaf.get("targetLabelId")
        if target_label_id not in {label.id for label in graph.labels}:
            raise ValueError(f"Unknown target label: {target_label_id}")
        return
    if kind != "action":
        raise ValueError(f"Unsupported continuation kind: {kind}")
    comment = leaf.get("comment", "")
    if not isinstance(comment, str) or len(comment) > 2_000:
        raise ValueError("Action comment is invalid")
    content = leaf.get("content")
    if content is None:
        return
    if not isinstance(content, str) or len(content) > 20_000:
        raise ValueError("Action content is invalid")
    if any(_NESTED_STRUCTURE.match(line) for line in content.splitlines()):
        raise ValueError("Unsupported nested structure in Action content")


def validate_continuation_request(payload: Any, graph: ProjectGraph) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Continuation payload must be an object")
    action = payload.get("action")
    target_drafts: list[dict[str, Any]] = []
    label_ids = {label.id for label in graph.labels}
    if action in {"call", "jump"}:
        if "target" in payload:
            target = validate_relation_target_selection(payload.get("target"), graph)
            result: dict[str, Any] = {"valid": True, "action": action, "target": target}
            if target["kind"] == "new":
                result["targetDrafts"] = [target]
            return result
        target_label_id = payload.get("targetLabelId")
        if target_label_id not in label_ids:
            raise ValueError(f"Unknown target label: {target_label_id}")
        return {"valid": True, "action": action}
    if action == "return":
        return {"valid": True, "action": action}
    if action == "conditional":
        draft = payload.get("conditionalDraft")
        if not isinstance(draft, dict):
            raise ValueError("conditionalDraft is required")
        if draft.get("mode") == "raw" and any(_RAW_NESTED_STRUCTURE.match(line) and not re.match(r"^\s*(?:if|elif|else)\b", line) for line in str(draft.get("raw", "")).splitlines()):
            raise ValueError("Unsupported nested structure in raw conditional")
        first = draft.get("ifBranch")
        if not isinstance(first, dict):
            raise ValueError("ifBranch is required")
        _require_text(first.get("condition"), "IF condition", 2_000)
        _validate_leaf(first.get("continuation"), graph, target_drafts)
        elifs = draft.get("elifBranches", [])
        if not isinstance(elifs, list):
            raise ValueError("elifBranches must be a list")
        for branch in elifs:
            if not isinstance(branch, dict):
                raise ValueError("ELIF branch is invalid")
            _require_text(branch.get("condition"), "ELIF condition", 2_000)
            _validate_leaf(branch.get("continuation"), graph, target_drafts)
        else_branch = draft.get("elseBranch")
        if else_branch is not None:
            if not isinstance(else_branch, dict):
                raise ValueError("ELSE branch is invalid")
            _validate_leaf(else_branch.get("continuation"), graph, target_drafts)
        result = {"valid": True, "action": action}
        if target_drafts:
            result["targetDrafts"] = target_drafts
        return result
    if action == "menu":
        draft = payload.get("menuDraft")
        if not isinstance(draft, dict):
            raise ValueError("menuDraft is required")
        if draft.get("mode") == "raw" and any(_RAW_NESTED_STRUCTURE.match(line) and not re.match(r"^\s*menu\b", line) for line in str(draft.get("raw", "")).splitlines()):
            raise ValueError("Unsupported nested structure in raw menu")
        choices = draft.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ValueError("At least one menu choice is required")
        prompt = draft.get("prompt", "")
        if not isinstance(prompt, str) or len(prompt) > 10_000:
            raise ValueError("Menu prompt is invalid")
        for choice in choices:
            if not isinstance(choice, dict):
                raise ValueError("Menu choice is invalid")
            _require_text(choice.get("text"), "Menu choice text", 10_000)
            condition = choice.get("condition", "")
            if not isinstance(condition, str) or "\n" in condition:
                raise ValueError("Menu choice condition is invalid")
            _validate_leaf(choice.get("continuation"), graph, target_drafts)
        result = {"valid": True, "action": action}
        if target_drafts:
            result["targetDrafts"] = target_drafts
        return result
    raise ValueError(f"Unsupported continuation action: {action}")
