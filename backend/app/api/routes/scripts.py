from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Body, Depends
from fastapi.responses import JSONResponse
import os
import tempfile
import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, List
import uuid

# Removed parser import
from ...services.database import DatabaseService
from ...models.exceptions import ResourceNotFoundException, DatabaseException
from ...services.websocket import connection_manager
from ..routes.auth import get_current_user, oauth2_scheme

# Create router
scripts_router = APIRouter(
    prefix="/scripts",
    tags=["scripts"],
    responses={404: {"description": "Not found"}},
)

# Initialize services
db_service = DatabaseService()
# parser = RenPyParser() # Removed

# Routes
@scripts_router.post("/parse", response_model=Dict[str, Any])
async def parse_script(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    project_id: str = Form(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Accepts a script file and returns its content for client-side parsing.
    Legacy name "parse" kept for compatibility, but now it acts as an upload/read endpoint.
    """
    try:
        # Validate user has access to the project
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this project")

        content = await file.read()
        content_str = content.decode('utf-8')
        
        # Save to database (create new script entry)
        filename = file.filename or "uploaded.rpy"
        script_id = db_service.create_script(project_id, filename, content_str, current_user["id"])
        
        return {
            "script_id": script_id,
            "filename": filename,
            "content": content_str,
            # "tree": ... # No longer returned
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing script: {str(e)}")

@scripts_router.get("/node-content/{script_id}", response_model=Dict[str, str])
async def get_node_content(
    script_id: str,
    start_line: int,
    end_line: int,
    token: str = Depends(oauth2_scheme)
) -> Dict[str, str]:
    """
    Get the raw content of a specific node by line numbers.
    """
    try:
        current_user = await get_current_user(token)
        
        # Get script from database
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        # Validate user has access
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this script")
        
        content_lines = script["content_lines"]
        
        # Validate lines
        if start_line < 0 or end_line >= len(content_lines) or start_line > end_line:
            raise HTTPException(status_code=400, detail="Invalid line range")

        node_content = "\n".join(content_lines[start_line:end_line+1])
        
        return {"content": node_content}
    except ResourceNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting node content: {str(e)}")

@scripts_router.post("/update-node/{script_id}", response_model=Dict[str, Any])
async def update_node_content(
    script_id: str,
    start_line: int,
    end_line: int,
    content: str = Body(..., embed=True),
    token: str = Depends(oauth2_scheme)
) -> Dict[str, Any]:
    """
    Update the content of a node.
    """
    try:
        current_user = await get_current_user(token)
        
        # Get script
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)

        # Validate access
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this script")

        content_lines = script["content_lines"]
        
        # Validate lines
        if start_line < 0 or end_line >= len(content_lines) or start_line > end_line:
            raise HTTPException(status_code=400, detail="Invalid line range")

        # Replace content
        new_lines = content.splitlines()
        content_lines[start_line:end_line+1] = new_lines
        new_content = "\n".join(content_lines)

        # Save
        db_service.update_script(script_id, new_content, current_user["id"])

        # No re-parsing here. Client should handle update or reload.
        # Broadcast raw update notification
        # The client will likely need to re-fetch or re-parse locally if the structure changed.
        # But for text content update, maybe structure didn't change?
        # Ideally we broadcast "content_updated" and clients decide.

        await connection_manager.broadcast_to_script(
            script_id,
            {
                "type": "content_updated", # Generic update
                "user_id": current_user["id"],
                "timestamp": "now"
            }
        )

        return {"success": True, "message": "Node updated successfully"}
    except ResourceNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating node: {str(e)}")

@scripts_router.post("/insert-node/{script_id}", response_model=Dict[str, Any])
async def insert_node(
    script_id: str,
    insertion_line: int,
    node_type: str = Body(...),
    content: str = Body(...),
    token: str = Depends(oauth2_scheme)
) -> Dict[str, Any]:
    """
    Insert a new node at a specific line.
    """
    try:
        current_user = await get_current_user(token)
        
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this script")
        
        content_lines = script["content_lines"]
        
        if insertion_line < 0 or insertion_line > len(content_lines):
            raise HTTPException(status_code=400, detail="Invalid insertion line")
        
        new_content_lines = content.splitlines()
        content_lines[insertion_line:insertion_line] = new_content_lines
        new_content = "\n".join(content_lines)
        
        db_service.update_script(script_id, new_content, current_user["id"])
        
        # NO PARSING.
        
        # Broadcast insert
        await connection_manager.broadcast_to_script(
            script_id,
            {
                "type": "content_inserted",
                "line": insertion_line,
                "count": len(new_content_lines),
                "user_id": current_user["id"]
            }
        )

        return {
            "start_line": insertion_line,
            "end_line": insertion_line + len(new_content_lines) - 1,
            "line_count": len(new_content_lines),
            "content": content
            # "tree": ... # Removed
        }
    except ResourceNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error inserting node: {str(e)}")

@scripts_router.get("/download/{script_id}", response_model=Dict[str, Any])
async def download_script(
    script_id: str,
    token: str = Depends(oauth2_scheme)
) -> JSONResponse:
    try:
        current_user = await get_current_user(token)
        
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this script")
        
        return JSONResponse({
            "filename": script["filename"],
            "content": script["content"]
        })
    except ResourceNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error downloading script: {str(e)}")

@scripts_router.delete("/{script_id}", response_model=Dict[str, str])
async def delete_script(
    script_id: str,
    token: str = Depends(oauth2_scheme)
) -> Dict[str, str]:
    try:
        current_user = await get_current_user(token)
        
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id and p.get("role") in ["Owner", "Editor"] 
                        for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Permission denied to delete this script")
        
        deleted = db_service.delete_script(script_id)
        if not deleted:
            raise HTTPException(status_code=500, detail="Failed to delete script")
        
        return {"message": "Script deleted successfully"}
    except ResourceNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting script: {str(e)}")

@scripts_router.get("/project/{project_id}", response_model=List[Dict[str, Any]])
async def get_project_scripts(
    project_id: str,
    token: str = Depends(oauth2_scheme)
) -> List[Dict[str, Any]]:
    try:
        current_user = await get_current_user(token)
        
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this project")
        
        scripts = db_service.get_project_scripts(project_id)
        return scripts
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting project scripts: {str(e)}")

@scripts_router.get("/search", response_model=List[Dict[str, Any]])
async def search_scripts(
    query: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = 20,
    token: str = Depends(oauth2_scheme)
) -> List[Dict[str, Any]]:
    try:
        current_user = await get_current_user(token)
        
        if project_id:
            user_projects = db_service.get_user_projects(current_user["id"])
            has_access = any(p["id"] == project_id for p in user_projects)
            
            if not has_access:
                raise HTTPException(status_code=403, detail="Access denied to this project")
        
        results = db_service.search_scripts(
            project_id=project_id,
            query=query,
            limit=limit
        )
        
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error searching scripts: {str(e)}")

@scripts_router.get("/load/{script_id}", response_model=Dict[str, Any])
async def load_existing_script(
    script_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Load an existing script. Returns only content, parsing is done client-side.
    """
    try:
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this script")
        
        # Return content without parsing
        return {
            "script_id": script_id,
            "filename": script["filename"],
            "content": script["content"]
            # "tree": ... # Removed
        }
            
    except ResourceNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading script: {str(e)}")
