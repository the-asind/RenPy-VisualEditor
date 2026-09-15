import json
import base64
import re
import tempfile
import time
from functools import lru_cache
from starlette.concurrency import run_in_threadpool
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Body, Request, Response, File, UploadFile, Form
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from ...services.database import DatabaseService, ProjectQuotaExceededError
from ...services.project_graph.crdt_bridge import ProjectGraphCrdtSnapshotBridge
from ...services.project_graph.exporter import ProjectGraphExporter
from ...services.project_graph.importer import ProjectGraphImporter
from ...services.project_graph.resolver import ProjectGraphResolver
from ...services.project_graph.snapshot import ProjectGraphSnapshotCodec
from ...services.project_graph.continuation_validator import validate_continuation_request
from ...services.project_graph.deletion_validator import UnsafeProjectGraphDeletion
from ...services.project_graph.structure_validator import validate_structure_command
from ...security import (
    MAX_ASSET_CATALOG_BYTES,
    MAX_ASSET_CATALOG_ENTRIES,
    MAX_CRDT_SNAPSHOT_BYTES,
    MAX_GRAPH_EXPORT_DIAGNOSTICS,
    MAX_GRAPH_EXPORT_EDGES,
    MAX_GRAPH_EXPORT_FILES,
    MAX_GRAPH_EXPORT_JSON_BYTES,
    MAX_GRAPH_EXPORT_LABELS,
    MAX_GRAPH_EXPORT_LABEL_STARTS,
    MAX_GRAPH_EXPORT_NODES,
    MAX_GRAPH_EXPORT_OUTPUT_BYTES,
    MAX_GRAPH_EXPORT_TEXT_BYTES,
    MAX_GRAPH_IMPORT_FILES,
    MAX_GRAPH_IMPORT_FILE_BYTES,
    MAX_GRAPH_IMPORT_TOTAL_BYTES,
    MAX_OWNED_PROJECTS_PER_USER,
)
from ...services.observability.metrics import (
    observe_asset_catalog,
    observe_crdt_snapshot_load,
    observe_crdt_snapshot_save,
    observe_graph_export,
    observe_graph_import,
)
from ...api.routes.auth import get_current_user
import uuid
import logging # Add this import

# Get a logger instance
logger = logging.getLogger(__name__)

projects_router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    responses={404: {"description": "Not found"}}
)
db_service = DatabaseService()

PROJECT_ADMIN_ROLES = {"Owner", "Admin"}
PROJECT_EDITOR_ROLES = {"Owner", "Admin", "Editor"}


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None


class ShareTargetValidation(BaseModel):
    user_id: str = Field(..., min_length=1)
    role: str = Field(..., min_length=1)


def _get_accessible_project(project_id: str, user: Dict) -> Dict:
    projects = db_service.get_user_projects(user["id"])
    project = next((p for p in projects if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    return project


def _ensure_project_editor(project: Dict) -> None:
    if project.get("role") not in PROJECT_EDITOR_ROLES:
        raise HTTPException(status_code=403, detail="You don't have permission to edit this project")


def _ensure_project_admin(project: Dict) -> None:
    if project.get("role") not in PROJECT_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="You don't have permission to manage this project")


def _ensure_project_catalog_updater(project: Dict) -> None:
    if project.get("role") not in PROJECT_ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="You don't have permission to update this project's asset catalog")


def _resolve_share_target(username_to_share: str, role_identifier: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
    username = username_to_share.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required.")

    user_to_share_details = db_service.get_user_by_username(username)
    if not user_to_share_details:
        logger.warning(f"User with username '{username}' not found.")
        raise HTTPException(status_code=404, detail=f"User '{username}' not found.")

    role_value = role_identifier.strip()
    if not role_value:
        raise HTTPException(status_code=400, detail="Role is required.")

    role_info = db_service.get_role_by_id(role_value) or db_service.get_role_by_name(role_value)
    if not role_info:
        logger.error(f"Invalid role provided: '{role_identifier}'. Not found as ID or Name.")
        raise HTTPException(status_code=400, detail=f"Invalid role: '{role_identifier}'. Role not found.")

    return user_to_share_details, role_info


def _normalize_project_file_path(raw_path: str) -> str:
    candidate = (raw_path or "").strip().replace("\\", "/")
    if (
        not candidate
        or candidate.startswith("/")
        or re.match(r"^[A-Za-z]:", candidate)
    ):
        raise HTTPException(status_code=400, detail=f"Unsafe project file path: {raw_path}")

    parts = [part for part in candidate.split("/") if part]
    if not parts or any(part in {".", ".."} for part in parts):
        raise HTTPException(status_code=400, detail=f"Unsafe project file path: {raw_path}")

    return "/".join(parts)


def _catalog_entry_kind(path: str) -> str:
    extension = Path(path).suffix.lower()
    if extension == ".rpy":
        return "script"
    if extension in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".svg"}:
        return "image"
    if extension in {".ogg", ".oga", ".mp3", ".wav", ".flac", ".opus", ".m4a"}:
        return "audio"
    if extension in {".webm", ".mp4", ".ogv", ".mov"}:
        return "video"
    if extension in {".ttf", ".otf", ".woff", ".woff2"}:
        return "font"
    if extension in {".rpa", ".zip", ".tar", ".gz", ".7z"}:
        return "archive"
    return "other"


def _normalize_catalog_entry_renpy_names(raw_entry: Dict[str, Any]) -> list[str]:
    raw_names = raw_entry.get("renpyNames")
    if raw_names is None:
        return []
    if not isinstance(raw_names, list):
        raise HTTPException(status_code=400, detail="asset_catalog.entries[].renpyNames must be a list")

    normalized_names: list[str] = []
    seen_names: set[str] = set()
    for raw_name in raw_names:
        name = re.sub(r"\s+", " ", str(raw_name).strip())
        key = name.lower()
        if name and key not in seen_names:
            normalized_names.append(name)
            seen_names.add(key)
    return normalized_names


