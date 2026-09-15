import pytest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
import json
from datetime import datetime, timedelta

from app.api.routes import websocket as websocket_routes
from app.services.observability.metrics import generate_metrics
from app.services.websocket import ConnectionManager, WebSocketConnectionLimitError

class MockWebSocket:
    """Mock WebSocket class for testing."""
    
    def __init__(self, received_events=None):
        self.sent_messages = []
        self.sent_bytes = []
        self.received_events = list(received_events or [])
        self.closed = False
        self.close_code = None
        self.close_reason = None
    
    async def accept(self):
        """Accept the connection."""
        pass
    
    async def send_text(self, text):
        """Record sent messages."""
        self.sent_messages.append(text)

    async def send_bytes(self, data):
        """Record sent binary messages."""
        self.sent_bytes.append(data)

    async def receive(self):
        """Return the next queued WebSocket event."""
        if not self.received_events:
            return {"type": "websocket.disconnect"}
        return self.received_events.pop(0)
    
    async def close(self, code=1000, reason=None):
        """Record connection close."""
        self.closed = True
        self.close_code = code
        self.close_reason = reason


def metrics_text():
    return generate_metrics().decode("utf-8")


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
        
        # Verify user received node locks and active users list
        assert len(ws.sent_messages) == 2
        locks_message = json.loads(ws.sent_messages[0])
        assert locks_message["type"] == "node_locks"
        active_message = json.loads(ws.sent_messages[1])
        assert active_message["type"] == "active_users"
    
    async def test_disconnect(self, connection_manager):
        """Disconnecting a legacy script socket must preserve the user's project socket."""
        project_ws = MockWebSocket()
        script_ws = MockWebSocket()
        project_id = "project123"
        script_id = "script123"
        user_id = "user456"
        username = "testuser"
        
        await connection_manager.connect_project(project_ws, project_id, user_id, username)
        await connection_manager.connect_script(script_ws, script_id, user_id, username)
        
        await connection_manager.disconnect(script_ws, user_id)
        
        assert script_ws not in connection_manager.script_connections.get(script_id, set())
        assert project_ws in connection_manager.project_connections[project_id]
        assert connection_manager.user_sessions[user_id]["ws"] is project_ws

    async def test_disconnect_keeps_another_project_tab_for_the_same_user(self, connection_manager):
        """Closing one tab must remove that socket without orphaning another project tab."""
        first_tab = MockWebSocket()
        second_tab = MockWebSocket()

        await connection_manager.connect_project(first_tab, "project-a", "same-user", "Same User")
        await connection_manager.connect_project(second_tab, "project-b", "same-user", "Same User")

        await connection_manager.disconnect(first_tab, "same-user")

        assert first_tab not in connection_manager.project_connections.get("project-a", set())
        assert second_tab in connection_manager.project_connections["project-b"]
        assert connection_manager.user_sessions["same-user"]["ws"] is second_tab
        assert connection_manager._project_connection_total() == 1
        assert connection_manager._project_room_count() == 1

    async def test_project_connection_limits_apply_per_user_and_room(self):
        manager = ConnectionManager(max_connections_per_user=2, max_connections_per_project=2)
        first = MockWebSocket()
        second = MockWebSocket()
        over_user_limit = MockWebSocket()
        over_room_limit = MockWebSocket()

        await manager.connect_project(first, "mouse-project", "mouse-user", "Mouse User")
        await manager.connect_project(second, "mouse-project", "mouse-user", "Mouse User")

        with pytest.raises(WebSocketConnectionLimitError) as user_error:
            await manager.connect_project(over_user_limit, "other-project", "mouse-user", "Mouse User")
        assert user_error.value.scope == "user"

        with pytest.raises(WebSocketConnectionLimitError) as room_error:
            await manager.connect_project(over_room_limit, "mouse-project", "other-user", "Other User")
        assert room_error.value.scope == "project"
        assert over_user_limit not in manager.websocket_sessions
        assert over_room_limit not in manager.websocket_sessions
    
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

    async def test_project_active_users_on_disconnect(self, connection_manager):
        """Active users list should update when a user disconnects from a project."""
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        project_id = "projectABC"

        await connection_manager.connect_project(ws1, project_id, "u1", "User1")
        ws1.sent_messages.clear()
        await connection_manager.connect_project(ws2, project_id, "u2", "User2")
        ws1.sent_messages.clear()
        ws2.sent_messages.clear()

        await connection_manager.disconnect(ws2, "u2")

        assert ws1.sent_messages
        last = json.loads(ws1.sent_messages[-1])
        assert last["type"] == "active_users"
        assert len(last["users"]) == 1
        assert last["users"][0]["id"] == "u1"

    async def test_project_binary_crdt_update_relay_is_byte_for_byte(self, connection_manager):
        """Binary CRDT updates should relay to project peers without JSON wrapping."""
        ws_sender = MockWebSocket()
        ws_peer = MockWebSocket()
        ws_other_project = MockWebSocket()

        await connection_manager.connect_project(ws_sender, "project-a", "u1", "User1")
        await connection_manager.connect_project(ws_peer, "project-a", "u2", "User2")
        await connection_manager.connect_project(ws_other_project, "project-b", "u3", "User3")

        ws_sender.sent_messages.clear()
        ws_peer.sent_messages.clear()
        ws_other_project.sent_messages.clear()

        payload = b"\x00loro-update\xff\x10"
        await connection_manager.handle_project_crdt_update(
            websocket=ws_sender,
            project_id="project-a",
            update=payload,
        )

        assert ws_sender.sent_bytes == [payload]
        assert ws_peer.sent_bytes == [payload]
        assert ws_other_project.sent_bytes == []
        assert ws_sender.sent_messages == []
        assert ws_peer.sent_messages == []
        assert ws_other_project.sent_messages == []

    async def test_project_binary_crdt_update_over_limit_is_rejected(self, connection_manager, monkeypatch):
        """Oversized binary CRDT frames should not be relayed to room participants."""
        monkeypatch.setattr("app.services.websocket.MAX_WS_BINARY_UPDATE_BYTES", 4, raising=False)
        ws_sender = MockWebSocket()
        ws_peer = MockWebSocket()

        await connection_manager.connect_project(ws_sender, "project-limit", "u1", "User1")
        await connection_manager.connect_project(ws_peer, "project-limit", "u2", "User2")
        ws_sender.sent_messages.clear()
        ws_peer.sent_messages.clear()

        await connection_manager.handle_project_crdt_update(
            websocket=ws_sender,
            project_id="project-limit",
            update=b"12345",
        )

        assert ws_sender.sent_bytes == []
        assert ws_peer.sent_bytes == []
        assert json.loads(ws_sender.sent_messages[0]) == {
            "type": "error",
            "message": "Project CRDT update is too large",
        }

    async def test_project_presence_json_and_binary_crdt_updates_share_room_without_cross_pollution(
        self,
        connection_manager,
    ):
        """Project presence JSON and binary CRDT updates should stay on separate frame types."""
        ws_sender = MockWebSocket()
        ws_peer = MockWebSocket()

        await connection_manager.connect_project(ws_sender, "project-mixed", "u1", "User1")
        await connection_manager.connect_project(ws_peer, "project-mixed", "u2", "User2")
        ws_sender.sent_messages.clear()
        ws_peer.sent_messages.clear()

        await connection_manager.broadcast_project_active_users("project-mixed")
        await connection_manager.handle_project_crdt_update(
            websocket=ws_sender,
            project_id="project-mixed",
            update=b"\x01loro-mixed-frame\x02",
        )

        sender_json = [json.loads(message) for message in ws_sender.sent_messages]
        peer_json = [json.loads(message) for message in ws_peer.sent_messages]
        assert sender_json == [
            {
                "type": "active_users",
                "users": sender_json[0]["users"],
            }
        ]
        assert peer_json == [
            {
                "type": "active_users",
                "users": peer_json[0]["users"],
            }
        ]
        assert ws_sender.sent_bytes == [b"\x01loro-mixed-frame\x02"]
        assert ws_peer.sent_bytes == [b"\x01loro-mixed-frame\x02"]

    async def test_project_connection_metrics_set_current_and_disconnect(self, connection_manager):
        """Project WebSocket connection metrics should track current totals without ID labels."""
        ws = MockWebSocket()

        await connection_manager.connect_project(ws, "metrics-project", "u1", "User1")
        await connection_manager.disconnect(ws, "u1")

        metrics = metrics_text()
        assert 'rve_ws_project_connections_total{result="success"}' in metrics
        assert 'rve_ws_project_disconnects_total{reason="client_disconnect"}' in metrics
        assert "rve_ws_project_connections_current 0.0" in metrics
        assert "rve_ws_project_rooms_current 0.0" in metrics

    async def test_project_binary_crdt_update_records_binary_metrics(self, connection_manager):
        """Binary CRDT relay should record frame and byte metrics without parsing update bytes."""
        ws_sender = MockWebSocket()
        ws_peer = MockWebSocket()
        payload = b"\x00metrics-loro-update\xff"

        await connection_manager.connect_project(ws_sender, "metrics-binary-project", "u1", "User1")
        await connection_manager.connect_project(ws_peer, "metrics-binary-project", "u2", "User2")
        ws_sender.sent_messages.clear()
        ws_peer.sent_messages.clear()

        await connection_manager.handle_project_crdt_update(
            websocket=ws_sender,
            project_id="metrics-binary-project",
            update=payload,
        )

        metrics = metrics_text()
        assert ws_peer.sent_bytes == [payload]
        assert 'rve_ws_messages_total{direction="incoming",frame_type="binary",result="success"}' in metrics
        assert 'rve_ws_messages_total{direction="outgoing",frame_type="binary",result="success"}' in metrics
        assert 'rve_ws_binary_update_bytes_count{direction="incoming"}' in metrics
        assert 'rve_ws_binary_update_bytes_count{direction="outgoing"}' in metrics
        assert 'rve_ws_broadcast_duration_seconds_count{frame_type="binary",result="success"}' in metrics

    async def test_project_websocket_route_records_json_ping_and_invalid_json_metrics(
        self,
        connection_manager,
        monkeypatch,
    ):
        """Project WebSocket route should count normalized JSON message types and invalid JSON."""
        route_manager = ConnectionManager()
        ws = MockWebSocket(
            received_events=[
                {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": "token"})},
                {"type": "websocket.receive", "text": json.dumps({"type": "ping"})},
                {"type": "websocket.receive", "text": "{not-json"},
                {"type": "websocket.disconnect"},
            ]
        )

        class FakeAuthService:
            def validate_session_token(self, token, project_id):
                return "route-user"

        class FakeDatabase:
            def get_user_by_id(self, user_id):
                return {"id": user_id, "username": "Route User"}

            def get_user_projects(self, user_id):
                return [{"id": "metrics-route-project"}]

        monkeypatch.setattr(websocket_routes, "auth_service", FakeAuthService())
        monkeypatch.setattr(websocket_routes, "db_service", FakeDatabase())
        monkeypatch.setattr(websocket_routes, "connection_manager", route_manager)

        await websocket_routes.project_websocket(ws, "metrics-route-project")

        metrics = metrics_text()
        assert any(json.loads(message)["type"] == "pong" for message in ws.sent_messages)
        assert 'rve_ws_json_messages_total{direction="incoming",message_type="ping",result="success"}' in metrics
        assert 'rve_ws_json_messages_total{direction="outgoing",message_type="pong",result="success"}' in metrics
        assert 'rve_ws_json_messages_total{direction="incoming",message_type="invalid_json",result="invalid_json"}' in metrics

    async def test_project_websocket_route_uses_session_token_validation(self, monkeypatch):
        """Project WebSocket auth should use a first-frame session token instead of a URL query token."""
        route_manager = ConnectionManager()
        ws = MockWebSocket(
            received_events=[
                {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": "session-token"})},
                {"type": "websocket.disconnect"},
            ]
        )
        session_tokens = []

        async def fail_if_access_token_path_is_used(token):
            raise AssertionError("project websocket should not use the login access-token dependency")

        class FakeAuthService:
            def validate_session_token(self, token, project_id):
                session_tokens.append((token, project_id))
                return "route-user"

        class FakeDatabase:
            def get_user_by_id(self, user_id):
                return {"id": user_id, "username": "Route User"}

            def get_user_projects(self, user_id):
                return [{"id": "metrics-route-project"}]

        monkeypatch.setattr(websocket_routes, "get_current_user", fail_if_access_token_path_is_used, raising=False)
        monkeypatch.setattr(websocket_routes, "auth_service", FakeAuthService(), raising=False)
        monkeypatch.setattr(websocket_routes, "db_service", FakeDatabase())
        monkeypatch.setattr(websocket_routes, "connection_manager", route_manager)

        await websocket_routes.project_websocket(ws, "metrics-route-project")

        assert session_tokens == [("session-token", "metrics-route-project")]
        assert ws.close_code is None

    async def test_project_cursor_activity_relays_typed_action_target(self, monkeypatch):
        """Action editor presence should keep a typed activity and stable node target."""
        route_manager = ConnectionManager()
        peer = MockWebSocket()
        await route_manager.connect_project(peer, "presence-project", "peer-user", "Peer User")
        peer.sent_messages.clear()
        sender = MockWebSocket(
            received_events=[
                {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": "token"})},
                {
                    "type": "websocket.receive",
                    "text": json.dumps({
                        "type": "cursor_update",
                        "x": 120,
                        "y": 240,
                        "activity": "editing_action",
                        "targetNodeId": "node-intro",
                    }),
                },
                {"type": "websocket.disconnect"},
            ]
        )

        class FakeAuthService:
            def validate_session_token(self, token, project_id):
                return "sender-user"

        class FakeDatabase:
            def get_user_by_id(self, user_id):
                return {"id": user_id, "username": "Sender User"}

            def get_user_projects(self, user_id):
                return [{"id": "presence-project", "role": "Editor"}]

        monkeypatch.setattr(websocket_routes, "auth_service", FakeAuthService(), raising=False)
        monkeypatch.setattr(websocket_routes, "db_service", FakeDatabase())
        monkeypatch.setattr(websocket_routes, "connection_manager", route_manager)

        await websocket_routes.project_websocket(sender, "presence-project")

        cursor_messages = [
            json.loads(message)
            for message in peer.sent_messages
            if json.loads(message).get("type") == "cursor_update"
        ]
        assert cursor_messages == [{
            "type": "cursor_update",
            "userId": "sender-user",
            "userName": "Sender User",
            "x": 120,
            "y": 240,
            "activity": "editing_action",
            "targetNodeId": "node-intro",
        }]

    async def test_project_websocket_viewer_cannot_relay_binary_crdt_updates(self, monkeypatch):
        """Viewers may observe a project room but must not mutate peers through binary updates."""
        route_manager = ConnectionManager()
        peer = MockWebSocket()
        await route_manager.connect_project(peer, "viewer-project", "editor-user", "Editor User")
        peer.sent_messages.clear()

        viewer = MockWebSocket(
            received_events=[
                {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": "viewer-token"})},
                {"type": "websocket.receive", "bytes": b"viewer-must-not-write"},
                {"type": "websocket.disconnect"},
            ]
        )

        class FakeAuthService:
            def validate_session_token(self, token, project_id):
                return "viewer-user"

        class FakeDatabase:
            def get_user_by_id(self, user_id):
                return {"id": user_id, "username": "Viewer User"}

            def get_user_projects(self, user_id):
                return [{"id": "viewer-project", "role": "Viewer"}]

        monkeypatch.setattr(websocket_routes, "auth_service", FakeAuthService(), raising=False)
        monkeypatch.setattr(websocket_routes, "db_service", FakeDatabase())
        monkeypatch.setattr(websocket_routes, "connection_manager", route_manager)

        await websocket_routes.project_websocket(viewer, "viewer-project")

        assert peer.sent_bytes == []
        assert viewer.sent_bytes == []
        assert any("permission" in json.loads(message).get("message", "").lower() for message in viewer.sent_messages)

    async def test_project_websocket_share_project_requires_admin_role(self, monkeypatch):
        """Project WebSocket share messages must use the same Owner/Admin boundary as REST sharing."""
        route_manager = ConnectionManager()
        ws = MockWebSocket(
            received_events=[
                {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": "viewer-token"})},
                {
                    "type": "websocket.receive",
                    "text": json.dumps({
                        "type": "share_project",
                        "target_user_id": "target-user",
                        "role_id": "role_editor",
                    }),
                },
                {"type": "websocket.disconnect"},
            ]
        )
        grants = []

        class FakeAuthService:
            def validate_session_token(self, token, project_id):
                return "viewer-user"

        class FakeDatabase:
            def get_user_by_id(self, user_id):
                return {"id": user_id, "username": "Viewer User"}

            def get_user_projects(self, user_id):
                return [{"id": "shared-project", "role": "Viewer"}]

            def grant_project_access(self, project_id, target_user_id, role_id):
                grants.append((project_id, target_user_id, role_id))
                return True

        monkeypatch.setattr(websocket_routes, "auth_service", FakeAuthService(), raising=False)
        monkeypatch.setattr(websocket_routes, "db_service", FakeDatabase())
        monkeypatch.setattr(websocket_routes, "connection_manager", route_manager)

        await websocket_routes.project_websocket(ws, "shared-project")

        assert grants == []
        assert any("permission" in json.loads(message).get("message", "").lower() for message in ws.sent_messages)

    async def test_script_active_users_updates(self, connection_manager):
        """Users editing the same script should see updated active user lists."""
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        script_id = "scriptXYZ"

        await connection_manager.connect_script(ws1, script_id, "u1", "User1")
        ws1.sent_messages.clear()
        await connection_manager.connect_script(ws2, script_id, "u2", "User2")

        # Both users should have received an active_users message listing both
        assert any(json.loads(m)["type"] == "active_users" for m in ws1.sent_messages)
        assert any(json.loads(m)["type"] == "active_users" for m in ws2.sent_messages)

        ws1.sent_messages.clear()
        ws2.sent_messages.clear()

        await connection_manager.disconnect(ws2, "u2")

        # After disconnect, ws1 should get updated list with only itself
        assert ws1.sent_messages
        msg = json.loads(ws1.sent_messages[-1])
        assert msg["type"] == "active_users"
        assert len(msg["users"]) == 1
        assert msg["users"][0]["id"] == "u1"
