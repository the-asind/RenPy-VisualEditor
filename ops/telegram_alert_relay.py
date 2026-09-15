"""Restricted Grafana webhook; credentials are supplied by systemd."""
import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def make_handler(allowed_ip, deliver):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            self.connection.settimeout(10)
            if self.client_address[0] != allowed_ip or self.path != '/alerts':
                self.send_error(403)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if length <= 0 or length > 65536:
                    self.send_error(413)
                    return
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict) or not isinstance(payload.get('alerts'), list):
                    raise ValueError()
                lines = ['RenPy observability: ' + str(payload.get('status', 'unknown'))]
                for alert in payload['alerts'][:20]:
                    lines.append(str(alert.get('labels', {}).get('alertname', 'Alert')))
                    lines.append(str(alert.get('annotations', {}).get('summary', '')))
            except (ValueError, TypeError, AttributeError):
                self.send_error(400)
                return
            try:
                deliver('\n'.join(lines)[:4000])
                status = payload.get('status')
                print('Alert delivered: ' + (status if status in {'firing', 'resolved'} else 'unknown'), flush=True)
            except Exception:
                self.send_error(502, 'Notification delivery failed')
                return
            self.send_response(200)
            self.end_headers()

        def log_message(self, fmt, *args):
            # No request payload or Telegram URL/token in logs.
            print('Alert relay request from ' + self.client_address[0], flush=True)
    return Handler


def telegram(message):
    body = json.dumps({'chat_id': os.environ['TELEGRAM_CHAT_ID'], 'text': message, 'disable_notification': True}).encode()
    request = urllib.request.Request('https://api.telegram.org/bot' + os.environ['TELEGRAM_BOT_TOKEN'] + '/sendMessage',
                                     data=body, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=10) as response:
        if not json.load(response).get('ok'):
            raise RuntimeError('Telegram rejected notification')


if __name__ == '__main__':
    ThreadingHTTPServer((os.environ.get('RELAY_BIND_IP', '127.0.0.1'), 9081),
                        make_handler(os.environ.get('RELAY_ALLOWED_IP', '127.0.0.1'), telegram)).serve_forever()
