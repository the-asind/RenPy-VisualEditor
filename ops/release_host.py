"""Consistent SQLite backups and small, read-only host metrics."""
import argparse
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import time
from contextlib import closing

DEFAULT_BACKUPS = Path('/var/backups/renpy')
DEFAULT_DB = Path('/var/lib/docker/volumes/renpy_editor_db/_data/renpy_editor.db')


def backup(database, directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(directory, 0o700)
    fd, name = tempfile.mkstemp(suffix='.tmp', dir=directory)
    os.close(fd)
    temporary = Path(name)
    try:
        with closing(sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True, timeout=30)) as source:
            with closing(sqlite3.connect(temporary)) as destination:
                source.backup(destination, pages=256, sleep=0.05)
                if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise RuntimeError('Backup integrity check failed')
        os.chmod(temporary, 0o600)
        with temporary.open('r+b') as stream:
            os.fsync(stream.fileno())
        latest = directory / 'latest.sqlite'
        if latest.exists():
            os.replace(latest, directory / 'previous.sqlite')
        os.replace(temporary, latest)
    finally:
        temporary.unlink(missing_ok=True)


def metrics(root, backups, memory_file=Path('/proc/meminfo')):
    disk = shutil.disk_usage(root)
    memory = dict((line.split(':')[0], int(line.split()[1])) for line in Path(memory_file).read_text().splitlines())
    latest = Path(backups) / 'latest.sqlite'
    values = {
        'rve_host_disk_available_bytes': disk.free,
        'rve_host_disk_available_ratio': disk.free / disk.total,
        'rve_host_memory_available_ratio': memory['MemAvailable'] / memory['MemTotal'],
        'rve_host_load_per_cpu': os.getloadavg()[0] / (os.cpu_count() or 1) if hasattr(os, 'getloadavg') else 0,
        'rve_backup_last_success_timestamp_seconds': latest.stat().st_mtime if latest.exists() else 0,
        'rve_host_metrics_timestamp_seconds': time.time(),
    }
    return ''.join(f'# TYPE {key} gauge\n{key} {value}\n' for key, value in values.items())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['backup', 'metrics', 'export'])
    parser.add_argument('--database', type=Path, default=DEFAULT_DB)
    parser.add_argument('--backups', type=Path, default=DEFAULT_BACKUPS)
    parser.add_argument('--output', type=Path, default=Path('/var/lib/renpy-monitor/host.prom'))
    args = parser.parse_args()
    if args.action == 'backup':
        backup(args.database, args.backups)
    elif args.action == 'export':
        with (args.backups / 'latest.sqlite').open('rb') as stream:
            shutil.copyfileobj(stream, sys.stdout.buffer)
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix('.tmp')
        temporary.write_text(metrics('/', args.backups))
        os.chmod(temporary, 0o644)
        os.replace(temporary, args.output)
