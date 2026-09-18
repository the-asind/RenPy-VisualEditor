"""Pull only the forced-command backup stream; validate before replacement."""
from contextlib import closing
import hashlib
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def pull(directory, metric, key, hosts, ssh_target):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(directory, 0o700)
    fd, name = tempfile.mkstemp(dir=directory, suffix='.tmp')
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as stream:
            subprocess.run(['ssh', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
                '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(hosts),
                '-o', 'ConnectTimeout=15', ssh_target], stdout=stream, check=True, timeout=600)
            stream.flush()
            os.fsync(stream.fileno())
        with closing(sqlite3.connect(temporary.resolve().as_uri() + '?mode=ro', uri=True)) as database:
            if database.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('Off-host backup integrity check failed')
            if not database.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchone():
                raise RuntimeError('Empty off-host database')
        os.chmod(temporary, 0o600)
        latest = directory / 'latest.sqlite'
        if latest.exists() and digest(latest) != digest(temporary):
            os.replace(latest, directory / 'previous.sqlite')
        os.replace(temporary, latest)
        metric = Path(metric)
        metric.parent.mkdir(parents=True, exist_ok=True)
        temporary_metric = metric.with_suffix('.tmp')
        temporary_metric.write_text(f'# TYPE rve_backup_offhost_last_success_timestamp_seconds gauge\nrve_backup_offhost_last_success_timestamp_seconds {time.time()}\n')
        os.chmod(temporary_metric, 0o644)
        os.replace(temporary_metric, metric)
        print('Off-host backup integrity ok; SHA256 ' + digest(latest), flush=True)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    import fcntl
    base = Path.home() / 'renpy-observability'
    ssh_target = os.environ.get('BACKUP_SSH_TARGET', '').strip()
    if not ssh_target:
        raise SystemExit('BACKUP_SSH_TARGET is required')
    with (base / 'backup-pull.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit(0)
        pull(Path.home() / 'renpy-backups/automatic', base / 'backup-metrics/health.prom',
             Path.home() / '.ssh/renpy-backup', Path.home() / '.ssh/renpy-backup-known-hosts', ssh_target)
