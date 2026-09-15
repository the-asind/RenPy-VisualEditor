import math
from typing import Any

from .models import ProjectGraph
from .deletion_validator import validate_delete_command
from .relation_target_validator import _valid_renpy_name_component, normalize_relation_target_file_path


def _validate_name(name: Any) -> str:
    if not isinstance(name, str) or not _valid_renpy_name_component(name):
        raise ValueError("Invalid ProjectGraph label name")
    return name


def _ensure_unique_label(graph: ProjectGraph, qualified_name: str) -> None:
    if any(label.qualified_name == qualified_name for label in graph.labels):
        raise ValueError(f"ProjectGraph label {qualified_name} already exists")


def validate_structure_command(payload: Any, graph: ProjectGraph) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("ProjectGraph structure command is required")

    kind = payload.get("kind")
    if kind == "delete":
        return validate_delete_command(payload, graph)
    if kind == "file":
        raw_path = payload.get("path")
        path = normalize_relation_target_file_path(raw_path) if isinstance(raw_path, str) else None
        if path is None:
            raise ValueError("Invalid ProjectGraph file path")
        if any(file.path.replace("\\", "/").lower() == path.lower() for file in graph.files):
            raise ValueError(f"ProjectGraph file {path} already exists")
        position = payload.get("position")
        if not isinstance(position, dict):
            raise ValueError("Invalid ProjectGraph file position")
        try:
            x, y = float(position.get("x")), float(position.get("y"))
        except (TypeError, ValueError):
            raise ValueError("Invalid ProjectGraph file position") from None
        if not math.isfinite(x) or not math.isfinite(y):
            raise ValueError("Invalid ProjectGraph file position")
        return {"kind": "file", "path": path, "position": {"x": x, "y": y}}

    name = _validate_name(payload.get("name"))
    if kind == "label":
        file_id = payload.get("fileId")
        file = next((candidate for candidate in graph.files if candidate.id == file_id), None)
        if file is None:
            raise ValueError(f"Missing ProjectGraph file: {file_id}")
        if file.metadata.get("code_only_reason") == "renpy_template":
            raise ValueError(f"Cannot add a label to technical Ren'Py template {file.path}")
        _ensure_unique_label(graph, name)
        return {
            "kind": "label", "fileId": file.id, "name": name, "parentLabelId": None,
            "qualifiedName": name, "scope": "global", "labelHeader": name,
        }

    if kind == "sublabel":
        parent_id = payload.get("parentLabelId")
        parent = next((candidate for candidate in graph.labels if candidate.id == parent_id), None)
        if parent is None:
            raise ValueError(f"Missing ProjectGraph parent label: {parent_id}")
        qualified_name = f"{parent.qualified_name}.{name}"
        _ensure_unique_label(graph, qualified_name)
        return {
            "kind": "sublabel", "fileId": parent.file_id, "name": name, "parentLabelId": parent.id,
            "qualifiedName": qualified_name,
            "scope": "local" if parent.scope == "global" else "nested",
            "labelHeader": f".{name}" if parent.scope == "global" else qualified_name,
        }

    raise ValueError(f"Unsupported ProjectGraph structure command: {kind}")
