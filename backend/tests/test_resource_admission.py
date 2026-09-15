import asyncio
import threading
import pytest
from httpx import ASGITransport, AsyncClient
from starlette.responses import Response


@pytest.mark.asyncio
async def test_body_limit_precedes_parsing_and_busy_work_does_not_queue():
    from app.services.admission import ResourceAdmissionMiddleware
    entered, release = asyncio.Event(), asyncio.Event()
    calls = []
    async def endpoint(scope, receive, send):
        calls.append(scope['path'])
        if scope['path'].endswith('graph-export'):
            entered.set()
            await release.wait()
        await Response('ok')(scope, receive, send)
    app = ResourceAdmissionMiddleware(endpoint, max_body=4, max_heavy=1)
    async with AsyncClient(transport=ASGITransport(app), base_url='http://test') as client:
        async def chunks():
            yield b'123'
            yield b'45'
        assert (await client.put('/api/projects/p/graph-snapshot', content=chunks())).status_code == 413
        assert calls == []
        first = asyncio.create_task(client.post('/api/projects/p/graph-export', content=b'{}'))
        await entered.wait()
        try:
            busy = await asyncio.wait_for(client.post('/api/projects/p/graph-export', content=b'{}'), 1)
            assert busy.status_code == 503
            assert busy.headers['retry-after'] == '2'
            assert (await client.get('/health')).status_code == 200
        finally:
            release.set()
            await first
        assert (await client.post('/api/projects/p/graph-export', content=b'{}')).status_code == 200


@pytest.mark.asyncio
async def test_preauth_websockets_have_global_and_ip_admission_and_release():
    from app.services.admission import ResourceAdmissionMiddleware
    entered, release = asyncio.Event(), asyncio.Event()
    async def endpoint(scope, receive, send):
        entered.set()
        await release.wait()
    app = ResourceAdmissionMiddleware(endpoint, max_ws=1, max_ws_ip=1)
    sent = []
    async def send(message):
        sent.append(message)
    async def receive():
        return {'type': 'websocket.connect'}
    scope = {'type': 'websocket', 'path': '/api/ws/project/mouse', 'client': ('ip', 1)}
    first = asyncio.create_task(app(scope, receive, send))
    await entered.wait()
    await app(scope, receive, send)
    assert sent == [{'type': 'websocket.close', 'code': 4429}]
    release.set()
    await first
    sent.clear()
    await app(scope, receive, send)
    assert sent == []


@pytest.mark.asyncio
async def test_password_verification_does_not_block_health(monkeypatch):
    from fastapi import FastAPI
    from app.api.routes import auth
    entered, release = threading.Event(), threading.Event()
    def authenticate(*args):
        entered.set()
        release.wait(2)
        return None
    monkeypatch.setattr(auth.auth_service, 'authenticate_user', authenticate)
    monkeypatch.setattr(auth, 'verify_recaptcha_token', lambda token: None)
    app = FastAPI()
    app.include_router(auth.auth_router)
    @app.get('/health')
    async def health():
        return 'ok'
    async with AsyncClient(transport=ASGITransport(app), base_url='http://test') as client:
        task = asyncio.create_task(client.post('/auth/token', data={'username': 'mouse', 'password': 'password'}))
        try:
            assert await asyncio.to_thread(entered.wait, 1)
            assert not task.done(), 'Password verification blocked the event loop until completion'
            assert (await asyncio.wait_for(client.get('/health'), 0.5)).status_code == 200
        finally:
            release.set()
        assert (await task).status_code == 401
