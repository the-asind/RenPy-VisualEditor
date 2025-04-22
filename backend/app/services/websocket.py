import logging
from typing import Dict, Set, List, Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
import json
import asyncio
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Manages WebSocket connections for real-time collaboration."""
    
    def __init__(self):
        # Map project_id -> set of WebSocket connections
        self.project_connections: Dict[str, Set[WebSocket]] = {}
        # Map script_id -> set of WebSocket connections
        self.script_connections: Dict[str, Set[WebSocket]] = {}
        # User sessions: user_id -> {project_id, script_id, ws}
        self.user_sessions: Dict[str, Dict[str, Any]] = {}        # Node locks: script_id -> {node_id -> {user_id, lock_time, expires_at}}
        self.node_locks: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # Lock timeout in minutes
        self.lock_timeout = 5    
    async def connect_project(self, websocket: WebSocket, project_id: str, user_id: str, username: str):
        """Connect to project updates."""
        await websocket.accept()
        
        if project_id not in self.project_connections:
            self.project_connections[project_id] = set()
        
        self.project_connections[project_id].add(websocket)
        
        # Update user session
        self.user_sessions[user_id] = {
            "project_id": project_id,
            "ws": websocket,
            "username": username,
            "connected_at": datetime.now().isoformat()
        }
        
        # Get active users for this project
        active_users = self.get_project_active_users(project_id)
        
        # Send active users list to the newly connected client
        await self.send_personal_message(
            {
                "type": "active_users",
                "users": active_users
            },
            websocket
        )
        
        # Also send active users list to all existing clients
        # The test expects message type "active_users" for both new and existing clients
        for connection in self.project_connections[project_id]:
            if connection != websocket:  # Don't send again to the newly connected client
                await self.send_personal_message(
                    {
                        "type": "active_users",
                        "users": active_users
                    },
                    connection
                )
        
        logger.info(f"User {username} ({user_id}) connected to project {project_id}")
    
    async def connect_script(self, websocket: WebSocket, script_id: str, user_id: str, username: str):
        """Connect to script editing."""
        await websocket.accept()
        
        if script_id not in self.script_connections:
            self.script_connections[script_id] = set()
        
        self.script_connections[script_id].add(websocket)
        
        # Update user session
        if user_id in self.user_sessions:
            self.user_sessions[user_id].update({
                "script_id": script_id,
                "ws": websocket,
                "username": username
            })
        else:
            self.user_sessions[user_id] = {
                "script_id": script_id,
                "ws": websocket,
                "username": username,
                "connected_at": datetime.now().isoformat()
            }
        
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
        except Exception as e:
            logger.error(f"Error sending personal message: {str(e)}")
    
    async def broadcast_to_project(
        self, 
        project_id: str, 
        message: Dict[str, Any], 
        exclude_websocket: Optional[WebSocket] = None,
        exclude_user: Optional[str] = None
    ):
        """Broadcast a message to all connections in a project."""
        if project_id not in self.project_connections:
            return
        
        # Find websocket for excluded user if needed
        excluded_ws = None
        if exclude_user and exclude_user in self.user_sessions:
            excluded_ws = self.user_sessions[exclude_user].get("ws")
        
        connections = self.project_connections[project_id]
        for connection in connections:
            if (connection != exclude_websocket and connection != excluded_ws):
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error broadcasting to project: {str(e)}")
    
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
        excluded_ws = None
        if exclude_user and exclude_user in self.user_sessions:
            excluded_ws = self.user_sessions[exclude_user].get("ws")
        
        connections = self.script_connections[script_id]
        for connection in connections:
            if (connection != exclude_websocket and connection != excluded_ws):
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error broadcasting to script: {str(e)}")
    
    def get_project_active_users(self, project_id: str) -> List[Dict[str, Any]]:
        """Get list of active users in a project."""
        active_users = []
        for user_id, session in self.user_sessions.items():
            if session.get("project_id") == project_id:
                active_users.append({
                    "id": user_id,  # Changed to match test expectations
                    "username": session.get("username", "Unknown"),
                    "connected_at": session.get("connected_at"),
                    "editing_script": session.get("script_id")
                })
        return active_users
    
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
    
    async def disconnect(self, websocket: WebSocket, user_id: Optional[str] = None):
        """Disconnect websocket from all connections."""
        # Find user_id by websocket if not provided
        if not user_id:
            for uid, session in self.user_sessions.items():
                if session.get("ws") == websocket:
                    user_id = uid
                    break
        
        if user_id and user_id in self.user_sessions:
            session = self.user_sessions[user_id]
            project_id = session.get("project_id")
            script_id = session.get("script_id")
            username = session.get("username", "Unknown")
            
            # Remove from project connections
            if project_id and project_id in self.project_connections:
                if websocket in self.project_connections[project_id]:
                    self.project_connections[project_id].remove(websocket)
                    # Notify others
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
                    # Notify others
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
            if script_id and script_id in self.node_locks:
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
            
            # Remove user session
            del self.user_sessions[user_id]
        
        logger.info(f"User {user_id if user_id else 'Unknown'} disconnected")

# Create a global instance
connection_manager = ConnectionManager()

# TODO: Implement periodic cleanup of stale locks - #issue/126
