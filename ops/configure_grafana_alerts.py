import base64
import json
from pathlib import Path
import urllib.request
import urllib.error

env = dict(line.split('=', 1) for line in (Path.home() / 'renpy-observability/.env').read_text().splitlines() if '=' in line)
auth = 'Basic ' + base64.b64encode(('admin:' + env['GRAFANA_ADMIN_PASSWORD']).encode()).decode()


def api(path, method='GET', payload=None):
    request = urllib.request.Request('http://127.0.0.1:3000' + path,
        data=json.dumps(payload).encode() if payload is not None else None, method=method,
        headers={'Authorization': auth, 'Content-Type': 'application/json', 'X-Disable-Provenance': 'true'})
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read()
        return json.loads(body) if body else None


folder = 'renpy-release-alerts'
try:
    api('/api/folders/' + folder)
except urllib.error.HTTPError as exc:
    if exc.code != 404:
        raise
    api('/api/folders', 'POST', {'uid': folder, 'title': 'RenPy Release Alerts'})
contact = {'uid': 'renpy-telegram', 'name': 'RenPy Telegram', 'type': 'webhook',
           'settings': {'url': 'http://127.0.0.1:9081/alerts', 'httpMethod': 'POST'}, 'disableResolveMessage': False}
existing = api('/api/v1/provisioning/contact-points')
if any(c['uid'] == contact['uid'] for c in existing):
    api('/api/v1/provisioning/contact-points/' + contact['uid'], 'PUT', contact)
else:
    api('/api/v1/provisioning/contact-points', 'POST', contact)
api('/api/v1/provisioning/policies', 'PUT', {'receiver': 'RenPy Telegram', 'group_by': ['alertname'],
                                          'group_wait': '30s', 'group_interval': '5m', 'repeat_interval': '4h'})
existing = api('/api/v1/provisioning/alert-rules')
for uid, title, expr, comparison, threshold, duration, no_data in [
    ('renpy-backend-down', 'RenPy backend unavailable', 'up{job="renpy-visual-editor-backend"}', 'lt', 0.5, '2m', 'Alerting'),
    ('renpy-http-errors', 'RenPy elevated HTTP failures',
     'sum(rate(rve_http_requests_total{status_class="5xx"}[5m])) / clamp_min(sum(rate(rve_http_requests_total[5m])), 0.01)',
     'gt', 0.05, '5m', 'OK'),
    ('renpy-disk-low', 'RenPy MSK disk space low', 'rve_host_disk_available_ratio{job="renpy-msk-host"}', 'lt', 0.1, '5m', 'Alerting'),
    ('renpy-memory-low', 'RenPy MSK memory low', 'rve_host_memory_available_ratio{job="renpy-msk-host"}', 'lt', 0.1, '5m', 'Alerting'),
    ('renpy-load-high', 'RenPy MSK CPU load high', 'rve_host_load_per_cpu{job="renpy-msk-host"}', 'gt', 1.5, '10m', 'Alerting'),
    ('renpy-backup-old', 'RenPy MSK backup older than RPO', 'time() - rve_backup_last_success_timestamp_seconds{job="renpy-msk-host"}', 'gt', 21600, '5m', 'Alerting'),
    ('renpy-offhost-backup-old', 'RenPy FIN backup transfer stale', 'time() - rve_backup_offhost_last_success_timestamp_seconds{job="renpy-fin-backup"}', 'gt', 3600, '5m', 'Alerting'),
    ('renpy-host-metrics-old', 'RenPy MSK host collector stale', 'time() - rve_host_metrics_timestamp_seconds{job="renpy-msk-host"}', 'gt', 180, '2m', 'Alerting'),
]:
    rule = {'uid': uid, 'title': title, 'folderUID': folder, 'ruleGroup': 'RenPy availability', 'condition': 'B',
        'for': duration, 'noDataState': no_data, 'execErrState': 'Alerting', 'labels': {'service': 'renpy'},
        'annotations': {'summary': title}, 'isPaused': False, 'data': [
            {'refId': 'A', 'relativeTimeRange': {'from': 300, 'to': 0}, 'datasourceUid': 'prometheus',
             'model': {'refId': 'A', 'expr': expr, 'instant': True, 'range': False, 'intervalMs': 1000, 'maxDataPoints': 43200}},
            {'refId': 'B', 'relativeTimeRange': {'from': 0, 'to': 0}, 'datasourceUid': '__expr__',
             'model': {'refId': 'B', 'type': 'threshold', 'expression': 'A',
                       'conditions': [{'type': 'query', 'evaluator': {'type': comparison, 'params': [threshold]},
                                       'operator': {'type': 'and'}, 'reducer': {'type': 'last'}, 'query': {'params': ['B']}}]}}
        ]}
    if any(r['uid'] == uid for r in existing):
        api('/api/v1/provisioning/alert-rules/' + uid, 'PUT', rule)
    else:
        api('/api/v1/provisioning/alert-rules', 'POST', rule)
dashboards = api('/api/search?type=dash-db')
assert len([d for d in dashboards if d['title'].startswith('RenPy')]) == 3
print('Three dashboards and eight release alert rules configured')
result = api('/api/alertmanager/grafana/config/api/v1/receivers/test', 'POST', {'receivers': [{
    'name': 'RenPy Telegram', 'grafana_managed_receiver_configs': [{
        'uid': contact['uid'], 'name': 'RenPy Telegram', 'type': 'webhook', 'settings': contact['settings']}]}]})
print('Grafana test notification result: ' + json.dumps(result))

assert all(c['status'] == 'ok' for r in result['receivers'] for c in r['grafana_managed_receiver_configs']), 'Telegram delivery failed'
