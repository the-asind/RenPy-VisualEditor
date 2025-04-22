import pytest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
import json
from datetime import datetime, timedelta

from app.services.websocket import ConnectionManager

class MockWebSocket:
    """Mock WebSocket class for testing."""
    
    def __init__(self):
        self.sent_messages = []
        self.closed = False
        self.close_code = None
        self.close_reason = None
    
    async def accept(self):
        """Accept the connection."""
        pass
    
    async def send_text(self, text):
        """Record sent messages."""
        self.sent_messages.append(text)
    
    async def close(self, code=1000, reason=None):
        """Record connection close."""
        self.closed = True
        self.close_code = code
        self.close_reason = reason


@pytest.mark.asyncio
class TestConnectionManager:
    """Test suite for WebSocket ConnectionManager."""
    
    @pytest.fixture
    def connection_manager(self):
        """Create a fresh ConnectionManager instance."""
        return ConnectionManager()
    
    async def test_connect_project(self, connection_manager):
        """Test connecting to a project."""
        # Setup
        ws = MockWebSocket()
        project_id = "project123"
        user_id = "user456"
        username = "testuser"
        
        # Connect
        await connection_manager.connect_project(ws, project_id, user_id, username)
        
        # Verify connection was registered
        assert ws in connection_manager.project_connections[project_id]
        assert user_id in connection_manager.user_sessions
        
        # Verify user received active users list
        assert len(ws.sent_messages) == 1
        active_users_message = json.loads(ws.sent_messages[0])
        assert active_users_message["type"] == "active_users"
    
    async def test_connect_script(self, connection_manager):
        """Test connecting to a script."""
        # Setup
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        
        # Connect
        await connection_manager.connect_script(ws, script_id, user_id, username)
        
        # Verify connection was registered
        assert ws in connection_manager.script_connections[script_id]
        assert user_id in connection_manager.user_sessions
        
        # Verify user received node locks
        assert len(ws.sent_messages) == 1
        locks_message = json.loads(ws.sent_messages[0])
        assert locks_message["type"] == "node_locks"
    
    async def test_disconnect(self, connection_manager):
        """Test disconnecting from a project and script."""
        # Setup - connect to both project and script
        project_ws = MockWebSocket()
        script_ws = MockWebSocket()
        project_id = "project123"
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        
        await connection_manager.connect_project(project_ws, project_id, user_id, username)
        
        # Update user session to include both connections
        connection_manager.user_sessions[user_id].update({
            "script_id": script_id,
            "ws": script_ws  # Last connected websocket
        })
        
        # Add to script connections
        if script_id not in connection_manager.script_connections:
            connection_manager.script_connections[script_id] = set()
        connection_manager.script_connections[script_id].add(script_ws)
        
        # Disconnect
        await connection_manager.disconnect(script_ws, user_id)
        
        # Verify user was removed from sessions
        assert user_id not in connection_manager.user_sessions
    
    async def test_lock_node(self, connection_manager):
        """Test locking a node for editing."""
        # Setup - create a script connection first
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        node_id = "node789"
        
        await connection_manager.connect_script(ws, script_id, user_id, username)
        
        # Clear initial messages
        ws.sent_messages.clear()
        
        # Lock node
        result = await connection_manager.lock_node(script_id, node_id, user_id, username)
        
        # Verify lock was created
        assert result is True
        assert script_id in connection_manager.node_locks
        assert node_id in connection_manager.node_locks[script_id]
        assert connection_manager.node_locks[script_id][node_id]["user_id"] == user_id
    
    async def test_double_lock_attempt(self, connection_manager):
        """Test that a node can't be locked twice by different users."""
        # Setup - lock a node first
        script_id = "script123"
        node_id = "node789"
        user1_id = "user1"
        user2_id = "user2"
        
        # First lock (should succeed)
        await connection_manager.lock_node(script_id, node_id, user1_id, "User One")
        
        # Second lock attempt (should fail)
        result = await connection_manager.lock_node(script_id, node_id, user2_id, "User Two")
        assert result is False
        
        # Verify first user still has the lock
        assert connection_manager.node_locks[script_id][node_id]["user_id"] == user1_id
    
    async def test_release_node_lock(self, connection_manager):
        """Test releasing a node lock."""
        # Setup - lock a node first
        script_id = "script123"
        node_id = "node789"
        user_id = "user456"
        username = "testuser"
        
        await connection_manager.lock_node(script_id, node_id, user_id, username)
        
        # Release lock
        result = await connection_manager.release_node_lock(script_id, node_id, user_id, username)
        
        # Verify lock was released
        assert result is True
        assert node_id not in connection_manager.node_locks[script_id]
    
    async def test_notify_edit(self, connection_manager):
        """Test notifying others that a node is being edited."""
        # Setup - create connections for two users
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        script_id = "script123"
        user1_id = "user1"
        user2_id = "user2"
        node_id = "node789"
        
        # Connect both users to the script
        await connection_manager.connect_script(ws1, script_id, user1_id, "User One")
        connection_manager.script_connections[script_id].add(ws2)
        connection_manager.user_sessions[user2_id] = {
            "script_id": script_id,
            "ws": ws2,
            "username": "User Two"
        }
        
        # Clear initial messages
        ws1.sent_messages.clear()
        ws2.sent_messages.clear()
        
        # User 1 starts editing
        await connection_manager.notify_edit(script_id, node_id, user1_id, "User One")
        
        # Verify User 2 was notified but User 1 wasn't (exclude self)
        assert len(ws1.sent_messages) == 0
        assert len(ws2.sent_messages) == 1
        
        edit_message = json.loads(ws2.sent_messages[0])
        assert edit_message["type"] == "node_editing"
        assert edit_message["node_id"] == node_id
        assert edit_message["user_id"] == user1_id
        assert edit_message["username"] == "User One"
    
    async def test_broadcast_node_update(self, connection_manager):
        """Test broadcasting node updates to all connected clients."""
        # Setup - create connections for two users
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        script_id = "script123"
        user1_id = "user1"
        user2_id = "user2"
        node_id = "node789"
        content = "Updated node content"
        start_line = 10
        end_line = 15
        
        # Connect both users to the script
        await connection_manager.connect_script(ws1, script_id, user1_id, "User One")
        connection_manager.script_connections[script_id].add(ws2)
        connection_manager.user_sessions[user2_id] = {
            "script_id": script_id,
            "ws": ws2,
            "username": "User Two"
        }
        
        # Clear initial messages
        ws1.sent_messages.clear()
        ws2.sent_messages.clear()
        
        # Broadcast update
        await connection_manager.broadcast_node_update(
            script_id, node_id, user1_id, "User One", content, start_line, end_line
        )
        
        # Verify both users received the update
        assert len(ws1.sent_messages) == 1
        assert len(ws2.sent_messages) == 1
        
        for ws in [ws1, ws2]:
            update_message = json.loads(ws.sent_messages[0])
            assert update_message["type"] == "updateNode"
            assert update_message["script_id"] == script_id
            assert update_message["node_id"] == node_id
            assert update_message["user_id"] == user1_id
            assert update_message["content"] == content
            assert update_message["start_line"] == start_line
            assert update_message["end_line"] == end_line
    
    async def test_broadcast_structure_update(self, connection_manager):
        """Test broadcasting structure updates to all connected clients."""
        # Setup - create connections for two users
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        script_id = "script123"
        user1_id = "user1"
        user2_id = "user2"
        tree = {"id": "root", "children": [{"id": "child1"}]}
        
        # Connect both users to the script
        await connection_manager.connect_script(ws1, script_id, user1_id, "User One")
        connection_manager.script_connections[script_id].add(ws2)
        connection_manager.user_sessions[user2_id] = {
            "script_id": script_id,
            "ws": ws2,
            "username": "User Two"
        }
        
        # Clear initial messages
        ws1.sent_messages.clear()
        ws2.sent_messages.clear()
        
        # Broadcast structure update
        await connection_manager.broadcast_structure_update(script_id, tree)
        
        # Verify both users received the update
        assert len(ws1.sent_messages) == 1
        assert len(ws2.sent_messages) == 1
        
        for ws in [ws1, ws2]:
            update_message = json.loads(ws.sent_messages[0])
            assert update_message["type"] == "updateStructure"
            assert update_message["script_id"] == script_id
            assert update_message["tree"] == tree
    
    @patch('app.services.websocket.datetime')
    async def test_lock_timeout(self, mock_datetime, connection_manager):
        """Test that locks expire after the timeout period."""
        # Setup
        script_id = "script123"
        node_id = "node789"
        user_id = "user456"
        username = "testuser"
        
        # Mock datetime now to control time
        now = datetime(2025, 1, 1, 12, 0, 0)
        mock_datetime.now.return_value = now
        
        # Lock node
        await connection_manager.lock_node(script_id, node_id, user_id, username)
        
        # Verify lock was created with the correct expiration
        assert connection_manager.node_locks[script_id][node_id]["expires_at"] > now
        
        # Advance time beyond lock timeout (default is 5 minutes)
        future_time = now + timedelta(minutes=6)
        mock_datetime.now.return_value = future_time
        
        # Try to lock the same node with a different user
        result = await connection_manager.lock_node(script_id, node_id, "other_user", "Other User")
        
        # Verify the expired lock was replaced
        assert result is True
        assert connection_manager.node_locks[script_id][node_id]["user_id"] == "other_user"
    
    async def test_handle_join_message(self, connection_manager):
        """Test handling of a join message according to the WebSocket protocol."""
        # Setup
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        
        message = {
            "type": "join",
            "scriptId": script_id,
            "userId": user_id,
            "userName": username
        }
        
        # Handle the message
        with patch.object(connection_manager, 'connect_script') as mock_connect:
            await connection_manager.handle_client_message(ws, json.dumps(message))
            
            # Verify connect_script was called with the correct parameters
            mock_connect.assert_called_once_with(ws, script_id, user_id, username)
    
    async def test_handle_leave_message(self, connection_manager):
        """Test handling of a leave message according to the WebSocket protocol."""
        # Setup
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        
        message = {
            "type": "leave",
            "scriptId": script_id,
            "userId": user_id
        }
        
        # Connect first
        await connection_manager.connect_script(ws, script_id, user_id, "testuser")
        ws.sent_messages.clear()
        
        # Handle the message
        with patch.object(connection_manager, 'disconnect') as mock_disconnect:
            await connection_manager.handle_client_message(ws, json.dumps(message))
            
            # Verify disconnect was called with the correct parameters
            mock_disconnect.assert_called_once_with(ws, user_id)
    
    async def test_handle_start_editing_message(self, connection_manager):
        """Test handling of a startEditing message according to the WebSocket protocol."""
        # Setup
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        node_id = "node789"
        
        message = {
            "type": "startEditing",
            "scriptId": script_id,
            "userId": user_id,
            "nodeId": node_id
        }
        
        # Connect first
        await connection_manager.connect_script(ws, script_id, user_id, username)
        connection_manager.user_sessions[user_id]["username"] = username
        ws.sent_messages.clear()
        
        # Mock both lock_node and notify_edit to test they're called properly
        with patch.object(connection_manager, 'lock_node') as mock_lock:
            with patch.object(connection_manager, 'notify_edit') as mock_notify:
                mock_lock.return_value = True
                
                # Handle the message
                await connection_manager.handle_client_message(ws, json.dumps(message))
                
                # Verify methods were called with correct parameters
                mock_lock.assert_called_once_with(script_id, node_id, user_id, username)
                mock_notify.assert_called_once_with(script_id, node_id, user_id, username)
    
    async def test_handle_update_node_message(self, connection_manager):
        """Test handling of an updateNode message according to the WebSocket protocol."""
        # Setup
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        node_id = "node789"
        content = "Updated content"
        start_line = 10
        end_line = 15
        
        message = {
            "type": "updateNode",
            "scriptId": script_id,
            "userId": user_id,
            "nodeId": node_id,
            "content": content,
            "startLine": start_line,
            "endLine": end_line
        }
        
        # Connect first
        await connection_manager.connect_script(ws, script_id, user_id, username)
        connection_manager.user_sessions[user_id]["username"] = username
        ws.sent_messages.clear()
        
        # Handle the message
        with patch.object(connection_manager, 'broadcast_node_update') as mock_broadcast:
            await connection_manager.handle_client_message(ws, json.dumps(message))
            
            # Verify broadcast_node_update was called with correct parameters
            mock_broadcast.assert_called_once_with(
                script_id, node_id, user_id, username, content, start_line, end_line
            )
    
    async def test_handle_end_editing_message(self, connection_manager):
        """Test handling of an endEditing message according to the WebSocket protocol."""
        # Setup
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        node_id = "node789"
        
        message = {
            "type": "endEditing",
            "scriptId": script_id,
            "userId": user_id,
            "nodeId": node_id
        }
        
        # Connect and lock a node first
        await connection_manager.connect_script(ws, script_id, user_id, username)
        connection_manager.user_sessions[user_id]["username"] = username
        await connection_manager.lock_node(script_id, node_id, user_id, username)
        ws.sent_messages.clear()
        
        # Handle the message
        with patch.object(connection_manager, 'release_node_lock') as mock_release:
            with patch.object(connection_manager, 'notify_edit_end') as mock_notify:
                # Set up return value
                mock_release.return_value = True
                
                # Handle the message
                await connection_manager.handle_client_message(ws, json.dumps(message))
                
                # Verify methods were called with correct parameters
                mock_release.assert_called_once_with(script_id, node_id, user_id, username)
                mock_notify.assert_called_once_with(script_id, node_id, user_id)
    
    async def test_handle_insert_node_message(self, connection_manager):
        """Test handling of an insertNode message according to the WebSocket protocol."""
        # Setup
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        insertion_line = 20
        content = "New node content"
        node_type = "Action"
        
        message = {
            "type": "insertNode",
            "scriptId": script_id,
            "userId": user_id,
            "insertionLine": insertion_line,
            "content": content,
            "nodeType": node_type
        }
        
        # Connect first
        await connection_manager.connect_script(ws, script_id, user_id, username)
        connection_manager.user_sessions[user_id]["username"] = username
        ws.sent_messages.clear()
        
        # Handle the message
        with patch.object(connection_manager, 'broadcast_node_insert') as mock_broadcast:
            await connection_manager.handle_client_message(ws, json.dumps(message))
            
            # Verify broadcast_node_insert was called with correct parameters
            mock_broadcast.assert_called_once_with(
                script_id, user_id, username, insertion_line, content, node_type
            )
    
    async def test_handle_update_structure_message(self, connection_manager):
        """Test handling of an updateStructure message according to the WebSocket protocol."""
        # Setup
        ws = MockWebSocket()
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        tree = {"id": "root", "children": [{"id": "child1"}]}
        
        message = {
            "type": "updateStructure",
            "scriptId": script_id,
            "tree": tree
        }
        
        # Connect first
        await connection_manager.connect_script(ws, script_id, user_id, username)
        connection_manager.user_sessions[user_id]["username"] = username
        ws.sent_messages.clear()
        
        # Handle the message
        with patch.object(connection_manager, 'broadcast_structure_update') as mock_broadcast:
            await connection_manager.handle_client_message(ws, json.dumps(message))
            
            # Verify broadcast_structure_update was called with correct parameters
            mock_broadcast.assert_called_once_with(script_id, tree)
    
    async def test_conflict_handling(self, connection_manager):
        """Test handling of editing conflicts when a node is already locked."""
        # Setup
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        script_id = "script123"
        node_id = "node789"
        user1_id = "user1"
        user2_id = "user2"
        
        # Connect both users
        await connection_manager.connect_script(ws1, script_id, user1_id, "User One")
        connection_manager.script_connections[script_id].add(ws2)
        connection_manager.user_sessions[user2_id] = {
            "script_id": script_id,
            "ws": ws2,
            "username": "User Two"
        }
        
        # User 1 locks the node
        await connection_manager.lock_node(script_id, node_id, user1_id, "User One")
        
        # Clear messages
        ws1.sent_messages.clear()
        ws2.sent_messages.clear()
        
        # User 2 tries to start editing the same node
        message = {
            "type": "startEditing",
            "scriptId": script_id,
            "userId": user2_id,
            "nodeId": node_id
        }
        
        # Handle the message
        await connection_manager.handle_client_message(ws2, json.dumps(message))
        
        # Verify User 2 received a conflict notification
        assert len(ws2.sent_messages) == 1
        conflict_message = json.loads(ws2.sent_messages[0])
        assert conflict_message["type"] == "editConflict"
        assert conflict_message["node_id"] == node_id
        assert "locked_by" in conflict_message
        assert conflict_message["locked_by"] == "User One"
    
    async def test_notify_all_active_users(self, connection_manager):
        """Test notifying all users about the current active users list."""
        # Setup - connect multiple users
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        project_id = "project123"
        user1_id = "user1"
        user2_id = "user2"
        
        await connection_manager.connect_project(ws1, project_id, user1_id, "User One")
        # Clear messages from first connection
        ws1.sent_messages.clear()
        
        # Connect second user
        await connection_manager.connect_project(ws2, project_id, user2_id, "User Two")
        
        # Verify both users received updated active users list
        assert len(ws1.sent_messages) == 1
        assert len(ws2.sent_messages) == 1
        
        for ws in [ws1, ws2]:
            message = json.loads(ws.sent_messages[0])
            assert message["type"] == "active_users"
            assert len(message["users"]) == 2
            user_ids = [u["id"] for u in message["users"]]
            assert user1_id in user_ids
            assert user2_id in user_ids
