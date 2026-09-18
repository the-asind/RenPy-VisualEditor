"""Zabbix external check for the Plotmio auth path.

Prints ``1`` for success and ``0`` for failure so Zabbix can store the result
as a numeric item. Credentials are passed by Zabbix macros and are never
printed.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from typing import Any


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
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, response.read()


def _join_url(base_url: str, path: str) -> str:
    return base_url.rstrip("/") + path


def run_auth_check(
    *,
    backend_url: str,
    username: str,
    password: str,
    transport: Any | None = None,
) -> dict[str, Any]:
    if not username or not password:
        return {"ok": False, "reason": "missing_credentials"}

    active_transport = transport or UrlLibTransport()
    form = urllib.parse.urlencode({"username": username, "password": password}).encode(
        "utf-8"
    )

    try:
        token_status, token_body = active_transport.request(
            "POST",
            _join_url(backend_url, "/api/auth/token"),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data=form,
        )
    except Exception as exc:  # pragma: no cover - exercised by live script use
        return {"ok": False, "reason": f"login_request_error:{type(exc).__name__}"}

    if token_status != 200:
        return {"ok": False, "reason": f"login_failed:{token_status}"}

    try:
        token_payload = json.loads(token_body.decode("utf-8"))
    except json.JSONDecodeError:
        return {"ok": False, "reason": "login_invalid_json"}

    access_token = token_payload.get("access_token")
    if not access_token:
        return {"ok": False, "reason": "login_missing_token"}

    try:
        me_status, _me_body = active_transport.request(
            "GET",
            _join_url(backend_url, "/api/auth/me"),
            headers={"Authorization": f"Bearer {access_token}"},
            data=None,
        )
    except Exception as exc:  # pragma: no cover - exercised by live script use
        return {"ok": False, "reason": f"me_request_error:{type(exc).__name__}"}

    if me_status != 200:
        return {"ok": False, "reason": f"me_failed:{me_status}"}

    return {"ok": True, "reason": "ok"}


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
    result = run_auth_check(
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
