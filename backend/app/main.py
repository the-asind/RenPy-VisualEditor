from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer
from .api.routes import router as api_router
from .api.routes.auth import auth_router
from .api.routes.websocket import ws_router
from .models.exceptions import BaseAppException

# Initialize FastAPI app
app = FastAPI(
    title="RenPy Visual Editor",
    description="API for the RenPy Visual Editor, a visual editor for RenPy scripts with collaborative features",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(api_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(ws_router, prefix="/api")

# Root endpoint
@app.get("/")
async def root():
    return {"message": "Welcome to RenPy Visual Editor API"}

# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "API is working"}

# Add exception handlers
@app.exception_handler(BaseAppException)
async def app_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )