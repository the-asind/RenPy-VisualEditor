import importlib.util
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP_SCRIPT = REPO_ROOT / "ops" / "zabbix" / "scripts" / "bootstrap_zabbix.py"
TEMPLATE_FILE = (
    REPO_ROOT / "ops" / "zabbix" / "templates" / "renpy-visual-editor-saas.yaml"
)


def load_bootstrap_module():
    spec = importlib.util.spec_from_file_location("bootstrap_zabbix", BOOTSTRAP_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class FakeZabbixClient:
    def __init__(self):
        self.logged_in = False
        self.calls = []

    def login(self):
        self.logged_in = True

    def call(self, method, params=None):
        self.calls.append((method, params or {}))
        if method == "configuration.import":
            return True
        if method == "hostgroup.get":
            return []
        if method == "hostgroup.create":
            return {"groupids": ["42"]}
        if method == "template.get":
            return [{"templateid": "99"}]
        if method == "host.get":
            return []
        if method == "host.create":
            return {"hostids": ["10084"]}
        raise AssertionError(f"unexpected API method {method}")


def test_configuration_import_params_are_scoped_to_template_objects():
    module = load_bootstrap_module()
    template_text = TEMPLATE_FILE.read_text(encoding="utf-8")

    params = module.build_configuration_import_params(template_text)

    assert params["format"] == "yaml"
    assert params["source"] == template_text
    assert params["rules"]["templateGroups"]["createMissing"] is True
    assert params["rules"]["templates"]["createMissing"] is True
    assert params["rules"]["templates"]["updateExisting"] is True
    assert params["rules"]["items"]["createMissing"] is True
    assert params["rules"]["triggers"]["updateExisting"] is True
    assert "hosts" not in params["rules"]


def test_build_host_macros_uses_only_bounded_environment_targets():
    module = load_bootstrap_module()

    macros = module.build_host_macros(
        frontend_url="http://frontend/",
        backend_url="http://backend:9000",
        prometheus_url="http://prometheus:9090",
        grafana_url="http://grafana:3000",
    )

    assert macros == [
        {"macro": "{$RVE_FRONTEND_URL}", "value": "http://frontend/"},
        {"macro": "{$RVE_BACKEND_URL}", "value": "http://backend:9000"},
        {"macro": "{$RVE_PROMETHEUS_URL}", "value": "http://prometheus:9090"},
        {"macro": "{$RVE_GRAFANA_URL}", "value": "http://grafana:3000"},
    ]


def test_bootstrap_imports_template_and_creates_host_with_macros():
    module = load_bootstrap_module()
    client = FakeZabbixClient()

    result = module.bootstrap_zabbix(
        client=client,
        template_path=TEMPLATE_FILE,
        host_name="renpy-visual-editor-local",
        host_group_name="RenPy Visual Editor",
        frontend_url="http://frontend/",
        backend_url="http://backend:9000",
        prometheus_url="http://prometheus:9090",
        grafana_url="http://grafana:3000",
    )

    assert result == {
        "host_group_id": "42",
        "template_id": "99",
        "host_id": "10084",
        "host_created": True,
    }
    assert client.logged_in is True

    methods = [method for method, _params in client.calls]
    assert methods == [
        "configuration.import",
        "hostgroup.get",
        "hostgroup.create",
        "template.get",
        "host.get",
        "host.create",
    ]

    host_create = client.calls[-1][1]
    assert host_create["host"] == "renpy-visual-editor-local"
    assert host_create["groups"] == [{"groupid": "42"}]
    assert host_create["templates"] == [{"templateid": "99"}]
    assert {"macro": "{$RVE_BACKEND_URL}", "value": "http://backend:9000"} in host_create[
        "macros"
    ]
