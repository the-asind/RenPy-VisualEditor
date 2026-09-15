import importlib.util
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
PROJECTGRAPH_SCRIPT = (
    REPO_ROOT / "ops" / "zabbix" / "scripts" / "projectgraph_synthetic_check.py"
)


def load_projectgraph_module():
    spec = importlib.util.spec_from_file_location(
        "projectgraph_synthetic_check", PROJECTGRAPH_SCRIPT
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeProjectGraphTransport:
    def __init__(self):
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
            return 200, b'{"access_token":"secret-token","token_type":"bearer"}'
        if url.endswith("/api/projects/"):
            return 200, b'{"id":"synthetic-project","name":"Zabbix Synthetic"}'
        if url.endswith("/api/projects/synthetic-project/graph-import"):
            return 200, b'{"snapshot_available":true}'
        if url.endswith("/api/projects/synthetic-project/graph-snapshot"):
            return 200, b"binary-loro-snapshot"
        if url.endswith("/api/projects/synthetic-project/graph-export"):
            return 200, b'{"files":{"synthetic.rpy":"label start:\\n    return\\n"}}'
        if url.endswith("/api/projects/synthetic-project"):
            return 200, b'{"status":"success"}'
        raise AssertionError(f"unexpected URL {url}")


def test_projectgraph_synthetic_runs_import_snapshot_export_and_cleanup():
    module = load_projectgraph_module()
    transport = FakeProjectGraphTransport()

    result = module.run_projectgraph_check(
        backend_url="http://backend:9000",
        username="synthetic",
        password="synthetic-password",
        transport=transport,
    )

    assert result == {"ok": True, "reason": "ok"}
    assert [call["method"] for call in transport.calls] == [
        "POST",
        "POST",
        "POST",
        "GET",
        "POST",
        "DELETE",
    ]
    assert transport.calls[2]["url"] == (
        "http://backend:9000/api/projects/synthetic-project/graph-import"
    )
    assert b'name="files"; filename="synthetic.rpy"' in transport.calls[2]["data"]
    assert b"label start:" in transport.calls[2]["data"]

    export_payload = json.loads(transport.calls[4]["data"].decode("utf-8"))
    assert export_payload["project_id"] == "synthetic-project"
    assert export_payload["files"][0]["path"] == "synthetic.rpy"
    assert export_payload["labels"][0]["qualified_name"] == "start"


def test_projectgraph_synthetic_cleans_up_after_failure():
    module = load_projectgraph_module()

    class FailingTransport(FakeProjectGraphTransport):
        def request(self, method, url, headers=None, data=None):
            if url.endswith("/api/projects/synthetic-project/graph-snapshot"):
                self.calls.append(
                    {
                        "method": method,
                        "url": url,
                        "headers": headers or {},
                        "data": data,
                    }
                )
                return 500, b'{"detail":"snapshot failed"}'
            return super().request(method, url, headers=headers, data=data)

    transport = FailingTransport()

    result = module.run_projectgraph_check(
        backend_url="http://backend:9000",
        username="synthetic",
        password="synthetic-password",
        transport=transport,
    )

    assert result["ok"] is False
    assert result["reason"] == "snapshot_failed:500"
    assert transport.calls[-1]["method"] == "DELETE"
    assert transport.calls[-1]["url"] == "http://backend:9000/api/projects/synthetic-project"


def test_projectgraph_synthetic_zabbix_output_is_numeric():
    module = load_projectgraph_module()

    assert module.format_zabbix_result({"ok": True, "reason": "ok"}) == "1"
    assert module.format_zabbix_result({"ok": False, "reason": "snapshot_failed:500"}) == "0"
