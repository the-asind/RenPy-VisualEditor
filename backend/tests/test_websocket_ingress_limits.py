import json
import asyncio

import pytest

from app.api.routes import websocket as routes
from app.services.websocket import ConnectionManager
from test_websocket import MockWebSocket


@pytest.mark.asyncio
async def test_revoked_reader_gets_no_future_binary_broadcast():
    manager = ConnectionManager()
    ws = MockWebSocket()
    allowed = True
    await manager.connect_project(ws, 'mouse', 'reader', 'Reader')
    manager.websocket_sessions[ws]['can_read'] = lambda: allowed
    allowed = False
    await manager.broadcast_project_bytes('mouse', b'private mouse story')
    assert ws.sent_bytes == []
    assert ws.closed
    assert ws not in manager.websocket_sessions


@pytest.mark.asyncio
async def test_editor_demotion_takes_effect_on_existing_socket(monkeypatch):
    manager = ConnectionManager()
    peer = MockWebSocket()
    await manager.connect_project(peer, 'mouse', 'peer', 'Peer')
    class Database:
        calls = 0
        def get_user_by_id(self, user_id):
            return {'id': user_id, 'username': 'Mouse'}
        def get_user_projects(self, user_id):
            self.calls += 1
            return [{'id': 'mouse', 'role': 'Editor' if self.calls == 1 else 'Viewer'}]
    class Auth:
        def validate_session_token(self, *args):
            return 'sender'
    ws = MockWebSocket([
        {'type': 'websocket.receive', 'text': json.dumps({'type': 'auth', 'token': 'token'})},
        {'type': 'websocket.receive', 'bytes': b'forbidden'},
        {'type': 'websocket.disconnect'},
    ])
    monkeypatch.setattr(routes, 'db_service', Database())
    monkeypatch.setattr(routes, 'auth_service', Auth())
    monkeypatch.setattr(routes, 'connection_manager', manager)
    await routes.project_websocket(ws, 'mouse')
    assert peer.sent_bytes == []


@pytest.mark.asyncio
async def test_slow_reader_does_not_delay_fast_reader():
    received = asyncio.Event()
    class Slow(MockWebSocket):
        async def send_bytes(self, payload):
            await asyncio.Event().wait()
    class Fast(MockWebSocket):
        async def send_bytes(self, payload):
            received.set()
    manager = ConnectionManager()
    slow, fast = Slow(), Fast()
    await manager.connect_project(slow, 'mouse', 'slow', 'Slow')
    await manager.connect_project(fast, 'mouse', 'fast', 'Fast')
    # Preserve an adversarial deterministic recipient order.
    manager.project_connections['mouse'] = [slow, fast]
    task = asyncio.create_task(manager.broadcast_project_bytes('mouse', b'update'))
    try:
        await asyncio.wait_for(received.wait(), 0.1)
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind,expected_code", [("text_size", 1009), ("messages", 4429), ("bytes", 4429), ("renewed_window", None)])
async def test_noisy_socket_is_closed_without_removing_other_users(monkeypatch, kind, expected_code):
    manager = ConnectionManager()
    peer = MockWebSocket()
    await manager.connect_project(peer, "mouse", "peer", "Peer")
    peer.sent_messages.clear()
    monkeypatch.setattr(routes, "MAX_WS_MESSAGES_PER_WINDOW", 2, raising=False)
    monkeypatch.setattr(routes, "MAX_WS_BYTES_PER_WINDOW", 8, raising=False)
    if kind == "renewed_window":
        times = iter([0, 0, 0, 11])
        monkeypatch.setattr(routes, "monotonic", lambda: next(times))
    events = {
        "text_size": [{"text": "x" * (routes.MAX_PROJECT_WS_TEXT_BYTES + 1)}],
        "messages": [{"text": "{}"}] * 3,
        "bytes": [{"bytes": b"12345"}] * 2,
        "renewed_window": [{"text": "{}"}] * 3,
    }[kind]
    ws = MockWebSocket([
        {"type": "websocket.receive", "text": json.dumps({"type": "auth", "token": "token"})},
        *[{"type": "websocket.receive", **event} for event in events],
        {"type": "websocket.disconnect"},
    ])

    class Auth:
        def validate_session_token(self, *args):
            return "sender"

    class Database:
        def get_user_by_id(self, user_id):
            return {"id": user_id, "username": "Mouse"}

        def get_user_projects(self, user_id):
            return [{"id": "mouse", "role": "Editor"}]

    monkeypatch.setattr(routes, "auth_service", Auth())
    monkeypatch.setattr(routes, "db_service", Database())
    monkeypatch.setattr(routes, "connection_manager", manager)
    await routes.project_websocket(ws, "mouse")
    assert ws.close_code == expected_code
    assert ws not in manager.websocket_sessions
    assert manager.project_connections["mouse"] == {peer}
    assert not peer.closed
    if kind == "bytes":
        assert peer.sent_bytes == [b"12345"]
