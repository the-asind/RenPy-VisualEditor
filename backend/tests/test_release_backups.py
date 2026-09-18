import importlib.util
from pathlib import Path
import sqlite3


def module():
    path = Path(__file__).resolve().parents[2] / 'ops/release_host.py'
    spec = importlib.util.spec_from_file_location('release_host', path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def test_offhost_pull_validates_before_replacing_and_reports_success(tmp_path, monkeypatch):
    path = Path(__file__).resolve().parents[2] / 'ops/pull_backup.py'
    spec = importlib.util.spec_from_file_location('pull_backup', path)
    pull = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pull)
    source = tmp_path / 'source.sqlite'
    with sqlite3.connect(source) as connection:
        connection.execute('create table mouse(name text)')
    def receive(args, stdout, **kwargs):
        assert 'StrictHostKeyChecking=yes' in args
        assert 'backup@example.internal' in args
        stdout.write(source.read_bytes())
    monkeypatch.setattr(pull.subprocess, 'run', receive)
    backups = tmp_path / 'remote'
    metric = tmp_path / 'health.prom'
    pull.pull(backups, metric, tmp_path / 'key', tmp_path / 'hosts', 'backup@example.internal')
    assert (backups / 'latest.sqlite').read_bytes() == source.read_bytes()
    assert 'rve_backup_offhost_last_success_timestamp_seconds 0\n' not in metric.read_text()
    original = (backups / 'latest.sqlite').read_bytes()
    source.write_bytes(b'broken transfer')
    import pytest
    with pytest.raises(sqlite3.DatabaseError):
        pull.pull(backups, metric, tmp_path / 'key', tmp_path / 'hosts', 'backup@example.internal')
    assert (backups / 'latest.sqlite').read_bytes() == original


def test_backup_is_consistent_private_and_keeps_previous(tmp_path):
    db = tmp_path / 'live.sqlite'
    with sqlite3.connect(db) as connection:
        connection.execute('create table story(line text)')
        connection.execute('insert into story values (?)', ('Mouse RenPy saved the cheese.',))
    target = tmp_path / 'backups'
    host = module()
    host.backup(db, target)
    with sqlite3.connect(db) as connection:
        connection.execute('insert into story values (?)', ('Then ate the backup.',))
    host.backup(db, target)
    with sqlite3.connect(target / 'latest.sqlite') as connection:
        assert connection.execute('pragma integrity_check').fetchone()[0] == 'ok'
        assert connection.execute('select count(*) from story').fetchone()[0] == 2
    with sqlite3.connect(target / 'previous.sqlite') as connection:
        assert connection.execute('select count(*) from story').fetchone()[0] == 1
    assert not list(target.glob('*.tmp'))


def test_host_metrics_report_missing_and_current_backup(tmp_path):
    host = module()
    memory = tmp_path / 'meminfo'
    memory.write_text('MemTotal: 1000 kB\nMemAvailable: 400 kB\n')
    assert 'rve_backup_last_success_timestamp_seconds 0' in host.metrics(tmp_path, tmp_path, memory)
    (tmp_path / 'latest.sqlite').write_bytes(b'backup')
    output = host.metrics(tmp_path, tmp_path, memory)
    assert 'rve_host_memory_available_ratio 0.4' in output
    assert 'rve_host_disk_available_bytes ' in output
    assert 'rve_backup_last_success_timestamp_seconds 0\n' not in output


def test_host_metrics_ingress_and_scrape_are_restricted():
    root = Path(__file__).resolve().parents[2]
    nginx = (root / 'ops/nginx/plotmio.conf.template').read_text()
    section = nginx.split('location = /internal/host-metrics {')[1].split('}')[0]
    assert 'allow __OBSERVABILITY_VPN_IP__;' in section
    assert 'deny all;' in section
    assert 'alias /var/lib/renpy-monitor/host.prom;' in section
    assert 'metrics_path: /internal/host-metrics' in (root / 'ops/prometheus/prometheus.yml').read_text()
