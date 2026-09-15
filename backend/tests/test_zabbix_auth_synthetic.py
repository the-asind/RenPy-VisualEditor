import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
AUTH_SCRIPT = REPO_ROOT / "ops" / "zabbix" / "scripts" / "auth_synthetic_check.py"


def load_auth_module():
    spec = importlib.util.spec_from_file_location("auth_synthetic_check", AUTH_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeTransport:
    def __init__(self, token_status=200, me_status=200):
        self.token_status = token_status
        self.me_status = me_status
        self.calls = []

    def request(self, method, url, headers=None, data=None):
        self.calls.append(
            {
                "method": method,
                "url": url,
                "headers": headers or {},
                "data": data,
            }
        )
        if url.endswith("/api/auth/token"):
            return self.token_status, b'{"access_token":"secret-token","token_type":"bearer"}'
        if url.endswith("/api/auth/me"):
            return self.me_status, b'{"id":"1","username":"synthetic","email":"s@example.test"}'
        raise AssertionError(f"unexpected URL {url}")


def test_auth_synthetic_logs_in_and_checks_current_user():
    module = load_auth_module()
    transport = FakeTransport()

    result = module.run_auth_check(
        backend_url="http://backend:9000",
        username="synthetic",
        password="synthetic-password",
        transport=transport,
    )

    assert result == {"ok": True, "reason": "ok"}
    assert transport.calls[0]["method"] == "POST"
    assert transport.calls[0]["url"] == "http://backend:9000/api/auth/token"
    assert transport.calls[0]["headers"]["Content-Type"] == "application/x-www-form-urlencoded"
    assert b"username=synthetic" in transport.calls[0]["data"]
    assert b"password=synthetic-password" in transport.calls[0]["data"]

    assert transport.calls[1]["method"] == "GET"
    assert transport.calls[1]["url"] == "http://backend:9000/api/auth/me"
    assert transport.calls[1]["headers"]["Authorization"] == "Bearer secret-token"


def test_auth_synthetic_reports_failure_without_leaking_token():
    module = load_auth_module()
    transport = FakeTransport(token_status=401)

    result = module.run_auth_check(
        backend_url="http://backend:9000",
        username="synthetic",
        password="wrong",
        transport=transport,
    )

    assert result["ok"] is False
    assert "secret-token" not in result["reason"]


def test_auth_synthetic_zabbix_output_is_numeric():
    module = load_auth_module()

    assert module.format_zabbix_result({"ok": True, "reason": "ok"}) == "1"
    assert module.format_zabbix_result({"ok": False, "reason": "login_failed:401"}) == "0"
