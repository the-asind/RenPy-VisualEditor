import importlib.util
from pathlib import Path
from http.server import ThreadingHTTPServer
import threading
import urllib.request
import urllib.error
import json
from contextlib import contextmanager


def test_private_alert_relay_rejects_other_peers_and_bounds_payload(capsys):
    path = Path(__file__).resolve().parents[2] / 'ops/telegram_alert_relay.py'
    spec = importlib.util.spec_from_file_location('relay', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    sent = []
    handler = module.make_handler('192.0.2.1', sent.append)
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}/alerts'
    def post(data):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, method='POST')) as response:
                return response.status
        except urllib.error.HTTPError as exc:
            return exc.code
    try:
        assert post(b'{}') == 403
        server.RequestHandlerClass = module.make_handler('127.0.0.1', sent.append)
        assert post(b'x' * 65537) == 413
        assert post(b'[]') == 400
        assert post(json.dumps({'status': 'firing', 'alerts': [{'labels': {'alertname': 'Plotmio down'},
            'annotations': {'summary': 'No scrape'}}]}).encode()) == 200
        assert 'Plotmio observability: firing' in sent[0]
        assert 'Plotmio down' in sent[0]
        assert 'firing' in sent[0]
        assert 'Alert delivered: firing' in capsys.readouterr().out
    finally:
        server.shutdown()
        server.server_close()


def test_telegram_delivery_is_silent(monkeypatch):
    path = Path(__file__).resolve().parents[2] / 'ops/telegram_alert_relay.py'
    spec = importlib.util.spec_from_file_location('relay', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setenv('TELEGRAM_CHAT_ID', 'test-chat')
    monkeypatch.setenv('TELEGRAM_BOT_TOKEN', 'test-token')
    from io import BytesIO
    captured = []
    @contextmanager
    def receive(request, timeout):
        captured.append(json.loads(request.data))
        yield BytesIO(b'{"ok":true}')
    monkeypatch.setattr(module.urllib.request, 'urlopen', receive)
    module.telegram('Test without notification')
    assert captured[0]['disable_notification'] is True
