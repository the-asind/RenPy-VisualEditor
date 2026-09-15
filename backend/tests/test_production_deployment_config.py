from pathlib import Path

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
    config = (ROOT_DIR / 'ops/nginx/renpy.online.conf').read_text(encoding='utf-8')
    assert 'map $request_method $renpy_create_key' in config
    assert 'limit_req_zone $renpy_create_key zone=renpy_project_create:' in config
    ws = config.split('location ^~ /api/ws/ {', 1)[1].split('}', 1)[0]
    for header in ('Host', 'X-Real-IP', 'X-Forwarded-For', 'X-Forwarded-Proto'):
        assert f'proxy_set_header {header} ' in ws
    media = config.split('location ^~ /demo-assets/ {', 1)[1].split('}', 1)[0]
    assert 'proxy_pass http://127.0.0.1:9000;' in media
    assert 'location / {\n        return 301 https://renpy.online$request_uri;\n    }' in config


def test_application_ports_bind_only_to_loopback_behind_nginx():
    compose = yaml.safe_load((ROOT_DIR / 'docker-compose.yml').read_text(encoding='utf-8'))

    assert compose['services']['frontend']['ports'] == ['127.0.0.1:5137:80']
    assert compose['services']['backend']['ports'] == ['127.0.0.1:9000:9000']
    assert 'FORWARDED_ALLOW_IPS=${FORWARDED_ALLOW_IPS:-127.0.0.1}' in compose['services']['backend']['environment']


def test_observability_stack_is_standalone_and_private_by_default():
    compose = yaml.safe_load((ROOT_DIR / 'docker-compose.observability.yml').read_text(encoding='utf-8'))

    assert 'depends_on' not in compose['services']['prometheus']
    assert compose['services']['prometheus']['extra_hosts'] == ['renpy.online:${MSK_METRICS_IP:-10.20.30.2}']
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
    assert job['static_configs'][0]['targets'] == ['renpy.online:443']


def test_nginx_release_config_caps_requests_and_hides_metrics_from_the_public():
    config = (ROOT_DIR / 'ops' / 'nginx' / 'renpy.online.conf').read_text(encoding='utf-8')

    assert 'client_max_body_size 12m;' in config
    assert 'limit_req_zone $binary_remote_addr zone=renpy_register:' in config
    assert 'limit_conn_zone $binary_remote_addr zone=renpy_connections:' in config
    assert 'location = /internal/metrics' in config
    assert 'allow 144.31.82.129;' in config
    assert 'deny all;' in config
    assert 'proxy_pass http://127.0.0.1:9000/metrics;' in config
    assert 'proxy_pass http://127.0.0.1:5137;' in config
