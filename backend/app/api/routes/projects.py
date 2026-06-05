import json
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Body, Request, Response, File, UploadFile, Form
from typing import List, Dict, Any, Optional
from ...services.database import DatabaseService
from ...services.project_graph.crdt_bridge import ProjectGraphCrdtSnapshotBridge
from ...services.project_graph.exporter import ProjectGraphExporter
from ...services.project_graph.importer import ProjectGraphImporter
from ...services.project_graph.resolver import ProjectGraphResolver
from ...services.project_graph.snapshot import ProjectGraphSnapshotCodec
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


def _get_accessible_project(project_id: str, user: Dict) -> Dict:
    projects = db_service.get_user_projects(user["id"])
    project = next((p for p in projects if p["id"] == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found or access denied")
    return project


def _ensure_project_editor(project: Dict) -> None:
    if project.get("role") not in ["Owner", "Editor"]:
        raise HTTPException(status_code=403, detail="You don't have permission to edit this project")


def _ensure_project_catalog_updater(project: Dict) -> None:
    if project.get("role") != "Owner":
        raise HTTPException(status_code=403, detail="You don't have permission to update this project's asset catalog")


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


def _normalize_asset_catalog(raw_catalog: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(raw_catalog, dict):
        raise HTTPException(status_code=400, detail="asset_catalog must be an object")

    entries = raw_catalog.get("entries")
    if entries is None:
        entries = []
    if not isinstance(entries, list):
        raise HTTPException(status_code=400, detail="asset_catalog.entries must be a list")

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
    return normalized_catalog


def _parse_asset_catalog(asset_catalog: Optional[str]) -> Optional[Dict[str, Any]]:
    if asset_catalog is None or not asset_catalog.strip():
        return None
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

@projects_router.post("/")
async def create_project(
    name: str = Body(...), 
    description: str = Body(None),
    user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new project."""
    try:
        # Create project
        project_id = db_service.create_project(name, user["id"], description)
        
        # Grant project access to creator (as owner)
        db_service.grant_project_access(project_id, user["id"], "role_owner")
        
        return {
            "id": project_id,
            "name": name,
            "description": description,
            "owner_id": user["id"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")

@projects_router.get("/")
async def list_projects(user: Dict = Depends(get_current_user)) -> List[Dict]:
    """List projects accessible to the current user."""
    try:
        return db_service.get_user_projects(user["id"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list projects: {str(e)}")

@projects_router.get("/{project_id}")
async def get_project(project_id: str, user: Dict = Depends(get_current_user)) -> Dict:
    """Get project details."""
    try:
        projects = db_service.get_user_projects(user["id"])
        project = next((p for p in projects if p["id"] == project_id), None)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
        
        # Get scripts in this project
        scripts = db_service.get_project_scripts(project_id)
        
        # Get active users in this project
        active_users = db_service.get_active_project_users(project_id)
        
        return {
            **project,
            "scripts": scripts,
            "active_users": active_users
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get project: {str(e)}")

@projects_router.get("/{project_id}/graph-snapshot")
async def get_project_graph_snapshot(
    project_id: str,
    user: Dict = Depends(get_current_user),
) -> Response:
    """Return the latest opaque ProjectGraph CRDT snapshot for a project."""
    try:
        _get_accessible_project(project_id, user)

        snapshot = db_service.get_project_crdt_snapshot(project_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="Project graph snapshot not found")

        return Response(content=snapshot, media_type="application/octet-stream")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get project graph snapshot: {str(e)}")


@projects_router.put("/{project_id}/graph-snapshot")
async def save_project_graph_snapshot(
    project_id: str,
    request: Request,
    user: Dict = Depends(get_current_user),
) -> Dict[str, str]:
    """Persist the latest opaque ProjectGraph CRDT snapshot for a project."""
    try:
        project = _get_accessible_project(project_id, user)
        _ensure_project_editor(project)

        snapshot = await request.body()
        if not snapshot:
            raise HTTPException(status_code=400, detail="Project graph snapshot is empty")

        db_service.save_project_crdt_snapshot(project_id, snapshot)
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save project graph snapshot: {str(e)}")


@projects_router.post("/{project_id}/graph-import")
async def import_project_graph(
    project_id: str,
    files: List[UploadFile] = File(...),
    file_paths: Optional[List[str]] = Form(None),
    asset_catalog: Optional[str] = Form(None),
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Import uploaded Ren'Py files into one ProjectGraph and persist its Loro snapshot."""
    try:
        project = _get_accessible_project(project_id, user)
        _ensure_project_editor(project)

        if not files:
            raise HTTPException(status_code=400, detail="At least one .rpy file is required")

        normalized_file_paths: list[str] = []
        if file_paths is not None:
            if len(file_paths) != len(files):
                raise HTTPException(status_code=400, detail="file_paths must match uploaded files")
            normalized_file_paths = [_normalize_project_file_path(path) for path in file_paths]

        normalized_catalog = _parse_asset_catalog(asset_catalog)

        with tempfile.TemporaryDirectory(prefix="renpy-graph-import-") as temp_dir:
            temp_paths: list[Path] = []
            for index, upload in enumerate(files):
                filename = Path(upload.filename or "").name
                if not filename:
                    raise HTTPException(status_code=400, detail="Uploaded file must have a filename")

                project_file_path = normalized_file_paths[index] if normalized_file_paths else filename
                if Path(project_file_path).suffix.lower() != ".rpy":
                    raise HTTPException(status_code=400, detail="Only .rpy files can be imported")

                content = await upload.read()
                if not content:
                    raise HTTPException(status_code=400, detail=f"Uploaded file is empty: {project_file_path}")

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
        db_service.save_project_crdt_snapshot(project_id, snapshot)
        if normalized_catalog is not None:
            db_service.save_project_asset_catalog(project_id, normalized_catalog, updated_by=user["id"])

        return {
            "project_id": project_id,
            "file_count": len(graph.files),
            "label_count": len(graph.labels),
            "label_start_count": len(graph.label_starts),
            "node_count": len(graph.nodes),
            "edge_count": len(graph.edges),
            "diagnostics": _project_graph_diagnostics_summary(graph),
            "snapshot_available": db_service.get_project_crdt_snapshot(project_id) is not None,
            "catalog_entry_count": len(normalized_catalog["entries"]) if normalized_catalog is not None else 0,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import project graph: {str(e)}")


@projects_router.get("/{project_id}/asset-catalog")
async def get_project_asset_catalog(
    project_id: str,
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return the latest text-only local Ren'Py asset catalog for a project."""
    try:
        _get_accessible_project(project_id, user)
        catalog = db_service.get_project_asset_catalog(project_id)
        if catalog is None:
            raise HTTPException(status_code=404, detail="Project asset catalog not found")
        return catalog
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get project asset catalog: {str(e)}")


@projects_router.put("/{project_id}/asset-catalog")
async def update_project_asset_catalog(
    project_id: str,
    catalog: Dict[str, Any] = Body(...),
    user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Replace the latest text-only local Ren'Py asset catalog for a project."""
    try:
        project = _get_accessible_project(project_id, user)
        _ensure_project_catalog_updater(project)
        normalized_catalog = _normalize_asset_catalog(catalog)
        db_service.save_project_asset_catalog(project_id, normalized_catalog, updated_by=user["id"])
        saved_catalog = db_service.get_project_asset_catalog(project_id)
        return saved_catalog or {
            "project_id": project_id,
            "catalog": normalized_catalog,
            "revision": 1,
            "updated_by": user["id"],
            "updated_at": None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update project asset catalog: {str(e)}")


@projects_router.post("/{project_id}/graph-export")
async def export_project_graph(
    project_id: str,
    graph_snapshot: Dict[str, Any] = Body(...),
    user: Dict = Depends(get_current_user),
) -> Dict[str, Dict[str, str]]:
    """Export a ProjectGraph payload into normalized Ren'Py files."""
    try:
        _get_accessible_project(project_id, user)
        if graph_snapshot.get("project_id") != project_id:
            raise HTTPException(status_code=400, detail="ProjectGraph project_id does not match route project_id")

        graph = ProjectGraphSnapshotCodec.load(graph_snapshot)
        blocking_diagnostics = _blocking_export_diagnostics(graph)
        if blocking_diagnostics:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "ProjectGraph export blocked by blocking diagnostics",
                    "diagnostics": blocking_diagnostics,
                },
            )

        exported_files = ProjectGraphExporter().export(graph)
        return {"files": exported_files}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export project graph: {str(e)}")


@projects_router.post("/{project_id}/share")
async def share_project(
    project_id: str,
    # The key in the request body is 'user_id', but it contains the username.
    username_to_share: str = Body(..., alias="user_id"), 
    role_identifier: str = Body(..., alias="role"),  # Renamed for clarity
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, str]:
    """Share a project with another user by their username."""
    try:
        # 1. Check if the current user is the owner of the project
        project_details = db_service.get_project_details(project_id)
        logger.debug(f"Sharing project {project_id}. Details: {project_details}")

        if not project_details:
            logger.warning(f"Project {project_id} not found for sharing attempt by user {current_user['id']}.")
            raise HTTPException(status_code=404, detail=f"Project with ID '{project_id}' not found.")
        
        owner_id_str = str(project_details.get("owner_id"))
        current_user_id_str = str(current_user["id"])
        logger.debug(f"Project Owner ID: {owner_id_str}, Current User ID: {current_user_id_str}")

        if owner_id_str != current_user_id_str:
            logger.warning(f"User {current_user_id_str} (not owner) attempted to share project {project_id} owned by {owner_id_str}.")
            raise HTTPException(status_code=403, detail="Only the project owner can share the project.")

        # 2. Get the user to share with by their username
        logger.debug(f"Attempting to find user to share with by username: '{username_to_share}'")
        user_to_share_details = db_service.get_user_by_username(username_to_share)
        if not user_to_share_details:
            logger.warning(f"User with username '{username_to_share}' not found.")
            raise HTTPException(status_code=404, detail=f"User '{username_to_share}' not found.")
        
        user_id_to_share_with = user_to_share_details["id"]
        logger.info(f"Found user '{username_to_share}' with ID '{user_id_to_share_with}'.")

        # 3. Determine the role ID to grant
        role_id_to_grant = None
        logger.debug(f"Role identifier received from frontend: '{role_identifier}' for user '{username_to_share}'")

        role_info_by_id = db_service.get_role_by_id(role_identifier)
        if role_info_by_id:
            role_id_to_grant = role_info_by_id["id"]
            logger.info(f"Role '{role_identifier}' identified as ID. Role to grant: {role_id_to_grant}")
        else:
            logger.info(f"Role '{role_identifier}' not found by ID. Attempting to find by name.")
            role_info_by_name = db_service.get_role_by_name(role_identifier)
            if role_info_by_name:
                role_id_to_grant = role_info_by_name["id"]
                logger.info(f"Role '{role_identifier}' identified as Name. DB returned role_id: {role_id_to_grant}")
            else:
                logger.error(f"Invalid role provided: '{role_identifier}'. Not found as ID or Name.")
                raise HTTPException(status_code=400, detail=f"Invalid role: '{role_identifier}'. Role not found.")

        if not role_id_to_grant:
            logger.error(f"Could not determine a valid role ID for input: '{role_identifier}' after checks.")
            raise HTTPException(status_code=400, detail=f"Could not determine a valid role ID for input: {role_identifier}")

        # 4. Grant access using the determined user_id and role_id
        logger.info(f"Attempting to grant access for project {project_id} to user {user_id_to_share_with} (username: {username_to_share}) with role_id {role_id_to_grant} by owner {current_user_id_str}.")
        db_service.grant_project_access(project_id, user_id_to_share_with, role_id_to_grant)
        logger.info(f"Successfully shared project {project_id} with user {user_id_to_share_with} (username: {username_to_share}) with role_id {role_id_to_grant} by owner {current_user_id_str}.")
        return {"status": "success", "message": f"Project shared with user '{username_to_share}'"}
    
    except HTTPException as http_exc:
        # Log the specific username and role for which the HTTP exception occurred
        logger.error(f"HTTPException in share_project for project {project_id}, username '{username_to_share if 'username_to_share' in locals() else 'unknown'}', role '{role_identifier if 'role_identifier' in locals() else 'unknown'}': {http_exc.detail}", exc_info=True)
        raise http_exc
    except Exception as e:
        logger.error(f"Unexpected error in share_project for project {project_id}, username '{username_to_share if 'username_to_share' in locals() else 'unknown'}', role '{role_identifier if 'role_identifier' in locals() else 'unknown'}': {str(e)}", exc_info=True)

@projects_router.post("/{project_id}/scripts")
async def create_script(
    project_id: str,
    filename: str = Body(...),
    content: str = Body(...),
    user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new script in a project."""
    try:
        # Verify user has access to the project
        # Note: This relies on db_service.get_user_projects returning the user's role for this project.
        projects = db_service.get_user_projects(user["id"])
        project = next((p for p in projects if p["id"] == project_id), None)
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or access denied")

        # Check if user has edit permissions (Owner or Editor role)
        # Ensure the 'role' key exists before checking its value.
        if "role" not in project:
            logger.error(f"Role information missing for user {user['id']} in project {project_id}. Project data: {project}")
            # Ideally, db_service.get_user_projects should always return the role.
            # As a fallback, consider fetching the role explicitly here if possible.
            raise HTTPException(status_code=500, detail="Internal server error: Could not determine user role for the project.")
            
        if project["role"] not in ["Owner", "Editor"]:
            logger.warning(f"User {user['id']} with role '{project['role']}' attempted to create script in project {project_id}. Permission denied.")
            raise HTTPException(status_code=403, detail="You don't have permission to create scripts in this project")
            
        # Create the script
        script_id = db_service.save_script(project_id, filename, content, user["id"])
        logger.info(f"User {user['id']} created script {script_id} ('{filename}') in project {project_id}")
        return {
            "id": script_id,
            "filename": filename,
            "project_id": project_id
        }
    except HTTPException as http_exc: # Re-raise HTTP exceptions directly
        raise http_exc
    except Exception as e:
        logger.error(f"Failed to create script in project {project_id} for user {user['id']}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create script: {str(e)}") 

@projects_router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    user: Dict = Depends(get_current_user)
) -> Dict[str, str]:
    """Delete a project. Only the project owner can delete a project."""
    logger.info(f"Attempting to delete project {project_id} by user {user.get('id')}. User details: {user}")
    try:
        # First, get the project to check ownership
        logger.debug(f"Calling get_project_details for project_id: {project_id}")
        project_details = db_service.get_project_details(project_id)
        logger.debug(f"Retrieved project_details: {project_details}")
        if not project_details:
            logger.warning(f"Project not found: {project_id}")
            raise HTTPException(status_code=404, detail="Project not found")

        # Ensure consistent string comparison for owner_id
        current_user_id_str = str(user.get("id"))
        project_owner_id_str = str(project_details.get("owner_id"))

        if project_owner_id_str != current_user_id_str:
            logger.warning(f"User {current_user_id_str} attempted to delete project {project_id} owned by {project_owner_id_str}. Permission denied.")
            raise HTTPException(status_code=403, detail="You do not have permission to delete this project.")
        
        # If the user is the owner, proceed with deletion
        logger.debug(f"Calling delete_project for project_id: {project_id}")
        db_service.delete_project(project_id) # This method needs to be implemented in DatabaseService
        logger.info(f"Project {project_id} deleted by owner {user['id']}.")
        return {"status": "success", "message": f"Project {project_id} deleted successfully."}
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Failed to delete project {project_id} for user {user['id']}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")
