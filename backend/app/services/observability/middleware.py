import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.routing import NoMatchFound

from .metrics import http_request_in_progress, observe_http_request


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    route_path = getattr(route, "path", None)
    if isinstance(route_path, str):
        # Reverse routing includes prefixes even when the matched route belongs
        # to a lazily included FastAPI router. Never label with the actual URL.
        try:
            return str(request.app.url_path_for(
                route.name,
                **{key: "{" + key + "}" for key in request.path_params},
            ))
        except (NoMatchFound, AttributeError):
            pass
        return route_path
    return "unmatched"


class PrometheusHttpMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        method = request.method
        start_time = time.perf_counter()
        status_code = 500
        in_progress = http_request_in_progress.labels(method=method)
        in_progress.inc()

        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            route = _route_template(request)
            duration_seconds = time.perf_counter() - start_time
            try:
                observe_http_request(method, route, status_code, duration_seconds)
            finally:
                in_progress.dec()
