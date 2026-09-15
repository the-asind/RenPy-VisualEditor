"""Release API must expose only the supported ProjectGraph editing path."""
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app


@pytest.mark.parametrize("method,path", [
    ("POST", "/api/scripts/parse"),
    ("GET", "/api/scripts/load/script-1"),
    ("GET", "/api/scripts/download/script-1"),
    ("GET", "/api/scripts/node-content/script-1"),
    ("POST", "/api/scripts/update-node/script-1"),
    ("POST", "/api/scripts/insert-node/script-1"),
    ("POST", "/api/projects/project-1/scripts"),
])
def test_legacy_script_http_routes_are_not_published(method, path):
    with TestClient(app) as client:
        assert client.request(method, path).status_code == 404


def test_legacy_script_socket_is_rejected_before_accepting_auth():
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as error:
            with client.websocket_connect("/api/ws/script/script-1"):
                pytest.fail("Legacy socket accepted a connection")
        assert error.value.code == 1000


def test_project_graph_routes_remain_available_and_authenticated():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/api/projects/project-1/graph-snapshot").status_code == 401
        assert client.post("/api/projects/project-1/graph-import").status_code == 401
        assert client.post("/api/projects/project-1/graph-export", json={}).status_code == 401
