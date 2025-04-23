from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from ...services.database import DatabaseService
from ...api.routes.auth import get_current_user
import uuid

projects_router = APIRouter()
db_service = DatabaseService()

@projects_router.post("/")
async def create_project(
    name: str = Body(...), 
    description: str = Body(None),
    user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new project."""
    try:
        # Create project
        project_id = db_service.create_project(name, user["id"])
        
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

@projects_router.post("/{project_id}/share")
async def share_project(
    project_id: str,
    user_id: str = Body(...),
    role: str = Body(...),
    current_user: Dict = Depends(get_current_user)
) -> Dict[str, str]:
    """Share a project with another user."""
    # TODO: Implement access control check
    try:
        db_service.grant_project_access(project_id, user_id, role)
        return {"status": "success", "message": f"Project shared with user {user_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to share project: {str(e)}")

@projects_router.post("/{project_id}/scripts")
async def create_script(
    project_id: str,
    filename: str = Body(...),
    content: str = Body(...),
    user: Dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """Create a new script in a project."""
    # TODO: Implement access control check
    try:
        script_id = db_service.save_script(project_id, filename, content)
        return {
            "id": script_id,
            "filename": filename,
            "project_id": project_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create script: {str(e)}")
