"""Staging-only ProjectGraph synthetic check for Zabbix.

The check creates a disposable project, imports a tiny Ren'Py file, verifies
that a CRDT snapshot is available, calls graph export with a minimal payload,
and deletes the disposable project. It prints ``1`` on success and ``0`` on
failure for Zabbix external checks.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from typing import Any


SYNTHETIC_SCRIPT = 'label start:\n    "Zabbix synthetic check."\n    return\n'


class UrlLibTransport:
    def request(
        self,
        method: str,
        url: str,
        headers: dict[str, str] | None = None,
        data: bytes | None = None,
    ) -> tuple[int, bytes]:
        request = urllib.request.Request(
            url,
            data=data,
            headers=headers or {},
            method=method,
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read()


def _join_url(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + path


def _request_json(
    transport: Any,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
) -> tuple[int, dict[str, Any]]:
    status, body = transport.request(method, url, headers=headers, data=data)
    if not body:
        return status, {}
    return status, json.loads(body.decode("utf-8"))


def _login(transport: Any, backend_url: str, username: str, password: str) -> tuple[bool, str]:
    form = urllib.parse.urlencode({"username": username, "password": password}).encode(
        "utf-8"
    )
    status, payload = _request_json(
        transport,
        "POST",
        _join_url(backend_url, "/api/auth/token"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data=form,
    )
    if status != 200:
        return False, f"login_failed:{status}"
    token = payload.get("access_token")
    if not token:
        return False, "login_missing_token"
    return True, token


def _build_multipart_import(boundary: str) -> bytes:
    lines = [
        f"--{boundary}",
        'Content-Disposition: form-data; name="files"; filename="synthetic.rpy"',
        "Content-Type: text/plain",
        "",
        SYNTHETIC_SCRIPT,
        f"--{boundary}--",
        "",
    ]
    return "\r\n".join(lines).encode("utf-8")


def build_minimal_export_graph(project_id: str) -> dict[str, Any]:
    visual = {
        "position": {"x": 0, "y": 0},
        "size": {"width": 320, "height": 180},
    }
    return {
        "project_id": project_id,
        "files": [
            {
                "id": "synthetic-file",
                "path": "synthetic.rpy",
                "order": "0001",
                "visual": visual,
            }
        ],
        "labels": [
            {
                "id": "synthetic-label",
                "file_id": "synthetic-file",
                "parent_label_id": None,
                "name": "start",
                "qualified_name": "start",
                "scope": "global",
                "label_start_node_id": "synthetic-label-start",
                "source_span": None,
                "visual": visual,
            }
        ],
        "label_starts": [
            {
                "id": "synthetic-label-start",
                "file_id": "synthetic-file",
                "label_id": "synthetic-label",
                "qualified_name": "start",
                "content": "label start:",
                "visual": visual,
            }
        ],
        "nodes": [
            {
                "id": "synthetic-return",
                "file_id": "synthetic-file",
                "label_id": "synthetic-label",
                "parent_node_id": None,
                "type": "return",
                "content": "return",
                "order": "0001",
                "source_span": None,
                "metadata": {},
                "visual": visual,
            }
        ],
        "edges": [],
        "diagnostics": [],
        "source_index": {},
    }


def _cleanup_project(
    transport: Any,
    backend_url: str,
    token: str,
    project_identifier: str | None,
) -> None:
    if not project_identifier:
        return
    try:
        transport.request(
            "DELETE",
            _join_url(backend_url, f"/api/projects/{project_identifier}"),
            headers={"Authorization": f"Bearer {token}"},
            data=None,
        )
    except Exception:
        return


def run_projectgraph_check(
    *,
    backend_url: str,
    username: str,
    password: str,
    transport: Any | None = None,
) -> dict[str, Any]:
    if not username or not password:
        return {"ok": False, "reason": "missing_credentials"}

    active_transport = transport or UrlLibTransport()
    project_identifier: str | None = None
    token = ""

    try:
        login_ok, login_result = _login(active_transport, backend_url, username, password)
        if not login_ok:
            return {"ok": False, "reason": login_result}
        token = login_result
        auth_header = {"Authorization": f"Bearer {token}"}

        status, project = _request_json(
            active_transport,
            "POST",
            _join_url(backend_url, "/api/projects/"),
            headers={**auth_header, "Content-Type": "application/json"},
            data=json.dumps(
                {
                    "name": "Zabbix Synthetic",
                    "description": "Disposable staging ProjectGraph synthetic check",
                }
            ).encode("utf-8"),
        )
        if status != 200:
            return {"ok": False, "reason": f"project_create_failed:{status}"}
        project_identifier = project.get("id")
        if not project_identifier:
            return {"ok": False, "reason": "project_create_missing_id"}

        boundary = "rve-zabbix-synthetic-boundary"
        import_status, import_payload = _request_json(
            active_transport,
            "POST",
            _join_url(backend_url, f"/api/projects/{project_identifier}/graph-import"),
            headers={
                **auth_header,
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            data=_build_multipart_import(boundary),
        )
        if import_status != 200:
            return {"ok": False, "reason": f"import_failed:{import_status}"}
        if import_payload.get("snapshot_available") is not True:
            return {"ok": False, "reason": "import_missing_snapshot"}

        snapshot_status, snapshot_body = active_transport.request(
            "GET",
            _join_url(backend_url, f"/api/projects/{project_identifier}/graph-snapshot"),
            headers=auth_header,
            data=None,
        )
        if snapshot_status != 200:
            return {"ok": False, "reason": f"snapshot_failed:{snapshot_status}"}
        if not snapshot_body:
            return {"ok": False, "reason": "snapshot_empty"}

        export_status, export_payload = _request_json(
            active_transport,
            "POST",
            _join_url(backend_url, f"/api/projects/{project_identifier}/graph-export"),
            headers={**auth_header, "Content-Type": "application/json"},
            data=json.dumps(build_minimal_export_graph(project_identifier)).encode("utf-8"),
        )
        if export_status != 200:
            return {"ok": False, "reason": f"export_failed:{export_status}"}
        if "files" not in export_payload:
            return {"ok": False, "reason": "export_missing_files"}

        return {"ok": True, "reason": "ok"}
    except Exception as exc:  # pragma: no cover - exercised by live script use
        return {"ok": False, "reason": f"request_error:{type(exc).__name__}"}
    finally:
        _cleanup_project(active_transport, backend_url, token, project_identifier)


def format_zabbix_result(result: dict[str, Any]) -> str:
    return "1" if result.get("ok") is True else "0"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backend_url")
    parser.add_argument("username")
    parser.add_argument("password")
    parser.add_argument("--json", action="store_true", dest="json_output")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    result = run_projectgraph_check(
        backend_url=args.backend_url,
        username=args.username,
        password=args.password,
    )
    if args.json_output:
        print(json.dumps(result, sort_keys=True))
    else:
        print(format_zabbix_result(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
