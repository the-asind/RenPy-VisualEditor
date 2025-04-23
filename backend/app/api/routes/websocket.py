from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Dict, Any, Optional
import json
import logging

from ...services.websocket import connection_manager
from ...services.database import DatabaseService
from ...models.exceptions import ResourceNotFoundException, PermissionDeniedException
from ..routes.auth import get_current_user

logger = logging.getLogger(__name__)

# Create router
ws_router = APIRouter(
    prefix="/ws",
    tags=["websockets"]
)

# Initialize database service
db_service = DatabaseService()

# Routes
@ws_router.websocket("/project/{project_id}")
async def project_websocket(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...)
):
    """WebSocket connection for project-level events."""
    # Authenticate user
    try:
        current_user = await get_current_user(token)
        
        # Check if user has access to this project
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            await websocket.close(code=4003, reason="Permission denied for this project")
            return
        
        # Connect to project
        await connection_manager.connect_project(
            websocket=websocket,
            project_id=project_id,
            user_id=current_user["id"],
            username=current_user["username"]
        )
        
        try:
            # Main message loop
            while True:
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    message_type = message.get("type", "")
                    
                    # Handle different message types
                    if message_type == "ping":
                        await connection_manager.send_personal_message({"type": "pong"}, websocket)
                    
                    elif message_type == "share_project":
                        # Process project sharing
                        target_user_id = message.get("target_user_id")
                        role_id = message.get("role_id")
                        
                        if not target_user_id or not role_id:
                            await connection_manager.send_personal_message(
                                {"type": "error", "message": "Invalid share request"},
                                websocket
                            )
                            continue
                        
                        # Grant access in database
                        try:
                            db_service.grant_project_access(project_id, target_user_id, role_id)
                            
                            # Notify all connected users
                            target_user = db_service.get_user_by_id(target_user_id)
                            await connection_manager.broadcast_to_project(
                                project_id,
                                {
                                    "type": "project_shared",
                                    "project_id": project_id,
                                    "user_id": target_user_id,
                                    "username": target_user.get("username", "Unknown"),
                                    "role_id": role_id,
                                    "shared_by": current_user["id"]
                                }
                            )
                            
                        except Exception as e:
                            await connection_manager.send_personal_message(
                                {"type": "error", "message": str(e)},
                                websocket
                            )
                    
                    # Add more message handlers as needed
                    
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received: {data}")
                    continue
                
        except WebSocketDisconnect:
            await connection_manager.disconnect(websocket, current_user["id"])
            
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        await websocket.close(code=4001, reason="Authentication failed")


@ws_router.websocket("/script/{script_id}")
async def script_websocket(
    websocket: WebSocket,
    script_id: str,
    token: str = Query(...)
):
    """WebSocket connection for script editing collaboration."""
    # Authenticate user
    try:
        current_user = await get_current_user(token)
        
        # Get script info
        script = db_service.get_script(script_id)
        if not script:
            await websocket.close(code=4004, reason="Script not found")
            return
        
        # Check if user has access to the project
        project_id = script["project_id"]
        user_projects = db_service.get_user_projects(current_user["id"])
        has_access = any(p["id"] == project_id for p in user_projects)
        
        if not has_access:
            await websocket.close(code=4003, reason="Permission denied for this script")
            return
        
        # Connect to script
        await connection_manager.connect_script(
            websocket=websocket,
            script_id=script_id,
            user_id=current_user["id"],
            username=current_user["username"]
        )
        
        # Record session in database
        session_id = db_service.create_editing_session(script_id)
        db_service.add_session_participant(session_id, current_user["id"])
        
        try:
            # Main message loop
            while True:
                data = await websocket.receive_text()
                try:
                    message = json.loads(data)
                    message_type = message.get("type", "")
                    
                    # Handle different message types
                    if message_type == "ping":
                        await connection_manager.send_personal_message({"type": "pong"}, websocket)
                    
                    elif message_type == "lock_node":
                        node_id = message.get("node_id")
                        if not node_id:
                            continue
                        
                        success = await connection_manager.lock_node(
                            script_id=script_id,
                            node_id=node_id,
                            user_id=current_user["id"],
                            username=current_user["username"]
                        )
                        
                        # Send result back to requester
                        await connection_manager.send_personal_message(
                            {
                                "type": "lock_result",
                                "node_id": node_id,
                                "success": success,
                                "timestamp": message.get("timestamp")
                            },
                            websocket
                        )
                    
                    elif message_type == "unlock_node":
                        node_id = message.get("node_id")
                        if not node_id:
                            continue
                        
                        success = await connection_manager.release_node_lock(
                            script_id=script_id,
                            node_id=node_id,
                            user_id=current_user["id"],
                            username=current_user["username"]
                        )
                    
                    elif message_type == "start_editing":
                        node_id = message.get("node_id")
                        if not node_id:
                            continue
                        
                        await connection_manager.notify_edit(
                            script_id=script_id,
                            node_id=node_id,
                            user_id=current_user["id"],
                            username=current_user["username"]
                        )
                    
                    elif message_type == "update_node":
                        node_id = message.get("node_id")
                        content = message.get("content")
                        
                        if not node_id or not content:
                            continue
                        
                        await connection_manager.notify_update(
                            script_id=script_id,
                            node_id=node_id,
                            content=content,
                            user_id=current_user["id"],
                            username=current_user["username"]
                        )
                    
                    # Additional message handlers
                    
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON received: {data}")
                    continue
                
        except WebSocketDisconnect:
            # End session in database
            db_service.end_session_for_participant(session_id, current_user["id"])
            # Disconnect WebSocket
            await connection_manager.disconnect(websocket, current_user["id"])
            
    except Exception as e:
        logger.error(f"Authentication error in script websocket: {str(e)}")
        await websocket.close(code=4001, reason="Authentication failed")

# TODO: Add endpoint for global editing notifications - #issue/127
