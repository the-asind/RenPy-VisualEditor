from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
import asyncio
from time import monotonic

from ...security import MAX_WS_MESSAGES_PER_WINDOW, MAX_WS_BYTES_PER_WINDOW, WS_RATE_WINDOW_SECONDS

from ...services.websocket import connection_manager, WebSocketConnectionLimitError
from ...services.database import DatabaseService
from ...services.observability.metrics import observe_ws_json_message, observe_ws_message
from ..routes.auth import auth_service

logger = logging.getLogger(__name__)

ws_router = APIRouter(
    prefix="/ws",
    tags=["websockets"],
    responses={404: {"description": "Not found"}}
)

db_service = DatabaseService()
PROJECT_ADMIN_ROLES = {"Owner", "Admin"}
PROJECT_EDITOR_ROLES = {"Owner", "Admin", "Editor"}
AUTH_FRAME_TIMEOUT_SECONDS = 10
MAX_PROJECT_WS_TEXT_BYTES = 16 * 1024


async def _receive_websocket_auth_token(websocket: WebSocket) -> str:
    event = await asyncio.wait_for(websocket.receive(), timeout=AUTH_FRAME_TIMEOUT_SECONDS)
    if event["type"] == "websocket.disconnect":
        raise WebSocketDisconnect
    data = event.get("text")
    if not data or len(data.encode("utf-8")) > MAX_PROJECT_WS_TEXT_BYTES:
        raise ValueError("Project WebSocket auth frame is required")
    try:
        message = json.loads(data)
    except json.JSONDecodeError as exc:
        raise ValueError("Project WebSocket auth frame must be JSON") from exc
    if not isinstance(message, dict) or message.get("type") != "auth" or not isinstance(message.get("token"), str):
        raise ValueError("Project WebSocket auth frame is required")
    return message["token"]

