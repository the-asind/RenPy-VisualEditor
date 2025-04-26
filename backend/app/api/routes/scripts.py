from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Body, Depends
from fastapi.responses import JSONResponse
import os
import tempfile
import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, List
import uuid

from ...services.parser.renpy_parser import RenPyParser, ChoiceNode, ChoiceNodeType
from ...services.database import DatabaseService
from ...models.exceptions import ResourceNotFoundException, DatabaseException
from ..routes.auth import get_current_user, oauth2_scheme

# Create router
scripts_router = APIRouter(
    prefix="/scripts",
    tags=["scripts"],
    responses={404: {"description": "Not found"}},
)

# Initialize services
db_service = DatabaseService()
parser = RenPyParser()

# Helper functions
def node_to_dict(node: ChoiceNode) -> Dict[str, Any]:
    """Convert a ChoiceNode to a dictionary with line references for JSON serialization."""
    result = {
        "id": str(id(node)),  # Generate a unique ID using the object's memory address
        "node_type": node.node_type.value if hasattr(node.node_type, "value") else str(node.node_type),
        "label_name": node.label_name,
        "start_line": node.start_line,
        "end_line": node.end_line,
        "children": [node_to_dict(child) for child in node.children]
    }
    
    if hasattr(node, "false_branch") and node.false_branch:
        result["false_branch"] = [node_to_dict(opt) for opt in node.false_branch]
    
    return result

