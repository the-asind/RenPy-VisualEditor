from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Dict, Any, Optional
from ...services.database import DatabaseService
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