def _normalize_asset_catalog_character_images(raw_catalog: Dict[str, Any]) -> Dict[str, str]:
    raw_character_images = raw_catalog.get("characterImages")
    if raw_character_images is None:
        return {}
    if not isinstance(raw_character_images, dict):
        raise HTTPException(status_code=400, detail="asset_catalog.characterImages must be an object")

    normalized_character_images: Dict[str, str] = {}
    for raw_character, raw_image_tag in raw_character_images.items():
        character = str(raw_character).strip()
        image_tag = re.sub(r"\s+", " ", str(raw_image_tag).strip())
        if character and image_tag:
            normalized_character_images[character] = image_tag
    return normalized_character_images


def _normalize_asset_catalog_image_definitions(raw_catalog: Dict[str, Any]) -> Dict[str, Any]:
    raw_definitions = raw_catalog.get("imageDefinitions")
    if raw_definitions is None:
        return {}
    if not isinstance(raw_definitions, dict):
        raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions must be an object")

    normalized_definitions: Dict[str, Any] = {}
    for raw_image_name, raw_definition in raw_definitions.items():
        image_name = re.sub(r"\s+", " ", str(raw_image_name).strip())
        if not image_name:
            continue
        if not isinstance(raw_definition, dict):
            raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions values must be objects")

        kind = str(raw_definition.get("kind") or "").strip()
        if kind == "single":
            normalized_definitions[image_name] = {
                "kind": "single",
                "path": _normalize_project_file_path(str(raw_definition.get("path") or "")),
            }
            continue

        if kind == "composite":
            raw_size = raw_definition.get("size")
            raw_layers = raw_definition.get("layers")
            if not isinstance(raw_size, dict):
                raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions composite size must be an object")
            if not isinstance(raw_layers, list):
                raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions composite layers must be a list")

            try:
                width = float(raw_size.get("width"))
                height = float(raw_size.get("height"))
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions composite size must be numeric") from exc
            if width <= 0 or height <= 0:
                raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions composite size must be positive")

            normalized_layers: list[Dict[str, Any]] = []
            for raw_layer in raw_layers:
                if not isinstance(raw_layer, dict):
                    raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions composite layers must be objects")
                try:
                    x = float(raw_layer.get("x", 0))
                    y = float(raw_layer.get("y", 0))
                except (TypeError, ValueError) as exc:
                    raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions composite layer positions must be numeric") from exc
                normalized_layers.append({
                    "x": int(x) if x.is_integer() else x,
                    "y": int(y) if y.is_integer() else y,
                    "path": _normalize_project_file_path(str(raw_layer.get("path") or "")),
                })
            normalized_definitions[image_name] = {
                "kind": "composite",
                "size": {
                    "width": int(width) if width.is_integer() else width,
                    "height": int(height) if height.is_integer() else height,
                },
                "layers": normalized_layers,
            }
            continue

        raise HTTPException(status_code=400, detail="asset_catalog.imageDefinitions kind must be single or composite")

    return normalized_definitions


def _normalize_asset_catalog(raw_catalog: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(raw_catalog, dict):
        raise HTTPException(status_code=400, detail="asset_catalog must be an object")

    entries = raw_catalog.get("entries")
    if entries is None:
        entries = []
    if not isinstance(entries, list):
        raise HTTPException(status_code=400, detail="asset_catalog.entries must be a list")
    if len(entries) > MAX_ASSET_CATALOG_ENTRIES:
        raise HTTPException(status_code=413, detail="asset_catalog has too many entries")

    normalized_entries: list[Dict[str, Any]] = []
    for raw_entry in entries:
        if not isinstance(raw_entry, dict):
            raise HTTPException(status_code=400, detail="asset_catalog.entries items must be objects")
        path = _normalize_project_file_path(str(raw_entry.get("path") or ""))
        extension = Path(path).suffix.lower()
        normalized_entry = {
            "path": path,
            "name": Path(path).name,
            "extension": extension,
            "kind": str(raw_entry.get("kind") or _catalog_entry_kind(path)),
            "size": raw_entry.get("size"),
            "lastModified": raw_entry.get("lastModified"),
        }
        url = str(raw_entry.get("url") or "").strip()
        if url:
            if not url.startswith("/demo-assets/"):
                raise HTTPException(status_code=400, detail="asset_catalog.entries[].url must be a /demo-assets/ URL")
            normalized_entry["url"] = url
        renpy_names = _normalize_catalog_entry_renpy_names(raw_entry)
        if renpy_names:
            normalized_entry["renpyNames"] = renpy_names
        normalized_entries.append(normalized_entry)

    normalized_entries.sort(key=lambda entry: entry["path"].lower())
    normalized_catalog = {
        "root_kind": str(raw_catalog.get("root_kind") or "renpy-game-root"),
        "game_directory": str(raw_catalog.get("game_directory") or "game"),
        "entries": normalized_entries,
    }
    character_images = _normalize_asset_catalog_character_images(raw_catalog)
    if character_images:
        normalized_catalog["characterImages"] = character_images
    image_definitions = _normalize_asset_catalog_image_definitions(raw_catalog)
    if image_definitions:
        normalized_catalog["imageDefinitions"] = image_definitions
    return normalized_catalog


def _parse_asset_catalog(asset_catalog: Optional[str]) -> Optional[Dict[str, Any]]:
    if asset_catalog is None or not asset_catalog.strip():
        return None
    if len(asset_catalog.encode("utf-8")) > MAX_ASSET_CATALOG_BYTES:
        raise HTTPException(status_code=413, detail="asset_catalog is too large")
    try:
        return _normalize_asset_catalog(json.loads(asset_catalog))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="asset_catalog must be valid JSON") from exc


