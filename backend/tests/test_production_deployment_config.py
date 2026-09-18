from pathlib import Path
import subprocess
import sys

import yaml


ROOT_DIR = Path(__file__).resolve().parents[2]


def test_every_release_container_has_resource_and_log_limits():
    for filename in ('docker-compose.yml', 'docker-compose.observability.yml'):
        compose = yaml.safe_load((ROOT_DIR / filename).read_text(encoding='utf-8'))
        for service in compose['services'].values():
            assert service['mem_limit']
            assert float(service['cpus']) > 0
            assert service['pids_limit'] > 0
            assert service['logging']['options']['max-size'] == '10m'
            assert service['logging']['options']['max-file'] == '3'


def test_nginx_preserves_demo_media_websocket_headers_and_acme():
    config = (ROOT_DIR / 'ops/nginx/plotmio.conf.template').read_text(encoding='utf-8')
    assert 'map $request_method $plotmio_create_key' in config
    assert 'limit_req_zone $plotmio_create_key zone=plotmio_project_create:' in config
    ws = config.split('location ^~ /api/ws/ {', 1)[1].split('}', 1)[0]
    for header in ('Host', 'X-Real-IP', 'X-Forwarded-For', 'X-Forwarded-Proto'):
        assert f'proxy_set_header {header} ' in ws
    media = config.split('location ^~ /demo-assets/ {', 1)[1].split('}', 1)[0]
    assert 'proxy_pass http://127.0.0.1:9000;' in media
    assert 'server_name __APPLICATION_HOST__;' in config
    assert '/etc/letsencrypt/live/__APPLICATION_HOST__/fullchain.pem' in config


def test_application_ports_bind_only_to_loopback_behind_nginx():
    compose = yaml.safe_load((ROOT_DIR / 'docker-compose.yml').read_text(encoding='utf-8'))

    assert compose['services']['frontend']['ports'] == ['127.0.0.1:5137:80']
    assert compose['services']['backend']['ports'] == ['127.0.0.1:9000:9000']
    assert 'FORWARDED_ALLOW_IPS=${FORWARDED_ALLOW_IPS:-127.0.0.1}' in compose['services']['backend']['environment']


def test_observability_stack_is_standalone_and_private_by_default():
    compose = yaml.safe_load((ROOT_DIR / 'docker-compose.observability.yml').read_text(encoding='utf-8'))

    assert 'depends_on' not in compose['services']['prometheus']
    assert compose['services']['prometheus']['extra_hosts'] == [
        'plotmio.com:${APPLICATION_METRICS_IP:?APPLICATION_METRICS_IP is required}'
    ]
    assert compose['services']['prometheus']['network_mode'] == 'host'
    assert '--web.listen-address=127.0.0.1:9090' in compose['services']['prometheus']['command']
    assert compose['services']['grafana']['network_mode'] == 'host'
    assert 'GF_SERVER_HTTP_ADDR=127.0.0.1' in compose['services']['grafana']['environment']
    assert 'ports' not in compose['services']['grafana']
    assert 'GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:?GRAFANA_ADMIN_PASSWORD is required}' in compose['services']['grafana']['environment']


def test_prometheus_scrapes_the_allowlisted_public_metrics_bridge():
    config = yaml.safe_load((ROOT_DIR / 'ops' / 'prometheus' / 'prometheus.yml').read_text(encoding='utf-8'))
    job = config['scrape_configs'][0]

    assert job['scheme'] == 'https'
    assert job['metrics_path'] == '/internal/metrics'
    assert job['static_configs'][0]['targets'] == ['plotmio.com:443']


def test_nginx_release_config_caps_requests_and_hides_metrics_from_the_public():
    config = (ROOT_DIR / 'ops' / 'nginx' / 'plotmio.conf.template').read_text(encoding='utf-8')

    assert 'client_max_body_size 12m;' in config
    assert 'limit_req_zone $binary_remote_addr zone=plotmio_register:' in config
    assert 'limit_conn_zone $binary_remote_addr zone=plotmio_connections:' in config
    assert 'location = /internal/metrics' in config
    assert 'allow __OBSERVABILITY_SOURCE_IP__;' in config
    assert 'allow __OBSERVABILITY_VPN_IP__;' in config
    assert 'deny all;' in config
    assert 'proxy_pass http://127.0.0.1:9000/metrics;' in config
    assert 'proxy_pass http://127.0.0.1:5137;' in config


def test_public_operations_files_do_not_publish_private_host_labels_or_addresses():
    paths = [
        ROOT_DIR / 'ops',
        ROOT_DIR / 'docker-compose.observability.yml',
    ]
    forbidden = ('203.0.113.10', '192.0.2.10', '198.51.100.20', 'operator@', ' application-host', ' observability-host')
    for path in paths:
        files = path.rglob('*') if path.is_dir() else [path]
        for candidate in files:
            if candidate.is_file() and candidate.suffix in {'.md', '.py', '.yml', '.yaml', '.conf', '.template', '.service', '.timer'}:
                text = candidate.read_text(encoding='utf-8')
                assert not any(marker in text for marker in forbidden), candidate


def test_nginx_template_renderer_validates_and_resolves_all_placeholders(tmp_path):
    output = tmp_path / 'plotmio.conf'
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT_DIR / 'ops/render_nginx_config.py'),
            '--application-host', 'plotmio.example',
            '--observability-source-ip', '192.0.2.10',
            '--observability-vpn-ip', '198.51.100.20',
            '--output', str(output),
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    rendered = output.read_text(encoding='utf-8')
    assert '__' not in rendered
    assert 'server_name plotmio.example;' in rendered
    assert 'allow 192.0.2.10;' in rendered

    rejected = subprocess.run(
        [
            sys.executable,
            str(ROOT_DIR / 'ops/render_nginx_config.py'),
            '--application-host', 'bad host',
            '--observability-source-ip', '192.0.2.10',
            '--observability-vpn-ip', '198.51.100.20',
            '--output', str(output),
        ],
        capture_output=True,
        text=True,
    )
    assert rejected.returncode != 0