# Routes
@scripts_router.post("/parse", response_model=Dict[str, Any])
async def parse_script(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...),
    project_id: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Parse a RenPy script file and return its tree structure with line references.
    
    Args:
        file: The uploaded RenPy script file
        project_id: Optional ID of the project to associate the script with
        
    Returns:
        JSON representation of the parsed script tree with line references
    """
    try:
        # current_user now injected via Depends
        
        if not file.filename.lower().endswith(".rpy"):
            raise HTTPException(status_code=400, detail="Invalid file type. Only .rpy files are allowed.")
            
        # Read file content
        file_size = 0
        content = await file.read()
        file_size = len(content)
        
        if file_size > 1024 * 1024:  # 1MB limit
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 1MB.")
        
        # Get project ID (either from request or find/create default)
        if not project_id:
            # Try to get user's default project
            user_projects = db_service.get_user_projects(current_user["id"])
            default_projects = [p for p in user_projects if p["name"] == "Default Project"]
            
            if default_projects:
                # Use existing default project
                project_id = default_projects[0]["id"]
            else:
                # Create a new default project
                project_id = db_service.create_project("Default Project", current_user["id"])
        else:
            # Verify user has access to the specified project
            user_projects = db_service.get_user_projects(current_user["id"])
            has_access = any(p["id"] == project_id for p in user_projects)
            
            if not has_access:
                raise HTTPException(status_code=403, detail="Access denied to the specified project")
        
        # Parse the content to check validity
        temp_dir = Path(tempfile.gettempdir()) / "renpy_editor" / str(uuid.uuid4())
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        temp_file = temp_dir / file.filename
        with open(temp_file, "wb") as f:
            f.write(content)
        
        # Parse the file to build the tree
        parsed_tree = await parser.parse_async(str(temp_file))
        
        # Save to database
        script_id = db_service.save_script(
            project_id=project_id,
            filename=file.filename,
            content=content.decode('utf-8'),
            user_id=current_user["id"]
        )
        
        # Clean up temp file
        background_tasks.add_task(shutil.rmtree, temp_dir, ignore_errors=True)
        
        # Return result
        result = {
            "script_id": script_id,
            "filename": file.filename,
            "tree": node_to_dict(parsed_tree)
        }
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing script: {str(e)}")

@scripts_router.get("/node-content/{script_id}", response_model=Dict[str, Any])
async def get_node_content(
    script_id: str, 
    start_line: int, 
    end_line: int,
    token: str = Depends(oauth2_scheme)
) -> Dict[str, Any]:
    """
    Get the content of a specific node by line range.
    
    Args:
        script_id: The ID of the script
        start_line: Starting line number (0-indexed)
        end_line: Ending line number (0-indexed)
        
    Returns:
        Node content
    """
    try:
        current_user = await get_current_user(token)
        
        # Get script from database
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        # Validate user has access to the script's project
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this script")
        
        content_lines = script["content_lines"]
        
        # Validate line range
        if start_line < 0 or end_line >= len(content_lines) or start_line > end_line:
            raise HTTPException(status_code=400, detail="Invalid line range")
        
        # Extract the content
        node_content = content_lines[start_line:end_line + 1]
        
        return {
            "content": "\n".join(node_content),
            "start_line": start_line,
            "end_line": end_line
        }
    except ResourceNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving node content: {str(e)}")

@scripts_router.post("/update-node/{script_id}", response_model=Dict[str, Any])
async def update_node_content(
    script_id: str, 
    start_line: int, 
    end_line: int, 
    content: str = Body(..., embed=True),
    token: str = Depends(oauth2_scheme)
) -> Dict[str, Any]:
    """
    Update the content of a specific node.
    
    Args:
        script_id: The ID of the script
        start_line: Starting line number (0-indexed)
        end_line: Ending line number (0-indexed)
        content: New content for the node
        
    Returns:
        Updated line range
    """
    try:
        current_user = await get_current_user(token)
        
        # Get script from database
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        # Validate user has access to the script's project
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this script")
        
        # Get current content
        content_lines = script["content_lines"]
        
        # Validate line range
        if start_line < 0 or end_line >= len(content_lines) or start_line > end_line:
            raise HTTPException(status_code=400, detail="Invalid line range")
        
        # Calculate line differences
        old_line_count = end_line - start_line + 1
        new_content_lines = content.splitlines()
        new_line_count = len(new_content_lines)
        line_diff = new_line_count - old_line_count
        
        # Update the content
        content_lines[start_line:end_line+1] = new_content_lines
        new_content = "\n".join(content_lines)
        
        # Save changes to database
        db_service.update_script(script_id, new_content, current_user["id"])
        
        # Calculate new end line
        new_end_line = start_line + new_line_count - 1
        
        return {
            "start_line": start_line,
            "end_line": new_end_line,
            "line_diff": line_diff
        }
    except ResourceNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating node content: {str(e)}")

@scripts_router.post("/insert-node/{script_id}", response_model=Dict[str, Any])
async def insert_node(
    script_id: str, 
    insertion_line: int, 
    content: str = Body(..., embed=True),
    node_type: str = Body(..., embed=True),
    token: str = Depends(oauth2_scheme)
) -> Dict[str, Any]:
    """
    Insert a new node at the specified position.
    
    Args:
        script_id: The ID of the script
        insertion_line: The line where to insert the new node
        content: The content of the new node
        node_type: The type of node to insert
        
    Returns:
        Information about the inserted node
    """
    try:
        current_user = await get_current_user(token)
        
        # Get script from database
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        # Validate user has access to the script's project
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this script")
        
        # Get current content
        content_lines = script["content_lines"]
        
        # Validate insertion line
        if insertion_line < 0 or insertion_line > len(content_lines):
            raise HTTPException(status_code=400, detail="Invalid insertion line")
        
        # Parse the new content
        new_content_lines = content.splitlines()
        
        # Insert the new lines
        content_lines[insertion_line:insertion_line] = new_content_lines
        new_content = "\n".join(content_lines)
        
        # Save changes to database
        db_service.update_script(script_id, new_content, current_user["id"])
        
        # Re-parse the entire script to update the tree
        # Create temp file for parsing
        temp_dir = Path(tempfile.gettempdir()) / "renpy_editor" / str(uuid.uuid4())
        temp_dir.mkdir(parents=True, exist_ok=True)
        temp_file = temp_dir / "temp_script.rpy"
        
        with open(temp_file, "w", encoding="utf-8") as f:
            f.write(new_content)
        
        # Parse the updated file
        parsed_tree = await parser.parse_async(str(temp_file))
        
        # Clean up temp file
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        return {
            "start_line": insertion_line,
            "end_line": insertion_line + len(new_content_lines) - 1,
            "line_count": len(new_content_lines),
            "tree": node_to_dict(parsed_tree)
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
) -> Dict[str, Any]:
    """
    Download the current version of the script.
    
    Args:
        script_id: The ID of the script
        
    Returns:
        The script file content
    """
    try:
        current_user = await get_current_user(token)
        
        # Get script from database
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        # Validate user has access to the script's project
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
    """
    Delete a script.
    
    Args:
        script_id: The ID of the script to delete
        
    Returns:
        Confirmation message
    """
    try:
        current_user = await get_current_user(token)
        
        # Get script from database
        script = db_service.get_script(script_id)
        if not script:
            raise ResourceNotFoundException("Script", script_id)
        
        # Validate user has access to the script's project
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id and p.get("role") in ["Owner", "Editor"] 
                        for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Permission denied to delete this script")
        
        # Delete from database
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
    """
    Get all scripts for a project.
    
    Args:
        project_id: The ID of the project
        
    Returns:
        List of scripts in the project
    """
    try:
        current_user = await get_current_user(token)
        
        # Validate user has access to the project
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            raise HTTPException(status_code=403, detail="Access denied to this project")
        
        # Get scripts from database
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
    """
    Search scripts by content or filename.
    
    Args:
        query: Search query
        project_id: Optional project ID to filter by
        limit: Maximum number of results
        
    Returns:
        List of matching scripts
    """
    try:
        current_user = await get_current_user(token)
        
        # If project ID specified, validate access
        if project_id:
            user_projects = db_service.get_user_projects(current_user["id"])
            has_access = any(p["id"] == project_id for p in user_projects)
            
            if not has_access:
                raise HTTPException(status_code=403, detail="Access denied to this project")
        
        # Search scripts
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

# TODO: Add endpoints for version history retrieval - #issue/129