@ws_router.websocket("/project/{project_id}")
async def project_websocket(
    websocket: WebSocket,
    project_id: str,
):
    """WebSocket connection for project-level events."""
    # Authenticate user
    try:
        await websocket.accept()
        token = await _receive_websocket_auth_token(websocket)
        user_id = auth_service.validate_session_token(token, project_id)
        if not user_id:
            raise ValueError("Invalid project session token")

        current_user = db_service.get_user_by_id(user_id)
        if not current_user:
            raise ValueError("Session token user not found")
        
        # Check if user has access to this project
        user_projects = db_service.get_user_projects(current_user["id"])
        current_project = next((p for p in user_projects if p["id"] == project_id), None)
        
        if not current_project:
            await websocket.close(code=4003, reason="Permission denied for this project")
            return
        
        # Connect to project
        await connection_manager.connect_project(
            websocket=websocket,
            project_id=project_id,
            user_id=current_user["id"],
            username=current_user["username"],
            accepted=True,
            can_read=lambda: any(p['id'] == project_id for p in db_service.get_user_projects(user_id)),
        )
        
        try:
            # Main message loop
            window_started = monotonic()
            window_messages = 0
            window_bytes = 0
            while True:
                # Recheck idle readers too; incoming edits never use cached roles.
                try:
                    event = await asyncio.wait_for(websocket.receive(), 15)
                except asyncio.TimeoutError:
                    event = None
                current_project = next((p for p in db_service.get_user_projects(user_id) if p['id'] == project_id), None)
                if current_project is None:
                    await websocket.close(code=4003, reason='Project access revoked')
                    break
                if event is None:
                    continue
                if event["type"] == "websocket.disconnect":
                    raise WebSocketDisconnect

                text = event.get("text")
                frame_bytes = len(event.get("bytes") or b"")
                if text is not None:
                    frame_bytes = len(text.encode("utf-8"))
                    if frame_bytes > MAX_PROJECT_WS_TEXT_BYTES:
                        await websocket.close(code=1009, reason="Text frame too large")
                        break
                now = monotonic()
                if now - window_started >= WS_RATE_WINDOW_SECONDS:
                    window_started, window_messages, window_bytes = now, 0, 0
                window_messages += 1
                window_bytes += frame_bytes
                if window_messages > MAX_WS_MESSAGES_PER_WINDOW or window_bytes > MAX_WS_BYTES_PER_WINDOW:
                    await websocket.close(code=4429, reason="WebSocket traffic limit exceeded")
                    break

                binary_update = event.get("bytes")
                if binary_update is not None:
                    if current_project.get("role") not in PROJECT_EDITOR_ROLES:
                        await connection_manager.send_personal_message(
                            {"type": "error", "message": "You don't have permission to edit this project"},
                            websocket,
                        )
                        continue
                    await connection_manager.handle_project_crdt_update(
                        websocket=websocket,
                        project_id=project_id,
                        update=binary_update
                    )
                    continue

                data = event.get("text")
                if data is None:
                    continue

                try:
                    message = json.loads(data)
                    if not isinstance(message, dict):
                        continue
                    message_type = message.get("type", "")
                    observe_ws_message(frame_type="text", direction="incoming", result="success")
                    observe_ws_json_message(message_type=message_type, direction="incoming", result="success")
                    
                    # Handle different message types
                    if message_type == "ping":
                        await connection_manager.send_personal_message({"type": "pong"}, websocket)

                    elif message_type == "cursor_update":
                        x = message.get("x")
                        y = message.get("y")
                        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                            continue

                        activity = message.get("activity", "viewing_canvas")
                        if activity == "viewing canvas":
                            activity = "viewing_canvas"
                        if activity not in {"viewing_canvas", "editing_action", "editing_source_file"}:
                            activity = "viewing_canvas"
                        target_node_id = message.get("targetNodeId")
                        if not isinstance(target_node_id, str) or not target_node_id or len(target_node_id) > 256:
                            target_node_id = None
                        if activity == "viewing_canvas":
                            target_node_id = None

                        await connection_manager.broadcast_to_project(
                            project_id,
                            {
                                "type": "cursor_update",
                                "userId": current_user["id"],
                                "userName": current_user["username"],
                                "x": x,
                                "y": y,
                                "activity": activity,
                                **({"targetNodeId": target_node_id} if target_node_id else {}),
                            },
                            exclude_websocket=websocket,
                        )
                    
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

                        if current_project.get("role") not in PROJECT_ADMIN_ROLES:
                            await connection_manager.send_personal_message(
                                {"type": "error", "message": "You don't have permission to manage this project"},
                                websocket,
                            )
                            continue
                        
                        # Grant access in database
                        try:
                            role_info = db_service.get_role_by_id(role_id)
                            if not role_info:
                                await connection_manager.send_personal_message(
                                    {"type": "error", "message": "Invalid share role"},
                                    websocket,
                                )
                                continue
                            target_user = db_service.get_user_by_id(target_user_id)
                            if not target_user:
                                await connection_manager.send_personal_message(
                                    {"type": "error", "message": "Share target user not found"},
                                    websocket,
                                )
                                continue
                            db_service.grant_project_access(project_id, target_user_id, role_id)
                            
                            # Notify all connected users
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
                    observe_ws_message(frame_type="text", direction="incoming", result="invalid_json")
                    observe_ws_json_message(
                        message_type="invalid_json",
                        direction="incoming",
                        result="invalid_json",
                    )
                    logger.warning("Invalid JSON received on project WebSocket")
                    continue
                
        except WebSocketDisconnect:
            pass
        finally:
            await connection_manager.disconnect(websocket, current_user["id"])
            
    except WebSocketConnectionLimitError as exc:
        logger.warning(str(exc))
        await websocket.close(code=4429, reason="Too many WebSocket connections")
    except Exception as e:
        logger.error(f"Authentication error: {str(e)}")
        await websocket.close(code=4001, reason="Authentication failed")
