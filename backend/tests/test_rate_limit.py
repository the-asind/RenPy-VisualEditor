from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.services.rate_limit import RateLimitRule, SlidingWindowRateLimitMiddleware


@pytest.mark.asyncio
async def test_limiter_bounds_clients_and_reclaims_expired_capacity(monkeypatch):
    now = [100.0]
    monkeypatch.setattr('app.services.rate_limit.time.monotonic', lambda: now[0])

    async def endpoint(scope, receive, send):
        await send({'type': 'http.response.start', 'status': 200, 'headers': []})
        await send({'type': 'http.response.body', 'body': b''})

    limiter = SlidingWindowRateLimitMiddleware(
        endpoint, {('POST', '/register'): RateLimitRule(1, 60)}, max_clients=2,
    )

    async def request(ip):
        messages = []
        async def send(message):
            messages.append(message)
        await limiter({'type': 'http', 'method': 'POST', 'path': '/register', 'client': (ip, 1)}, None, send)
        return messages[0]['status']

    assert await request('client-a') == 200
    assert await request('client-b') == 200
    assert await request('client-c') == 429
    assert await request('client-a') == 429
    now[0] += 61
    assert await request('client-c') == 200
    assert len(limiter._events) <= 2


def test_http_rate_limit_returns_retryable_429_after_budget_is_spent():
    app = FastAPI()
    app.add_middleware(
        SlidingWindowRateLimitMiddleware,
        rules={('POST', '/api/auth/register'): RateLimitRule(requests=2, window_seconds=60)},
    )

    @app.post('/api/auth/register')
    async def register():
        return {'ok': True}

    with TestClient(app) as client:
        assert client.post('/api/auth/register').status_code == 200
        assert client.post('/api/auth/register').status_code == 200
        rejected = client.post('/api/auth/register')

    assert rejected.status_code == 429
    assert rejected.json()['detail'] == 'Too many requests'
    assert int(rejected.headers['Retry-After']) >= 1
