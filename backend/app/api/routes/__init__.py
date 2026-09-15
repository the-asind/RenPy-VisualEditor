from fastapi import APIRouter

router = APIRouter()

from .auth import auth_router
router.include_router(auth_router)

from .projects import projects_router
router.include_router(projects_router)

from .websocket import ws_router
router.include_router(ws_router)
