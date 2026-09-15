"""Per-worker admission before body parsing and WebSocket authentication.

The production service runs one worker. Multiple workers multiply these limits.
Counters are reserved without awaits and always released, with no wait queue.
"""
import asyncio
from collections import Counter
from starlette.responses import JSONResponse
from ..security import MAX_HTTP_BODY_BYTES, MAX_HEAVY_REQUESTS, MAX_WS_CONNECTIONS_TOTAL, MAX_WS_CONNECTIONS_PER_IP


class ResourceAdmissionMiddleware:
    def __init__(self, app, *, max_body=MAX_HTTP_BODY_BYTES, max_heavy=MAX_HEAVY_REQUESTS,
                 max_ws=MAX_WS_CONNECTIONS_TOTAL, max_ws_ip=MAX_WS_CONNECTIONS_PER_IP):
        self.app = app
        self.max_body, self.max_heavy = max_body, max_heavy
        self.max_ws, self.max_ws_ip = max_ws, max_ws_ip
        self.websockets = self.heavy = self.uploads = 0
        self.ws_ips = Counter()

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'websocket':
            ip = (scope.get('client') or ('unknown',))[0]
            if self.websockets >= self.max_ws or self.ws_ips[ip] >= self.max_ws_ip:
                await send({'type': 'websocket.close', 'code': 4429})
                return
            self.websockets += 1
            self.ws_ips[ip] += 1
            try:
                await self.app(scope, receive, send)
            finally:
                self.websockets -= 1
                self.ws_ips[ip] -= 1
                if not self.ws_ips[ip]:
                    del self.ws_ips[ip]
            return
        if scope['type'] != 'http' or scope.get('method') not in {'POST', 'PUT', 'PATCH'}:
            await self.app(scope, receive, send)
            return
        # All project writes can invoke bridge/parser work or consume storage.
        path = scope.get('path', '')
        heavy = path.startswith('/api/projects/') or path in {'/api/auth/token', '/api/auth/register'}
        if self.uploads >= 16 or (heavy and self.heavy >= self.max_heavy):
            await JSONResponse({'detail': {'code': 'server_busy'}}, 503, headers={'Retry-After': '2'})(scope, receive, send)
            return
        self.uploads += 1
        self.heavy += int(heavy)
        try:
            body = bytearray()
            async def read_body():
                while True:
                    event = await receive()
                    if event['type'] == 'http.disconnect':
                        return False
                    chunk = event.get('body', b'')
                    if len(body) + len(chunk) > self.max_body:
                        return 413
                    body.extend(chunk)
                    if not event.get('more_body', False):
                        return True
            try:
                result = await asyncio.wait_for(read_body(), 30)
            except asyncio.TimeoutError:
                result = 408
            if result is False:
                return
            if result is not True:
                await JSONResponse({'detail': 'Request body too large or timed out'}, result)(scope, receive, send)
                return
            delivered = False
            async def buffered_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                return await receive()
            await self.app(scope, buffered_receive, send)
        finally:
            self.uploads -= 1
            self.heavy -= int(heavy)
