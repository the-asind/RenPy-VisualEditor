from fastapi import APIRouter

router = APIRouter()

from .scripts import scripts_router
router.include_router(scripts_router)