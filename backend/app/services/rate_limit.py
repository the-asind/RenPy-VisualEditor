import asyncio
import math
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Deque, Dict, Mapping, Tuple

from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send


@dataclass(frozen=True)
class RateLimitRule:
    requests: int
    window_seconds: int


class SlidingWindowRateLimitMiddleware:
    """Small per-process IP limiter for the public endpoints most prone to abuse."""

    def __init__(
        self,
        app: ASGIApp,
        rules: Mapping[Tuple[str, str], RateLimitRule],
        max_clients: int = 10000,
    ) -> None:
        self.app = app
        self.rules = dict(rules)
        if max_clients < 1 or any(rule.requests < 1 or rule.window_seconds < 1 for rule in rules.values()):
            raise ValueError('Rate limits and client capacity must be positive')
        self.max_clients = max_clients
        self._next_cleanup = 0.0
        self._events: Dict[Tuple[str, str, str], Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        path = scope.get("path", "")
        rule = self.rules.get((method, path))
        if rule is None:
            await self.app(scope, receive, send)
            return

        client = scope.get("client")
        client_host = client[0] if client else "unknown"
        now = time.monotonic()
        key = (method, path, client_host)

        async with self._lock:
            if now >= self._next_cleanup:
                for stored_key, stored_events in list(self._events.items()):
                    stored_rule = self.rules[stored_key[:2]]
                    if not stored_events or stored_events[-1] <= now - stored_rule.window_seconds:
                        del self._events[stored_key]
                self._next_cleanup = now + 60
            if key not in self._events and len(self._events) >= self.max_clients:
                # Never evict an active budget: rotating IPs must not reset it.
                retry_after = max(1, math.ceil(self._next_cleanup - now))
            else:
                events = self._events[key]
                cutoff = now - rule.window_seconds
                while events and events[0] <= cutoff:
                    events.popleft()
                if len(events) >= rule.requests:
                    retry_after = max(1, math.ceil(rule.window_seconds - (now - events[0])))
                else:
                    events.append(now)
                    retry_after = None

        if retry_after is not None:
            response = JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)
