import re
from typing import Any

from .models import ProjectGraph


_RENPY_NAME_COMPONENT = re.compile(r"^[a-zA-Z_\u00a0-\ufffd][0-9a-zA-Z_\u00a0-\ufffd]*$")
_RENPY_NAME_KEYWORDS = {"as", "if", "in", "return", "with", "while"}
_WINDOWS_RESERVED_FILE = re.compile(
    r"^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$",
    re.IGNORECASE,
)
_INVALID_FILE_SEGMENT_CHARACTER = re.compile(r'[<>:"|?*\x00-\x1f]')
_WINDOWS_MAX_PATH_CHARACTERS = 259
_WINDOWS_MAX_COMPONENT_CHARACTERS = 255


def _windows_utf16_length(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def normalize_relation_target_file_path(path: str) -> str | None:
    candidate = path.replace("\\", "/")
    if (
        candidate != candidate.strip()
        or not candidate
        or candidate.startswith("/")
        or re.match(r"^[A-Za-z]:", candidate)
    ):
        return None

    parts = candidate.split("/")
    filename = parts[-1]
    if filename.lower().endswith(".rpy"):
        if not filename[:-4]:
            return None
        parts[-1] = f"{filename[:-4]}.rpy"
    elif "." in filename:
        return None
    else:
        parts[-1] = f"{filename}.rpy"

    for part in parts:
        if (
            not part
            or part in {".", ".."}
            or _windows_utf16_length(part) > _WINDOWS_MAX_COMPONENT_CHARACTERS
            or part.endswith(".")
            or part.endswith(" ")
            or _INVALID_FILE_SEGMENT_CHARACTER.search(part)
            or _WINDOWS_RESERVED_FILE.match(part)
        ):
            return None

    normalized = "/".join(parts)
    if _windows_utf16_length(normalized) > _WINDOWS_MAX_PATH_CHARACTERS:
        return None
    return normalized


def _valid_renpy_name_component(name: str) -> bool:
    return (
        name == name.strip()
        and 0 < len(name) <= 200
        and bool(_RENPY_NAME_COMPONENT.match(name))
        and name not in _RENPY_NAME_KEYWORDS
    )


def _raise_validation_errors(errors: dict[str, str], draft: dict[str, Any]) -> None:
    if errors.get("name") == "duplicate":
        raise ValueError(f"Relation target {draft.get('name') or draft.get('draftId')} already exists")
    first_field = next(iter(errors))
    raise ValueError(f"Invalid new relation target {first_field}: {errors[first_field]}")


def validate_relation_target_selection(target: Any, graph: ProjectGraph) -> dict[str, Any]:
    if not isinstance(target, dict):
        raise ValueError("Relation target is required")

    kind = target.get("kind")
    if kind == "existing":
        label_id = target.get("labelId")
        if label_id not in {label.id for label in graph.labels}:
            raise ValueError(f"Unknown target label: {label_id}")
        return {"kind": "existing", "labelId": label_id}

    if kind != "new":
        raise ValueError(f"Unsupported relation target kind: {kind}")

    errors: dict[str, str] = {}
    file_selection = target.get("file")
    if not isinstance(file_selection, dict):
        errors["fileId"] = "required"
        file_selection = {}

    normalized_file = dict(file_selection)
    destination_file = None
    file_path = ""
    file_kind = file_selection.get("kind")
    if file_kind == "existing":
        file_id = file_selection.get("fileId")
        if not file_id:
            errors["fileId"] = "required"
        else:
            destination_file = next((file for file in graph.files if file.id == file_id), None)
            if destination_file is None or destination_file.metadata.get("code_only_reason") == "renpy_template":
                errors["fileId"] = "invalid"
            else:
                file_path = destination_file.path
    elif file_kind == "new":
        raw_path = file_selection.get("path")
        normalized_path = normalize_relation_target_file_path(raw_path) if isinstance(raw_path, str) else None
        if not raw_path:
            errors["filePath"] = "required"
        elif normalized_path is None:
            errors["filePath"] = "invalid"
        elif any(file.path.replace("\\", "/").lower() == normalized_path.lower() for file in graph.files):
            errors["filePath"] = "duplicate"
        else:
            file_path = normalized_path
            normalized_file = {"kind": "new", "path": normalized_path}
    else:
        errors["fileId"] = "invalid"

    name = target.get("name")
    if not isinstance(name, str) or not name:
        errors["name"] = "required"
        name = ""
    elif not _valid_renpy_name_component(name):
        errors["name"] = "invalid"

    scope = target.get("scope")
    owner = None
    qualified_name = name
    if scope == "local":
        if file_kind == "new":
            errors["scope"] = "invalid"
        owner_label_id = target.get("ownerLabelId")
        if not owner_label_id:
            errors["ownerLabelId"] = "required"
        else:
            owner = next((label for label in graph.labels if label.id == owner_label_id), None)
            if owner is None or owner.scope != "global" or file_kind != "existing" or owner.file_id != file_selection.get("fileId"):
                errors["ownerLabelId"] = "invalid"
            else:
                qualified_name = f"{owner.qualified_name}.{name}"
    elif scope == "global":
        pass
    else:
        errors["scope"] = "invalid"

    if "name" not in errors and any(label.qualified_name == qualified_name for label in graph.labels):
        errors["name"] = "duplicate"

    if errors:
        _raise_validation_errors(errors, target)

    return {
        "kind": "new",
        "draftId": target.get("draftId"),
        "file": normalized_file,
        "scope": scope,
        "ownerLabelId": owner.id if scope == "local" else None,
        "name": name,
        "filePath": file_path,
        "qualifiedName": qualified_name,
    }