def _project_graph_diagnostics_summary(graph_snapshot) -> Dict[str, int]:
    summary = {
        "total": len(graph_snapshot.diagnostics),
        "blocking": 0,
        "info": 0,
        "warning": 0,
        "error": 0,
    }
    for diagnostic in graph_snapshot.diagnostics:
        if diagnostic.blocking:
            summary["blocking"] += 1
        if diagnostic.severity in {"info", "warning", "error"}:
            summary[diagnostic.severity] += 1
    return summary


def _blocking_export_diagnostics(graph_snapshot) -> list[Dict[str, Any]]:
    return [
        {
            "id": diagnostic.id,
            "code": diagnostic.code,
            "severity": diagnostic.severity,
            "message": diagnostic.message,
            "node_id": diagnostic.node_id,
        }
        for diagnostic in graph_snapshot.diagnostics
        if diagnostic.blocking
    ]


def _http_metric_result(status_code: int) -> str:
    if status_code == 413:
        return "too_large"
    if status_code == 400:
        return "bad_request"
    if status_code == 401:
        return "unauthorized"
    if status_code == 403:
        return "forbidden"
    if status_code == 404:
        return "not_found"
    return "error"


def _import_source(file_paths: Optional[List[str]], asset_catalog: Optional[Dict[str, Any]]) -> str:
    if file_paths or asset_catalog is not None:
        return "local_directory"
    return "upload"


