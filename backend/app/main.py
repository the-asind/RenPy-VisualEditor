from pathlib import Path

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from .api.routes import router as api_router
from .models.exceptions import BaseAppException
from .security import (
    RATE_LIMIT_DEMO_PREVIEW_REQUESTS,
    RATE_LIMIT_DEMO_PREVIEW_WINDOW_SECONDS,
    RATE_LIMIT_LOGIN_REQUESTS,
    RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    RATE_LIMIT_PROJECT_CREATE_REQUESTS,
    RATE_LIMIT_PROJECT_CREATE_WINDOW_SECONDS,
    RATE_LIMIT_REGISTRATION_REQUESTS,
    RATE_LIMIT_REGISTRATION_WINDOW_SECONDS,
    get_cors_allow_origins,
)
from .services.observability import CONTENT_TYPE_LATEST, PrometheusHttpMiddleware, generate_metrics
from .services.rate_limit import RateLimitRule, SlidingWindowRateLimitMiddleware
from .services.admission import ResourceAdmissionMiddleware

# Initialize FastAPI app
app = FastAPI(
    title="RenPy Visual Editor",
    description="API for the RenPy Visual Editor, a visual editor for RenPy scripts with collaborative features",
    version="1.0.0"
)

app.add_middleware(
    SlidingWindowRateLimitMiddleware,
    rules={
        ("POST", "/api/auth/register"): RateLimitRule(
            RATE_LIMIT_REGISTRATION_REQUESTS,
            RATE_LIMIT_REGISTRATION_WINDOW_SECONDS,
        ),
        ("POST", "/api/auth/token"): RateLimitRule(
            RATE_LIMIT_LOGIN_REQUESTS,
            RATE_LIMIT_LOGIN_WINDOW_SECONDS,
        ),
        ("POST", "/api/projects/"): RateLimitRule(
            RATE_LIMIT_PROJECT_CREATE_REQUESTS,
            RATE_LIMIT_PROJECT_CREATE_WINDOW_SECONDS,
        ),
        ("POST", "/api/projects/demo/clockwork-library"): RateLimitRule(
            RATE_LIMIT_PROJECT_CREATE_REQUESTS,
            RATE_LIMIT_PROJECT_CREATE_WINDOW_SECONDS,
        ),
        ("GET", "/api/projects/demo/clockwork-library/preview"): RateLimitRule(
            RATE_LIMIT_DEMO_PREVIEW_REQUESTS,
            RATE_LIMIT_DEMO_PREVIEW_WINDOW_SECONDS,
        ),
    },
)
app.add_middleware(ResourceAdmissionMiddleware)
app.add_middleware(PrometheusHttpMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Retry-After"],
)

# Include routers
app.include_router(api_router, prefix="/api")

demo_assets_dir = Path(__file__).resolve().parent / "demo_assets"
if demo_assets_dir.exists():
    app.mount("/demo-assets", StaticFiles(directory=demo_assets_dir), name="demo-assets")

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Welcome to RenPy Visual Editor API"}

# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "API is working"}

@app.get("/metrics")
async def metrics():
    return Response(content=generate_metrics(), headers={"Content-Type": CONTENT_TYPE_LATEST})

# Add exception handlers
@app.exception_handler(BaseAppException)
async def app_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )
