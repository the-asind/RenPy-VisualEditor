import logging
from typing import Dict, Set, List, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
import json
import asyncio
import time
from contextlib import suppress
from datetime import datetime, timedelta

from .observability.metrics import (
    observe_ws_broadcast,
    observe_ws_json_message,
    observe_ws_message,
    observe_ws_project_connection,
    observe_ws_project_disconnect,
)
from ..security import (
    MAX_WS_BINARY_UPDATE_BYTES,
    MAX_WS_CONNECTIONS_PER_PROJECT,
    MAX_WS_CONNECTIONS_PER_USER,
)

logger = logging.getLogger(__name__)


class WebSocketConnectionLimitError(RuntimeError):
    def __init__(self, scope: str, limit: int):
        self.scope = scope
        self.limit = limit
        super().__init__(f"WebSocket {scope} connection limit exceeded (limit: {limit})")


class ConnectionManager:
    """Manages WebSocket connections for real-time collaboration."""
    
    def __init__(
        self,
        *,
        max_connections_per_user: int = MAX_WS_CONNECTIONS_PER_USER,
        max_connections_per_project: int = MAX_WS_CONNECTIONS_PER_PROJECT,
    ):
        # Map project_id -> set of WebSocket connections
        self.project_connections: Dict[str, Set[WebSocket]] = {}
        # Map script_id -> set of WebSocket connections
        self.script_connections: Dict[str, Set[WebSocket]] = {}
        # User sessions: user_id -> {project_id, script_id, ws}
        self.user_sessions: Dict[str, Dict[str, Any]] = {}
        # Authoritative per-socket session records. A user may have several tabs/projects.
        self.websocket_sessions: Dict[WebSocket, Dict[str, Any]] = {}
        # Node locks: script_id -> {node_id -> {user_id, lock_time, expires_at}}
        self.node_locks: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # Lock timeout in minutes
        self.lock_timeout = 5
        self.max_connections_per_user = max_connections_per_user
        self.max_connections_per_project = max_connections_per_project

    def _ensure_project_connection_capacity(self, project_id: str, user_id: str) -> None:
        user_connection_count = sum(
            1
            for session in self.websocket_sessions.values()
            if session.get("user_id") == user_id
        )
        if user_connection_count >= self.max_connections_per_user:
            raise WebSocketConnectionLimitError("user", self.max_connections_per_user)

        project_connection_count = len(self.project_connections.get(project_id, set()))
        if project_connection_count >= self.max_connections_per_project:
            raise WebSocketConnectionLimitError("project", self.max_connections_per_project)

    async def broadcast_project_active_users(self, project_id: str):
        """Broadcast the list of active users for a project."""
        active_users = self.get_project_active_users(project_id)
        await self.broadcast_to_project(
            project_id,
            {"type": "active_users", "users": active_users}
        )

    def get_script_active_users(self, script_id: str) -> List[Dict[str, Any]]:
        """Return users currently editing a specific script."""
        users = []
        for uid, session in self.user_sessions.items():
            if session.get("script_id") == script_id:
                users.append({
                    "id": uid,
                    "username": session.get("username", "Unknown"),
                    "connected_at": session.get("connected_at"),
                })
        return users

    async def broadcast_script_active_users(self, script_id: str):
        """Broadcast list of users editing a script."""
        users = self.get_script_active_users(script_id)
        await self.broadcast_to_script(
            script_id,
            {"type": "active_users", "users": users}
        )
    async def connect_project(
        self,
        websocket: WebSocket,
        project_id: str,
        user_id: str,
        username: str,
        *,
        accepted: bool = False,
        can_read=None,
    ):
        """Connect to project updates."""
        self._ensure_project_connection_capacity(project_id, user_id)
        if not accepted:
            await websocket.accept()
            self._ensure_project_connection_capacity(project_id, user_id)

        if project_id not in self.project_connections:
            self.project_connections[project_id] = set()

        self.project_connections[project_id].add(websocket)

        # Keep every socket authoritative while preserving the legacy last-session lookup.
        session = {
            "user_id": user_id,
            "project_id": project_id,
            "ws": websocket,
            "username": username,
            "can_read": can_read,
            "connected_at": datetime.now().isoformat()
        }
        self.websocket_sessions[websocket] = session
        self.user_sessions[user_id] = session

        # Broadcast updated list of active users to everyone
        await self.broadcast_project_active_users(project_id)

        observe_ws_project_connection(
            result="success",
            current_connections=self._project_connection_total(),
            current_rooms=self._project_room_count(),
        )
        logger.info(f"User {username} ({user_id}) connected to project {project_id}")
    
    async def connect_script(
        self,
        websocket: WebSocket,
        script_id: str,
        user_id: str,
        username: str,
        *,
        accepted: bool = False,
    ):
        """Connect to script editing."""
        if not accepted:
            await websocket.accept()
        
        if script_id not in self.script_connections:
            self.script_connections[script_id] = set()
        
        self.script_connections[script_id].add(websocket)
        
        # Track this socket independently from any other tab owned by the same user.
        session = self.websocket_sessions.get(websocket)
        if session is None:
            session = {
                "user_id": user_id,
                "script_id": script_id,
                "ws": websocket,
                "username": username,
                "connected_at": datetime.now().isoformat()
            }
            self.websocket_sessions[websocket] = session
        else:
            session.update({
                "user_id": user_id,
                "script_id": script_id,
                "ws": websocket,
                "username": username,
            })
        self.user_sessions[user_id] = session
        
        # Notify others that a user joined the script
        await self.broadcast_to_script(
            script_id,
            {
                "type": "user_joined_script",
                "user_id": user_id,
                "username": username,
                "timestamp": datetime.now().isoformat()
            },
            exclude_websocket=websocket
        )
        
        logger.info(f"User {username} ({user_id}) connected to script {script_id}")
        
        # Send active node locks to the newly connected client
        script_locks = self.get_script_locks(script_id)
        await self.send_personal_message(
            {
                "type": "node_locks",
                "locks": script_locks
            },
            websocket
        )

        # Broadcast list of active users editing this script
        await self.broadcast_script_active_users(script_id)
    
    async def lock_node(self, script_id: str, node_id: str, user_id: str, username: str) -> bool:
        """Try to acquire a lock on a node. Returns success status."""
        now = datetime.now()
        
        # Initialize locks dictionary for this script if it doesn't exist
        if script_id not in self.node_locks:
            self.node_locks[script_id] = {}
        
        # Check if node is already locked by another user
        if node_id in self.node_locks[script_id]:
            lock_info = self.node_locks[script_id][node_id]
            
            # Check if lock has expired
            if "expires_at" in lock_info and lock_info["expires_at"] < now:
                # Lock has expired, allow this user to take it
                pass  # Continue to acquire lock below
            # If lock is held by someone else and hasn't expired, deny the request
            elif lock_info["user_id"] != user_id:
                return False
        
        # Add or update lock with expiration time
        self.node_locks[script_id][node_id] = {
            "user_id": user_id,
            "username": username,
            "locked_at": now.isoformat(),
            "expires_at": now + timedelta(minutes=self.lock_timeout)
        }
        
        # Notify all users about the lock
        await self.broadcast_to_script(
            script_id,
            {
                "type": "node_locked",
                "node_id": node_id,
                "user_id": user_id,
                "username": username,
                "timestamp": now.isoformat()
            }
        )
        
        return True
    
    async def release_node_lock(self, script_id: str, node_id: str, user_id: str, username: str) -> bool:
        """Release a lock on a node. Returns success status."""
        if (script_id not in self.node_locks or 
            node_id not in self.node_locks[script_id]):
            return False
        
        lock_info = self.node_locks[script_id][node_id]
        if lock_info["user_id"] != user_id:
            return False
        
        # Remove lock
        del self.node_locks[script_id][node_id]
        
        # Notify all users about the lock release
        await self.broadcast_to_script(
            script_id,
            {
                "type": "node_unlocked",
                "node_id": node_id,
                "user_id": user_id,
                "username": username,
                "timestamp": datetime.now().isoformat()
            }
        )
        
        return True
    
    async def notify_edit(self, script_id: str, node_id: str, user_id: str, username: str):
        """Notify others that a node is being edited."""
        await self.broadcast_to_script(
            script_id,
            {
                "type": "node_editing",
                "node_id": node_id,
                "user_id": user_id,
                "username": username,
                "timestamp": datetime.now().isoformat()
            },
            exclude_user=user_id
        )
    
    async def notify_edit_end(self, script_id: str, node_id: str, user_id: str):
        """Notify others that a user stopped editing a node."""
        username = self.user_sessions.get(user_id, {}).get("username", "Unknown")
        await self.broadcast_to_script(
            script_id,
            {
                "type": "node_editing_ended",
                "node_id": node_id,
                "user_id": user_id,
                "username": username,
                "timestamp": datetime.now().isoformat()
            },
            exclude_user=user_id
        )
    
    async def broadcast_node_update(self, script_id: str, node_id: str, user_id: str, username: str, 
                                    content: str, start_line: int, end_line: int):
        """Broadcast a node update to all connected clients."""
        await self.broadcast_to_script(
            script_id,
            {
                "type": "updateNode",
                "script_id": script_id,
                "node_id": node_id,
                "user_id": user_id,
                "username": username,
                "content": content,
                "start_line": start_line,
                "end_line": end_line,
                "timestamp": datetime.now().isoformat()
            }
        )
    
    async def broadcast_node_insert(self, script_id: str, user_id: str, username: str, 
                                    insertion_line: int, content: str, node_type: str):
        """Broadcast a node insertion to all connected clients."""
        await self.broadcast_to_script(
            script_id,
            {
                "type": "insertNode",
                "script_id": script_id,
                "user_id": user_id,
                "username": username,
                "insertion_line": insertion_line,
                "content": content,
                "node_type": node_type,
                "timestamp": datetime.now().isoformat()
            }
        )
    
    async def broadcast_structure_update(self, script_id: str, tree: Dict[str, Any]):
        """Broadcast a structure update to all connected clients."""
        await self.broadcast_to_script(
            script_id,
            {
                "type": "updateStructure",
                "script_id": script_id,
                "tree": tree,
                "timestamp": datetime.now().isoformat()
            }
        )
    
    async def handle_client_message(self, websocket: WebSocket, message_text: str):
        """Handle a message from a client."""
        try:
            message = json.loads(message_text)
            message_type = message.get("type", "")
            
            if message_type == "join":
                script_id = message.get("scriptId")
                user_id = message.get("userId")
                username = message.get("userName")
                await self.connect_script(websocket, script_id, user_id, username)
                
            elif message_type == "leave":
                user_id = message.get("userId")
                await self.disconnect(websocket, user_id)
                
            elif message_type == "startEditing":
                script_id = message.get("scriptId")
                user_id = message.get("userId")
                node_id = message.get("nodeId")
                username = self.user_sessions.get(user_id, {}).get("username", "Unknown")
                
                # Try to acquire lock
                success = await self.lock_node(script_id, node_id, user_id, username)
                
                if success:
                    # Notify others that this user is editing
                    await self.notify_edit(script_id, node_id, user_id, username)
                else:
                    # Send conflict notification to the requester
                    lock_info = self.node_locks.get(script_id, {}).get(node_id, {})
                    locker_username = lock_info.get("username", "Unknown")
                    await self.send_personal_message(
                        {
                            "type": "editConflict",
                            "node_id": node_id,
                            "locked_by": locker_username,
                            "timestamp": datetime.now().isoformat()
                        },
                        websocket
                    )
            
            elif message_type == "endEditing":
                script_id = message.get("scriptId")
                user_id = message.get("userId")
                node_id = message.get("nodeId")
                username = self.user_sessions.get(user_id, {}).get("username", "Unknown")
                
                # Release lock
                success = await self.release_node_lock(script_id, node_id, user_id, username)
                
                if success:
                    # Notify others that this user stopped editing
                    await self.notify_edit_end(script_id, node_id, user_id)
            
            elif message_type == "updateNode":
                script_id = message.get("scriptId")
                user_id = message.get("userId")
                node_id = message.get("nodeId")
                content = message.get("content")
                start_line = message.get("startLine")
                end_line = message.get("endLine")
                username = self.user_sessions.get(user_id, {}).get("username", "Unknown")
                
                # Broadcast update
                await self.broadcast_node_update(
                    script_id, node_id, user_id, username, content, start_line, end_line
                )
            
            elif message_type == "insertNode":
                script_id = message.get("scriptId")
                user_id = message.get("userId")
                insertion_line = message.get("insertionLine")
                content = message.get("content")
                node_type = message.get("nodeType")
                username = self.user_sessions.get(user_id, {}).get("username", "Unknown")
                
                # Broadcast insert
                await self.broadcast_node_insert(
                    script_id, user_id, username, insertion_line, content, node_type
                )
            
            elif message_type == "updateStructure":
                script_id = message.get("scriptId")
                tree = message.get("tree")
                
                # Broadcast structure update
                await self.broadcast_structure_update(script_id, tree)
            
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON message: {message_text}")
        except Exception as e:
            logger.error(f"Error handling message: {str(e)}")
    
    async def notify_update(self, script_id: str, node_id: str, content: str, user_id: str, username: str):
        """Notify others that a node has been updated."""
        await self.broadcast_to_script(
            script_id,
            {
                "type": "node_updated",
                "node_id": node_id,
                "user_id": user_id,
                "username": username,
                "content": content,
                "timestamp": datetime.now().isoformat()
            },
            exclude_user=user_id
        )
    
    async def send_personal_message(self, message: Dict[str, Any], websocket: WebSocket):
        """Send a message to a specific WebSocket connection."""
        try:
            await websocket.send_text(json.dumps(message))
            observe_ws_message(frame_type="text", direction="outgoing", result="success")
            observe_ws_json_message(
                message_type=str(message.get("type", "unknown")),
                direction="outgoing",
                result="success",
            )
        except Exception as e:
            observe_ws_message(frame_type="text", direction="outgoing", result="broadcast_error")
            observe_ws_json_message(
                message_type=str(message.get("type", "unknown")),
                direction="outgoing",
                result="broadcast_error",
            )
            logger.error(f"Error sending personal message: {str(e)}")

    async def handle_project_crdt_update(self, websocket: WebSocket, project_id: str, update: bytes):
        """Relay an opaque binary CRDT update to peers in the same project room."""
        if len(update) > MAX_WS_BINARY_UPDATE_BYTES:
            observe_ws_message(
                frame_type="binary",
                direction="incoming",
                result="too_large",
                payload_bytes=len(update),
            )
            await self.send_personal_message(
                {"type": "error", "message": "Project CRDT update is too large"},
                websocket,
            )
            return

        observe_ws_message(
            frame_type="binary",
            direction="incoming",
            result="success",
            payload_bytes=len(update),
        )
        await self.broadcast_project_bytes(
            project_id=project_id,
            payload=update,
            exclude_websocket=None,
        )

    async def _allow_project_delivery(self, websocket):
        session = self.websocket_sessions.get(websocket, {})
        check = session.get('can_read')
        if check is None or check():
            return True
        await self.disconnect(websocket, session['user_id'])
        with suppress(Exception):
            await asyncio.wait_for(websocket.close(code=4003, reason='Project access revoked'), 2)
        return False

    async def _deliver_project_frame(self, connection, payload, binary):
        try:
            if not await self._allow_project_delivery(connection):
                return False
            send = connection.send_bytes(payload) if binary else connection.send_text(payload)
            await asyncio.wait_for(send, 2)
            observe_ws_message(frame_type="binary" if binary else "text", direction="outgoing", result="success",
                               payload_bytes=len(payload) if binary else None)
            return True
        except Exception:
            session = self.websocket_sessions.get(connection)
            if session:
                await self.disconnect(connection, session['user_id'])
            with suppress(Exception):
                await asyncio.wait_for(connection.close(code=1013, reason='Slow or disconnected reader'), 2)
            return False

    async def broadcast_project_bytes(self, project_id, payload, exclude_websocket=None):
        start = time.perf_counter()
        peers = [c for c in list(self.project_connections.get(project_id, ())) if c != exclude_websocket]
        results = await asyncio.gather(*(self._deliver_project_frame(c, payload, True) for c in peers))
        observe_ws_broadcast(frame_type="binary", result=("no_room" if not peers else "success" if all(results) else "broadcast_error"),
                             duration_seconds=time.perf_counter() - start)

    async def broadcast_to_project(self, project_id, message, exclude_websocket=None, exclude_user=None):
        start = time.perf_counter()
        peers = [c for c in list(self.project_connections.get(project_id, ()))
                 if c != exclude_websocket and not (
                     exclude_user and self.websocket_sessions.get(c, {}).get('user_id') == exclude_user)]
        payload = json.dumps(message)
        results = await asyncio.gather(*(self._deliver_project_frame(c, payload, False) for c in peers))
        observe_ws_json_message(message_type=str(message.get("type", "unknown")), direction="outgoing",
                                result="success" if all(results) else "broadcast_error")
        observe_ws_broadcast(frame_type="text", result=("no_room" if not peers else "success" if all(results) else "broadcast_error"),
                             duration_seconds=time.perf_counter() - start)

    async def broadcast_to_script(
        self, 
        script_id: str, 
        message: Dict[str, Any], 
        exclude_websocket: Optional[WebSocket] = None,
        exclude_user: Optional[str] = None
    ):
        """Broadcast a message to all connections editing a script."""
        if script_id not in self.script_connections:
            return
        
        # Find websocket for excluded user if needed
        excluded_websockets = {
            connection
            for connection, session in self.websocket_sessions.items()
            if exclude_user and session.get("user_id") == exclude_user
        }
        if exclude_user and not excluded_websockets and exclude_user in self.user_sessions:
            excluded_websockets.add(self.user_sessions[exclude_user].get("ws"))
        
        connections = self.script_connections[script_id]
        for connection in connections:
            if connection != exclude_websocket and connection not in excluded_websockets:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error broadcasting to script: {str(e)}")
    
    def get_project_active_users(self, project_id: str) -> List[Dict[str, Any]]:
        """Get list of active users in a project."""
        sessions_by_user: Dict[str, Dict[str, Any]] = {}
        for session in self.websocket_sessions.values():
            if session.get("project_id") == project_id:
                sessions_by_user.setdefault(session["user_id"], session)
        if not sessions_by_user:
            sessions_by_user = {
                user_id: session
                for user_id, session in self.user_sessions.items()
                if session.get("project_id") == project_id
            }
        return [
                {
                    "id": user_id,
                    "username": session.get("username", "Unknown"),
                    "connected_at": session.get("connected_at"),
                    "editing_script": session.get("script_id")
                }
                for user_id, session in sessions_by_user.items()
            ]

    def _project_connection_total(self) -> int:
        return sum(len(connections) for connections in self.project_connections.values())

    def _project_room_count(self) -> int:
        return sum(1 for connections in self.project_connections.values() if connections)
    
    def get_script_locks(self, script_id: str) -> List[Dict[str, Any]]:
        """Get list of locked nodes in a script."""
        locks = []
        if script_id in self.node_locks:
            for node_id, lock_info in self.node_locks[script_id].items():
                locks.append({
                    "node_id": node_id,
                    "user_id": lock_info.get("user_id"),
                    "username": lock_info.get("username"),
                    "locked_at": lock_info.get("locked_at")
                })
        return locks
    
    async def disconnect(
        self,
        websocket: WebSocket,
        user_id: Optional[str] = None,
        reason: str = "client_disconnect",
    ):
        """Disconnect websocket from all connections."""
        session = self.websocket_sessions.pop(websocket, None)
        if session:
            user_id = session.get("user_id") or user_id
        # Fall back to legacy session records used by the script collaboration path/tests.
        if session is None and not user_id:
            for uid, session in self.user_sessions.items():
                if session.get("ws") == websocket:
                    user_id = uid
                    break
        
        if user_id and user_id in self.user_sessions:
            session = session or self.user_sessions[user_id]
            project_id = session.get("project_id")
            script_id = session.get("script_id")
            username = session.get("username", "Unknown")
            
            # Remove from project connections
            if project_id and project_id in self.project_connections:
                if websocket in self.project_connections[project_id]:
                    self.project_connections[project_id].remove(websocket)
                    user_still_in_project = any(
                        remaining.get("user_id") == user_id and remaining.get("project_id") == project_id
                        for remaining in self.websocket_sessions.values()
                    )
                    if not user_still_in_project:
                        await self.broadcast_to_project(
                            project_id,
                            {
                                "type": "user_left_project",
                                "user_id": user_id,
                                "username": username,
                                "timestamp": datetime.now().isoformat()
                            }
                        )
            
            # Remove from script connections
            if script_id and script_id in self.script_connections:
                if websocket in self.script_connections[script_id]:
                    self.script_connections[script_id].remove(websocket)
                    user_still_in_script = any(
                        remaining.get("user_id") == user_id and remaining.get("script_id") == script_id
                        for remaining in self.websocket_sessions.values()
                    )
                    if not user_still_in_script:
                        await self.broadcast_to_script(
                            script_id,
                            {
                                "type": "user_left_script",
                                "user_id": user_id,
                                "username": username,
                                "timestamp": datetime.now().isoformat()
                            }
                        )
            
            # Release node locks held by the user
            if script_id and script_id in self.node_locks and not any(
                remaining.get("user_id") == user_id and remaining.get("script_id") == script_id
                for remaining in self.websocket_sessions.values()
            ):
                released_nodes = []
                for node_id, lock_info in list(self.node_locks[script_id].items()):
                    if lock_info.get("user_id") == user_id:
                        released_nodes.append(node_id)
                        del self.node_locks[script_id][node_id]
                
                if released_nodes:
                    await self.broadcast_to_script(
                        script_id,
                        {
                            "type": "locks_released",
                            "nodes": released_nodes,
                            "user_id": user_id,
                            "username": username,
                            "timestamp": datetime.now().isoformat()
                        }
                    )
            
            # Preserve another tab as the user's compatibility lookup when one exists.
            if self.user_sessions[user_id].get("ws") == websocket:
                replacement = next(
                    (
                        remaining
                        for remaining in reversed(list(self.websocket_sessions.values()))
                        if remaining.get("user_id") == user_id
                    ),
                    None,
                )
                if replacement:
                    self.user_sessions[user_id] = replacement
                else:
                    del self.user_sessions[user_id]

            if project_id:
                await self.broadcast_project_active_users(project_id)
            if script_id:
                await self.broadcast_script_active_users(script_id)
            if project_id:
                observe_ws_project_disconnect(
                    reason=reason,
                    current_connections=self._project_connection_total(),
                    current_rooms=self._project_room_count(),
                )
        
        logger.info(f"User {user_id if user_id else 'Unknown'} disconnected")

# Create a global instance
connection_manager = ConnectionManager()

# TODO: Implement periodic cleanup of stale locks - #issue/126