def _ensure_graph_export_payload_within_limits(graph_snapshot: Dict[str, Any]) -> None:
    try:
        payload_bytes = len(json.dumps(graph_snapshot, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="ProjectGraph payload must be JSON serializable") from exc
    if payload_bytes > MAX_GRAPH_EXPORT_JSON_BYTES:
        raise HTTPException(status_code=413, detail="ProjectGraph payload is too large")

    list_limits = {
        "files": MAX_GRAPH_EXPORT_FILES,
        "labels": MAX_GRAPH_EXPORT_LABELS,
        "label_starts": MAX_GRAPH_EXPORT_LABEL_STARTS,
        "nodes": MAX_GRAPH_EXPORT_NODES,
        "edges": MAX_GRAPH_EXPORT_EDGES,
        "diagnostics": MAX_GRAPH_EXPORT_DIAGNOSTICS,
    }
    for key, limit in list_limits.items():
        value = graph_snapshot.get(key, [])
        if isinstance(value, list) and len(value) > limit:
            raise HTTPException(status_code=413, detail=f"ProjectGraph {key} exceeds the allowed limit")

    text_bytes = 0
    for node in graph_snapshot.get("nodes", []):
        if isinstance(node, dict):
            text_bytes += len(str(node.get("content", "")).encode("utf-8"))
    source_files = graph_snapshot.get("source_index", {}).get("files", {})
    if isinstance(source_files, dict):
        for source_file in source_files.values():
            if isinstance(source_file, dict):
                text_bytes += len(str(source_file.get("content", "")).encode("utf-8"))
    if text_bytes > MAX_GRAPH_EXPORT_TEXT_BYTES:
        raise HTTPException(status_code=413, detail="ProjectGraph text content is too large")


DEMO_PROJECT_ROOT = Path(__file__).resolve().parents[2] / "demo_projects" / "clockwork_library" / "game"
DEMO_ASSET_ROOT = Path(__file__).resolve().parents[2] / "demo_assets" / "clockwork-library" / "v1"
DEMO_SCRIPT_PATHS = [
    "script.rpy",
    "library.rpy",
    "basement.rpy",
    "rooftop.rpy",
    "characters.rpy",
    "audio.rpy",
    "options.rpy",
    "endings.rpy",
]


def _demo_catalog_entry(path: str, renpy_names: Optional[list[str]] = None) -> Dict[str, Any]:
    absolute_path = DEMO_ASSET_ROOT / path
    return {
        "path": path,
        "name": Path(path).name,
        "extension": Path(path).suffix.lower(),
        "kind": _catalog_entry_kind(path),
        "size": absolute_path.stat().st_size if absolute_path.exists() else None,
        "lastModified": int(absolute_path.stat().st_mtime * 1000) if absolute_path.exists() else None,
        "url": f"/demo-assets/clockwork-library/v1/{path}",
        **({"renpyNames": renpy_names} if renpy_names else {}),
    }


def _clockwork_library_demo_catalog() -> Dict[str, Any]:
    return _normalize_asset_catalog({
        "root_kind": "renpy-game-root",
        "game_directory": "game",
        "entries": [
            *[
                {
                    "path": path,
                    "name": Path(path).name,
                    "extension": ".rpy",
                    "kind": "script",
                    "size": (DEMO_PROJECT_ROOT / path).stat().st_size,
                    "lastModified": int((DEMO_PROJECT_ROOT / path).stat().st_mtime * 1000),
                }
                for path in DEMO_SCRIPT_PATHS
            ],
            _demo_catalog_entry("images/backgrounds/library-night.webp", ["library night"]),
            _demo_catalog_entry("images/backgrounds/clock-basement.webp", ["clock basement"]),
            _demo_catalog_entry("images/backgrounds/rooftop-signal.webp", ["rooftop signal"]),
            _demo_catalog_entry("images/renpy/bright.png", ["renpy bright"]),
            _demo_catalog_entry("images/renpy/thinking.png", ["renpy thinking"]),
            _demo_catalog_entry("audio/music/library-loop.wav", ["library_loop", "audio.library_loop"]),
            _demo_catalog_entry("audio/sfx/page-turn.wav", ["page_turn", "audio.page_turn"]),
            _demo_catalog_entry("audio/sfx/gear-click.wav", ["gear_click", "audio.gear_click"]),
        ],
        "characterImages": {"r": "renpy"},
        "imageDefinitions": {
            "library night": {"kind": "single", "path": "images/backgrounds/library-night.webp"},
            "clock basement": {"kind": "single", "path": "images/backgrounds/clock-basement.webp"},
            "rooftop signal": {"kind": "single", "path": "images/backgrounds/rooftop-signal.webp"},
            "renpy bright": {"kind": "single", "path": "images/renpy/bright.png"},
            "renpy thinking": {"kind": "single", "path": "images/renpy/thinking.png"},
        },
    })


def _load_clockwork_library_demo_graph(project_id: str) -> tuple[Any, Dict[str, Any]]:
    script_paths = [DEMO_PROJECT_ROOT / path for path in DEMO_SCRIPT_PATHS]
    missing_scripts = [str(path) for path in script_paths if not path.exists()]
    if missing_scripts:
        raise HTTPException(status_code=500, detail=f"Clockwork Library demo files are missing: {missing_scripts}")
    catalog = _clockwork_library_demo_catalog()
    imported_graph = ProjectGraphImporter().import_files(
        project_id=project_id,
        files=script_paths,
        file_paths=DEMO_SCRIPT_PATHS,
    )
    graph = ProjectGraphResolver().resolve(imported_graph)
    return graph, catalog


def _import_clockwork_library_demo(project_id: str) -> tuple[Any, bytes, Dict[str, Any]]:
    graph, catalog = _load_clockwork_library_demo_graph(project_id)
    snapshot = ProjectGraphCrdtSnapshotBridge().export_snapshot(graph)
    return graph, snapshot, catalog


@lru_cache(maxsize=1)
def _clockwork_library_demo_preview_payload() -> bytes:
    """Read prebuilt JSON once; anonymous traffic never invokes the importer."""
    return (Path(__file__).resolve().parents[2] / "demo_assets/clockwork-library/v1/preview.json").read_bytes()


@projects_router.get("/demo/clockwork-library/preview")
async def get_clockwork_library_demo_preview() -> Response:
    """Return the built-in Clockwork Library demo graph for unauthenticated landing previews."""
    return Response(
        content=_clockwork_library_demo_preview_payload(),
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=300, stale-while-revalidate=3600"},
    )


@projects_router.post("/")
def create_project(
    name: str = Body(...), 
    description: str = Body(None),
    user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new project."""
    try:
        # Create project
        project_id = db_service.create_project(
            name,
            user["id"],
            description,
            max_owned_projects=MAX_OWNED_PROJECTS_PER_USER,
        )
        
        # Grant project access to creator (as owner)
        db_service.grant_project_access(project_id, user["id"], "role_owner")
        
        return {
            "id": project_id,
            "name": name,
            "description": description,
            "owner_id": user["id"]
        }
    except ProjectQuotaExceededError as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "owned_project_quota_exceeded", "limit": exc.limit},
        ) from exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")


@projects_router.post("/demo/clockwork-library")
def create_clockwork_library_demo_project(
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create a personal copy of the built-in Clockwork Library demo project."""
    start_time = time.perf_counter()
    try:
        project_id = db_service.create_project(
            "Clockwork Library Demo",
            user["id"],
            "Action-focused Ren'Py demo with rich dialogue, images, and audio.",
            max_owned_projects=MAX_OWNED_PROJECTS_PER_USER,
        )
        db_service.grant_project_access(project_id, user["id"], "role_owner")

        try:
            graph, snapshot, catalog = _import_clockwork_library_demo(project_id)
            db_service.save_project_graph_data(project_id, snapshot, catalog, user["id"])
        except Exception:
            db_service.delete_project(project_id)
            raise

        diagnostics_summary = _project_graph_diagnostics_summary(graph)
        observe_graph_import(
            source="demo",
            result="success",
            duration_seconds=time.perf_counter() - start_time,
            file_count=len(graph.files),
            label_count=len(graph.labels),
            label_start_count=len(graph.label_starts),
            node_count=len(graph.nodes),
            edge_count=len(graph.edges),
            diagnostics=diagnostics_summary,
            snapshot_bytes=len(snapshot),
            catalog_entry_count=len(catalog["entries"]),
        )
        observe_asset_catalog(
            operation="demo_save",
            result="success",
            duration_seconds=0,
            catalog=catalog,
        )
        return {
            "project_id": project_id,
            "file_count": len(graph.files),
            "label_count": len(graph.labels),
            "label_start_count": len(graph.label_starts),
            "node_count": len(graph.nodes),
            "edge_count": len(graph.edges),
            "diagnostics": diagnostics_summary,
            "snapshot_available": db_service.get_project_crdt_snapshot(project_id) is not None,
            "catalog_entry_count": len(catalog["entries"]),
        }
    except ProjectQuotaExceededError as exc:
        observe_graph_import(
            source="demo",
            result="quota_rejected",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise HTTPException(
            status_code=409,
            detail={"code": "owned_project_quota_exceeded", "limit": exc.limit},
        ) from exc
    except HTTPException:
        observe_graph_import(
            source="demo",
            result="error",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise
    except Exception as e:
        observe_graph_import(
            source="demo",
            result="error",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise HTTPException(status_code=500, detail=f"Failed to create Clockwork Library demo: {str(e)}")


@projects_router.get("/")
def list_projects(user: Dict = Depends(get_current_user)) -> List[Dict]:
    """List projects accessible to the current user."""
    try:
        projects = db_service.get_user_projects(user["id"])
        return [
            {
                **project,
                "active_users": db_service.get_project_members(project["id"]),
            }
            for project in projects
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list projects: {str(e)}")

@projects_router.post("/validate-share-target")
def validate_project_share_target(
    validation: ShareTargetValidation,
    _current_user: Dict = Depends(get_current_user),
) -> Dict[str, str]:
    """Validate a project share target before a project exists."""
    user_to_share_details, role_info = _resolve_share_target(
        validation.user_id,
        validation.role,
    )
    return {
        "id": user_to_share_details["id"],
        "username": user_to_share_details["username"],
        "role": role_info["name"],
    }

@projects_router.post("/{project_id}/open")
def mark_project_opened(project_id: str, user: Dict = Depends(get_current_user)) -> Dict[str, str]:
    """Record that the current user opened a project from the main menu."""
    try:
        _get_accessible_project(project_id, user)
        last_opened_at = db_service.mark_project_opened(project_id, user["id"])
        return {"status": "success", "last_opened_at": last_opened_at}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to mark project opened: {str(e)}")

@projects_router.get("/{project_id}")
def get_project(project_id: str, user: Dict = Depends(get_current_user)) -> Dict:
    """Get project details."""
    try:
        projects = db_service.get_user_projects(user["id"])
        project = next((p for p in projects if p["id"] == project_id), None)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
        
        # Get scripts in this project
        scripts = db_service.get_project_scripts(project_id)
        
        # Get active users in this project
        active_users = db_service.get_project_members(project_id)
        
        return {
            **project,
            "scripts": scripts,
            "active_users": active_users
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get project: {str(e)}")

@projects_router.patch("/{project_id}")
def update_project(
    project_id: str,
    project_data: ProjectUpdate,
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update project settings from the pre-canvas main menu."""
    try:
        project = _get_accessible_project(project_id, user)
        _ensure_project_admin(project)

        updated_project = db_service.update_project(
            project_id,
            name=project_data.name,
            description=project_data.description,
        )
        if not updated_project:
            raise HTTPException(status_code=404, detail="Project not found")
        return updated_project
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update project: {str(e)}")

@projects_router.get("/{project_id}/graph-snapshot")
def get_project_graph_snapshot(
    project_id: str,
    user: Dict = Depends(get_current_user),
) -> Response:
    """Return the latest opaque ProjectGraph CRDT snapshot for a project."""
    start_time = time.perf_counter()
    try:
        _get_accessible_project(project_id, user)

        snapshot = db_service.get_project_crdt_snapshot(project_id)
        if snapshot is None:
            observe_crdt_snapshot_load(
                result="not_found",
                duration_seconds=time.perf_counter() - start_time,
            )
            raise HTTPException(status_code=404, detail="Project graph snapshot not found")
        if len(snapshot) > MAX_CRDT_SNAPSHOT_BYTES:
            observe_crdt_snapshot_load(
                result="too_large",
                duration_seconds=time.perf_counter() - start_time,
                snapshot_bytes=len(snapshot),
            )
            raise HTTPException(status_code=413, detail="Project graph snapshot is too large")

        observe_crdt_snapshot_load(
            result="success",
            duration_seconds=time.perf_counter() - start_time,
            snapshot_bytes=len(snapshot),
        )
        return Response(content=snapshot, media_type="application/octet-stream")
    except HTTPException:
        raise
    except Exception as e:
        observe_crdt_snapshot_load(
            result="error",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise HTTPException(status_code=500, detail=f"Failed to get project graph snapshot: {str(e)}")


@projects_router.put("/{project_id}/graph-snapshot")
async def save_project_graph_snapshot(
    project_id: str,
    request: Request,
    user: Dict = Depends(get_current_user),
) -> Dict[str, str]:
    """Persist the latest opaque ProjectGraph CRDT snapshot for a project."""
    start_time = time.perf_counter()
    try:
        project = _get_accessible_project(project_id, user)
        _ensure_project_editor(project)

        snapshot = await request.body()
        if not snapshot:
            observe_crdt_snapshot_save(
                result="empty",
                duration_seconds=time.perf_counter() - start_time,
            )
            raise HTTPException(status_code=400, detail="Project graph snapshot is empty")
        if len(snapshot) > MAX_CRDT_SNAPSHOT_BYTES:
            observe_crdt_snapshot_save(
                result="too_large",
                duration_seconds=time.perf_counter() - start_time,
                snapshot_bytes=len(snapshot),
            )
            raise HTTPException(status_code=413, detail="Project graph snapshot is too large")

        await run_in_threadpool(db_service.save_project_crdt_snapshot, project_id, snapshot)
        observe_crdt_snapshot_save(
            result="success",
            duration_seconds=time.perf_counter() - start_time,
            snapshot_bytes=len(snapshot),
        )
        return {"status": "success"}
    except HTTPException as exc:
        if exc.status_code != 400:
            observe_crdt_snapshot_save(
                result=_http_metric_result(exc.status_code),
                duration_seconds=time.perf_counter() - start_time,
            )
        raise
    except Exception as e:
        observe_crdt_snapshot_save(
            result="error",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise HTTPException(status_code=500, detail=f"Failed to save project graph snapshot: {str(e)}")


@projects_router.post("/{project_id}/validate-continuation")
def validate_project_graph_continuation(
    project_id: str,
    payload: Dict[str, Any] = Body(...),
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Validate an Action Editor continuation against authoritative project state."""
    _get_accessible_project(project_id, user)
    snapshot = db_service.get_project_crdt_snapshot(project_id)
    if snapshot is None:
        raise HTTPException(status_code=409, detail="Project graph snapshot not found")
    try:
        graph = ProjectGraphCrdtSnapshotBridge().import_snapshot(snapshot)
        return validate_continuation_request(payload, graph)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@projects_router.post("/{project_id}/continuation-commands")
def commit_project_graph_continuation_command(
    project_id: str,
    payload: Dict[str, Any] = Body(...),
    user: Dict = Depends(get_current_user),
) -> Response:
    """Validate, apply, and persist an Action Editor continuation against authoritative CRDT state."""
    project = _get_accessible_project(project_id, user)
    _ensure_project_editor(project)
    record = db_service.get_project_crdt_snapshot_record(project_id)
    if record is None:
        raise HTTPException(status_code=409, detail="Project graph snapshot not found")

    base_revision = payload.get("baseRevision")
    if base_revision is not None and int(base_revision) != record["revision"]:
        raise HTTPException(status_code=409, detail="Project graph snapshot revision conflict")

    command = dict(payload)
    command.pop("baseRevision", None)
    bridge = ProjectGraphCrdtSnapshotBridge()
    try:
        graph = bridge.import_snapshot(record["snapshot"])
        validate_continuation_request(command, graph)
        mutation = bridge.mutate_continuation(record["snapshot"], command)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not db_service.compare_and_swap_project_crdt_snapshot(
        project_id,
        mutation["snapshot"],
        expected_revision=record["revision"],
    ):
        raise HTTPException(status_code=409, detail="Project graph snapshot revision conflict")

    updated_record = db_service.get_project_crdt_snapshot_record(project_id)
    headers = {
        "X-Project-Graph-Revision": str(updated_record["revision"] if updated_record else record["revision"] + 1),
        "X-Project-Graph-Command-Result": base64.b64encode(
            json.dumps(mutation["result"], ensure_ascii=False).encode("utf-8")
        ).decode("ascii"),
    }
    return Response(content=mutation["update"], media_type="application/octet-stream", headers=headers)


@projects_router.post("/{project_id}/structure-commands")
def commit_project_graph_structure_command(
    project_id: str,
    payload: Dict[str, Any] = Body(...),
    user: Dict = Depends(get_current_user),
) -> Response:
    """Validate, apply, and persist a safe file/label/node structure command against authoritative CRDT state."""
    project = _get_accessible_project(project_id, user)
    _ensure_project_editor(project)
    record = db_service.get_project_crdt_snapshot_record(project_id)
    if record is None:
        raise HTTPException(status_code=409, detail="Project graph snapshot not found")

    base_revision = payload.get("baseRevision")
    if base_revision is not None and int(base_revision) != record["revision"]:
        raise HTTPException(status_code=409, detail="Project graph snapshot revision conflict")

    command = dict(payload)
    command.pop("baseRevision", None)
    bridge = ProjectGraphCrdtSnapshotBridge()
    try:
        graph = bridge.import_snapshot(record["snapshot"])
        validated = validate_structure_command(command, graph)
        mutation = bridge.mutate_structure(record["snapshot"], validated)
    except UnsafeProjectGraphDeletion as exc:
        raise HTTPException(
            status_code=409,
            detail={"code": "project_graph_deletion_blocked", "impact": exc.impact},
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not db_service.compare_and_swap_project_crdt_snapshot(
        project_id, mutation["snapshot"], expected_revision=record["revision"],
    ):
        raise HTTPException(status_code=409, detail="Project graph snapshot revision conflict")

    updated_record = db_service.get_project_crdt_snapshot_record(project_id)
    headers = {
        "X-Project-Graph-Revision": str(updated_record["revision"] if updated_record else record["revision"] + 1),
        "X-Project-Graph-Command-Result": base64.b64encode(
            json.dumps(mutation["result"], ensure_ascii=False).encode("utf-8")
        ).decode("ascii"),
    }
    return Response(content=mutation["update"], media_type="application/octet-stream", headers=headers)


@projects_router.post("/{project_id}/graph-import")
def import_project_graph(
    project_id: str,
    files: List[UploadFile] = File(...),
    file_paths: Optional[List[str]] = Form(None),
    asset_catalog: Optional[str] = Form(None),
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Import uploaded Ren'Py files into one ProjectGraph and persist its Loro snapshot."""
    start_time = time.perf_counter()
    source = "local_directory" if file_paths or asset_catalog else "upload"
    try:
        project = _get_accessible_project(project_id, user)
        _ensure_project_editor(project)

        if not files:
            raise HTTPException(status_code=400, detail="At least one .rpy file is required")
        if len(files) > MAX_GRAPH_IMPORT_FILES:
            raise HTTPException(status_code=413, detail="Too many .rpy files for one import")

        normalized_file_paths: list[str] = []
        if file_paths is not None:
            if len(file_paths) != len(files):
                raise HTTPException(status_code=400, detail="file_paths must match uploaded files")
            normalized_file_paths = [_normalize_project_file_path(path) for path in file_paths]

        normalized_catalog = _parse_asset_catalog(asset_catalog)
        source = _import_source(file_paths, normalized_catalog)

        with tempfile.TemporaryDirectory(prefix="renpy-graph-import-") as temp_dir:
            temp_paths: list[Path] = []
            total_upload_bytes = 0
            for index, upload in enumerate(files):
                filename = Path(upload.filename or "").name
                if not filename:
                    raise HTTPException(status_code=400, detail="Uploaded file must have a filename")

                project_file_path = normalized_file_paths[index] if normalized_file_paths else filename
                if Path(project_file_path).suffix.lower() != ".rpy":
                    raise HTTPException(status_code=400, detail="Only .rpy files can be imported")

                content = upload.file.read(MAX_GRAPH_IMPORT_FILE_BYTES + 1)
                if not content:
                    raise HTTPException(status_code=400, detail=f"Uploaded file is empty: {project_file_path}")
                if len(content) > MAX_GRAPH_IMPORT_FILE_BYTES:
                    raise HTTPException(status_code=413, detail=f"Uploaded file is too large: {project_file_path}")
                total_upload_bytes += len(content)
                if total_upload_bytes > MAX_GRAPH_IMPORT_TOTAL_BYTES:
                    raise HTTPException(status_code=413, detail="Project graph import payload is too large")

                temp_path = Path(temp_dir) / project_file_path
                temp_path.parent.mkdir(parents=True, exist_ok=True)
                temp_path.write_bytes(content)
                temp_paths.append(temp_path)

            imported_graph = ProjectGraphImporter().import_files(
                project_id=project_id,
                files=temp_paths,
                file_paths=normalized_file_paths if normalized_file_paths else None,
            )
            graph = ProjectGraphResolver().resolve(imported_graph)

        snapshot = ProjectGraphCrdtSnapshotBridge().export_snapshot(graph)
        db_service.save_project_graph_data(project_id, snapshot, normalized_catalog, user["id"])
        if normalized_catalog is not None:
            catalog_save_start = time.perf_counter()
            observe_asset_catalog(
                operation="import_save",
                result="success",
                duration_seconds=time.perf_counter() - catalog_save_start,
                catalog=normalized_catalog,
            )

        diagnostics_summary = _project_graph_diagnostics_summary(graph)
        observe_graph_import(
            source=source,
            result="success",
            duration_seconds=time.perf_counter() - start_time,
            file_count=len(graph.files),
            label_count=len(graph.labels),
            label_start_count=len(graph.label_starts),
            node_count=len(graph.nodes),
            edge_count=len(graph.edges),
            diagnostics=diagnostics_summary,
            snapshot_bytes=len(snapshot),
            catalog_entry_count=len(normalized_catalog["entries"]) if normalized_catalog is not None else 0,
        )
        return {
            "project_id": project_id,
            "file_count": len(graph.files),
            "label_count": len(graph.labels),
            "label_start_count": len(graph.label_starts),
            "node_count": len(graph.nodes),
            "edge_count": len(graph.edges),
            "diagnostics": diagnostics_summary,
            "snapshot_available": db_service.get_project_crdt_snapshot(project_id) is not None,
            "catalog_entry_count": len(normalized_catalog["entries"]) if normalized_catalog is not None else 0,
        }
    except HTTPException as exc:
        observe_graph_import(
            source=source,
            result=_http_metric_result(exc.status_code),
            duration_seconds=time.perf_counter() - start_time,
        )
        raise
    except Exception as e:
        observe_graph_import(
            source=source,
            result="error",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise HTTPException(status_code=500, detail=f"Failed to import project graph: {str(e)}")


@projects_router.get("/{project_id}/asset-catalog")
def get_project_asset_catalog(
    project_id: str,
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return the latest text-only local Ren'Py asset catalog for a project."""
    start_time = time.perf_counter()
    try:
        _get_accessible_project(project_id, user)
        catalog = db_service.get_project_asset_catalog(project_id)
        if catalog is None:
            observe_asset_catalog(
                operation="load",
                result="not_found",
                duration_seconds=time.perf_counter() - start_time,
            )
            raise HTTPException(status_code=404, detail="Project asset catalog not found")
        observe_asset_catalog(
            operation="load",
            result="success",
            duration_seconds=time.perf_counter() - start_time,
            catalog=catalog.get("catalog"),
        )
        return catalog
    except HTTPException as exc:
        if exc.status_code != 404:
            observe_asset_catalog(
                operation="load",
                result=_http_metric_result(exc.status_code),
                duration_seconds=time.perf_counter() - start_time,
            )
        raise
    except Exception as e:
        observe_asset_catalog(
            operation="load",
            result="error",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise HTTPException(status_code=500, detail=f"Failed to get project asset catalog: {str(e)}")


@projects_router.put("/{project_id}/asset-catalog")
def update_project_asset_catalog(
    project_id: str,
    catalog: Dict[str, Any] = Body(...),
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Replace the latest text-only local Ren'Py asset catalog for a project."""
    start_time = time.perf_counter()
    try:
        project = _get_accessible_project(project_id, user)
        _ensure_project_catalog_updater(project)
        normalized_catalog = _normalize_asset_catalog(catalog)
        db_service.save_project_asset_catalog(project_id, normalized_catalog, updated_by=user["id"])
        saved_catalog = db_service.get_project_asset_catalog(project_id)
        observe_asset_catalog(
            operation="save",
            result="success",
            duration_seconds=time.perf_counter() - start_time,
            catalog=normalized_catalog,
        )
        return saved_catalog or {
            "project_id": project_id,
            "catalog": normalized_catalog,
            "revision": 1,
            "updated_by": user["id"],
            "updated_at": None,
        }
    except HTTPException as exc:
        observe_asset_catalog(
            operation="save",
            result=_http_metric_result(exc.status_code),
            duration_seconds=time.perf_counter() - start_time,
        )
        raise
    except Exception as e:
        observe_asset_catalog(
            operation="save",
            result="error",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise HTTPException(status_code=500, detail=f"Failed to update project asset catalog: {str(e)}")


@projects_router.post("/{project_id}/graph-export")
def export_project_graph(
    project_id: str,
    graph_snapshot: Dict[str, Any] = Body(...),
    user: Dict = Depends(get_current_user),
) -> Dict[str, Dict[str, str]]:
    """Export a ProjectGraph payload into normalized Ren'Py files."""
    start_time = time.perf_counter()
    try:
        _get_accessible_project(project_id, user)
        if graph_snapshot.get("project_id") != project_id:
            observe_graph_export(
                result="bad_request",
                duration_seconds=time.perf_counter() - start_time,
            )
            raise HTTPException(status_code=400, detail="ProjectGraph project_id does not match route project_id")
        _ensure_graph_export_payload_within_limits(graph_snapshot)

        graph = ProjectGraphSnapshotCodec.load(graph_snapshot)
        blocking_diagnostics = _blocking_export_diagnostics(graph)
        warning_diagnostics = len([diagnostic for diagnostic in graph.diagnostics if diagnostic.severity == "warning"])
        if blocking_diagnostics:
            observe_graph_export(
                result="blocked",
                duration_seconds=time.perf_counter() - start_time,
                blocking_diagnostics=len(blocking_diagnostics),
                warning_diagnostics=warning_diagnostics,
            )
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "ProjectGraph export blocked by blocking diagnostics",
                    "diagnostics": blocking_diagnostics,
                },
            )

        exported_files = ProjectGraphExporter().export(graph)
        output_bytes = sum(len(content.encode("utf-8")) for content in exported_files.values())
        if output_bytes > MAX_GRAPH_EXPORT_OUTPUT_BYTES:
            observe_graph_export(
                result="too_large",
                duration_seconds=time.perf_counter() - start_time,
                output_bytes=output_bytes,
                blocking_diagnostics=0,
                warning_diagnostics=warning_diagnostics,
            )
            raise HTTPException(status_code=413, detail="ProjectGraph export output is too large")
        observe_graph_export(
            result="success",
            duration_seconds=time.perf_counter() - start_time,
            file_count=len(exported_files),
            output_bytes=output_bytes,
            blocking_diagnostics=0,
            warning_diagnostics=warning_diagnostics,
        )
        return {"files": exported_files}
    except HTTPException as exc:
        if exc.status_code != 400:
            observe_graph_export(
                result=_http_metric_result(exc.status_code),
                duration_seconds=time.perf_counter() - start_time,
            )
        raise
    except Exception as e:
        observe_graph_export(
            result="error",
            duration_seconds=time.perf_counter() - start_time,
        )
        raise HTTPException(status_code=500, detail=f"Failed to export project graph: {str(e)}")


@projects_router.post("/{project_id}/share")
def share_project(
    project_id: str,
    # The key in the request body is 'user_id', but it contains the username.
    username_to_share: str = Body(..., alias="user_id"), 
    role_identifier: Optional[str] = Body(None, alias="role"),  # None revokes access
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, str]:
    """Share a project with another user by their username."""
    try:
        # 1. Check if the current user can manage the project.
        current_project = _get_accessible_project(project_id, current_user)
        _ensure_project_admin(current_project)
        project_details = db_service.get_project_details(project_id)
        logger.debug(f"Sharing project {project_id}. Details: {project_details}")

        if not project_details:
            logger.warning(f"Project {project_id} not found for sharing attempt by user {current_user['id']}.")
            raise HTTPException(status_code=404, detail=f"Project with ID '{project_id}' not found.")
        
        owner_id_str = str(project_details.get("owner_id"))
        current_user_id_str = str(current_user["id"])
        logger.debug(f"Project Owner ID: {owner_id_str}, Current User ID: {current_user_id_str}")

        logger.debug(f"Attempting to find user to share with by username: '{username_to_share}'")

        if role_identifier is None:
            user_to_share_details = db_service.get_user_by_username(username_to_share.strip())
            if not user_to_share_details:
                logger.warning(f"User with username '{username_to_share}' not found.")
                raise HTTPException(status_code=404, detail=f"User '{username_to_share}' not found.")
            user_id_to_share_with = user_to_share_details["id"]
            if str(user_id_to_share_with) == owner_id_str:
                raise HTTPException(status_code=400, detail="The project owner cannot be removed from the project.")
            db_service.revoke_project_access(project_id, user_id_to_share_with)
            logger.info(f"Revoked access for user {user_id_to_share_with} from project {project_id}.")
            return {"status": "success", "message": f"Project access removed for user '{username_to_share}'"}

        logger.debug(f"Role identifier received from frontend: '{role_identifier}' for user '{username_to_share}'")
        user_to_share_details, role_info = _resolve_share_target(username_to_share, role_identifier)
        user_id_to_share_with = user_to_share_details["id"]
        role_id_to_grant = role_info["id"]
        logger.info(f"Found user '{username_to_share}' with ID '{user_id_to_share_with}'.")

        if str(user_id_to_share_with) == owner_id_str and role_id_to_grant != "role_owner":
            raise HTTPException(status_code=400, detail="The project owner role cannot be changed.")

        if not role_id_to_grant:
            logger.error(f"Could not determine a valid role ID for input: '{role_identifier}' after checks.")
            raise HTTPException(status_code=400, detail=f"Could not determine a valid role ID for input: {role_identifier}")

        # 4. Grant access using the determined user_id and role_id
        logger.info(f"Attempting to grant access for project {project_id} to user {user_id_to_share_with} (username: {username_to_share}) with role_id {role_id_to_grant} by manager {current_user_id_str}.")
        if not db_service.grant_project_access(project_id, user_id_to_share_with, role_id_to_grant):
            raise HTTPException(status_code=500, detail=f"Failed to grant project access to user '{username_to_share}'.")
        logger.info(f"Successfully shared project {project_id} with user {user_id_to_share_with} (username: {username_to_share}) with role_id {role_id_to_grant} by manager {current_user_id_str}.")
        return {"status": "success", "message": f"Project shared with user '{username_to_share}'"}
    
    except HTTPException as http_exc:
        # Log the specific username and role for which the HTTP exception occurred
        logger.error(f"HTTPException in share_project for project {project_id}, username '{username_to_share if 'username_to_share' in locals() else 'unknown'}', role '{role_identifier if 'role_identifier' in locals() else 'unknown'}': {http_exc.detail}", exc_info=True)
        raise http_exc
    except Exception as e:
        logger.error(f"Unexpected error in share_project for project {project_id}, username '{username_to_share if 'username_to_share' in locals() else 'unknown'}', role '{role_identifier if 'role_identifier' in locals() else 'unknown'}': {str(e)}", exc_info=True)

@projects_router.delete("/{project_id}")
def delete_project(
    project_id: str,
    user: Dict = Depends(get_current_user)
) -> Dict[str, str]:
    """Delete a project. Owners and project admins can delete a project."""
    logger.info(f"Attempting to delete project {project_id} by user {user.get('id')}. User details: {user}")
    try:
        project_details = db_service.get_project_details(project_id)
        if not project_details:
            logger.warning(f"Project not found: {project_id}")
            raise HTTPException(status_code=404, detail="Project not found")
        try:
            project = _get_accessible_project(project_id, user)
        except HTTPException as exc:
            if exc.status_code == 404:
                raise HTTPException(status_code=403, detail="You do not have permission to delete this project.") from exc
            raise
        _ensure_project_admin(project)
        
        logger.debug(f"Calling delete_project for project_id: {project_id}")
        db_service.delete_project(project_id)
        logger.info(f"Project {project_id} deleted by project manager {user['id']}.")
        return {"status": "success", "message": f"Project {project_id} deleted successfully."}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Failed to delete project {project_id} for user {user['id']}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")
