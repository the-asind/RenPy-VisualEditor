"""Bootstrap the local RenPy Visual Editor Zabbix PoC.

The script imports the versioned Zabbix template and creates or updates one
bounded host with environment URL macros. It intentionally does not create
items from customer data.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any


TEMPLATE_NAME = "Template App RenPy Visual Editor SaaS"


class ZabbixApiError(RuntimeError):
    pass


class ZabbixClient:
    def __init__(self, url: str, username: str, password: str) -> None:
        self.url = url.rstrip("/") + "/api_jsonrpc.php"
        self.username = username
        self.password = password
        self.auth_token: str | None = None
        self._request_id = 0

    def login(self) -> None:
        result = self.call(
            "user.login",
            {"username": self.username, "password": self.password},
            authenticated=False,
        )
        if not isinstance(result, str) or not result:
            raise ZabbixApiError("user.login returned an empty token")
        self.auth_token = result

    def call(
        self,
        method: str,
        params: dict[str, Any] | None = None,
        *,
        authenticated: bool = True,
    ) -> Any:
        self._request_id += 1
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": self._request_id,
        }
        if authenticated:
            if not self.auth_token:
                raise ZabbixApiError(f"{method} requires an authenticated client")
            payload["auth"] = self.auth_token

        request = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json-rpc"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))

        if "error" in body:
            raise ZabbixApiError(f"{method} failed: {body['error']}")
        return body.get("result")


def build_configuration_import_params(template_text: str) -> dict[str, Any]:
    return {
        "format": "yaml",
        "rules": {
            "templateGroups": {"createMissing": True},
            "templates": {"createMissing": True, "updateExisting": True},
            "items": {"createMissing": True, "updateExisting": True, "deleteMissing": False},
            "triggers": {
                "createMissing": True,
                "updateExisting": True,
                "deleteMissing": False,
            },
            "httptests": {
                "createMissing": True,
                "updateExisting": True,
                "deleteMissing": False,
            },
            "templateLinkage": {"createMissing": True},
            "templateDashboards": {
                "createMissing": True,
                "updateExisting": True,
                "deleteMissing": False,
            },
            "valueMaps": {
                "createMissing": True,
                "updateExisting": True,
                "deleteMissing": False,
            },
        },
        "source": template_text,
    }


def build_host_macros(
    *,
    frontend_url: str,
    backend_url: str,
    prometheus_url: str,
    grafana_url: str,
) -> list[dict[str, str]]:
    return [
        {"macro": "{$RVE_FRONTEND_URL}", "value": frontend_url},
        {"macro": "{$RVE_BACKEND_URL}", "value": backend_url},
        {"macro": "{$RVE_PROMETHEUS_URL}", "value": prometheus_url},
        {"macro": "{$RVE_GRAFANA_URL}", "value": grafana_url},
    ]


def ensure_host_group(client: Any, name: str) -> str:
    groups = client.call("hostgroup.get", {"filter": {"name": [name]}, "output": ["groupid"]})
    if groups:
        return groups[0]["groupid"]
    created = client.call("hostgroup.create", {"name": name})
    return created["groupids"][0]


def find_template(client: Any, name: str) -> str:
    templates = client.call(
        "template.get",
        {"filter": {"host": [name]}, "output": ["templateid"]},
    )
    if not templates:
        raise ZabbixApiError(f"template not found after import: {name}")
    return templates[0]["templateid"]


def ensure_host(
    client: Any,
    *,
    host_name: str,
    host_group_id: str,
    template_id: str,
    macros: list[dict[str, str]],
) -> tuple[str, bool]:
    hosts = client.call(
        "host.get",
        {"filter": {"host": [host_name]}, "output": ["hostid"]},
    )
    params = {
        "host": host_name,
        "groups": [{"groupid": host_group_id}],
        "templates": [{"templateid": template_id}],
        "macros": macros,
    }
    if hosts:
        host_id = hosts[0]["hostid"]
        client.call("host.update", {"hostid": host_id, **params})
        return host_id, False

    created = client.call("host.create", params)
    return created["hostids"][0], True


def bootstrap_zabbix(
    *,
    client: Any,
    template_path: Path,
    host_name: str,
    host_group_name: str,
    frontend_url: str,
    backend_url: str,
    prometheus_url: str,
    grafana_url: str,
) -> dict[str, Any]:
    client.login()

    template_text = template_path.read_text(encoding="utf-8")
    client.call("configuration.import", build_configuration_import_params(template_text))

    host_group_id = ensure_host_group(client, host_group_name)
    template_id = find_template(client, TEMPLATE_NAME)
    macros = build_host_macros(
        frontend_url=frontend_url,
        backend_url=backend_url,
        prometheus_url=prometheus_url,
        grafana_url=grafana_url,
    )
    host_id, host_created = ensure_host(
        client,
        host_name=host_name,
        host_group_id=host_group_id,
        template_id=template_id,
        macros=macros,
    )

    return {
        "host_group_id": host_group_id,
        "template_id": template_id,
        "host_id": host_id,
        "host_created": host_created,
    }


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8080")
    parser.add_argument("--user", default="Admin")
    parser.add_argument("--password", default="zabbix")
    parser.add_argument(
        "--template",
        type=Path,
        default=Path("ops/zabbix/templates/renpy-visual-editor-saas.yaml"),
    )
    parser.add_argument("--host-name", default="renpy-visual-editor-local")
    parser.add_argument("--host-group", default="RenPy Visual Editor")
    parser.add_argument("--frontend-url", default="http://frontend/")
    parser.add_argument("--backend-url", default="http://backend:9000")
    parser.add_argument("--prometheus-url", default="http://prometheus:9090")
    parser.add_argument("--grafana-url", default="http://grafana:3000")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    client = ZabbixClient(args.url, args.user, args.password)
    result = bootstrap_zabbix(
        client=client,
        template_path=args.template,
        host_name=args.host_name,
        host_group_name=args.host_group,
        frontend_url=args.frontend_url,
        backend_url=args.backend_url,
        prometheus_url=args.prometheus_url,
        grafana_url=args.grafana_url,
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
