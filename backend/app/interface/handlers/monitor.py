from fastapi import APIRouter

from app.interface.handlers import schemas


def monitor_router(app_name: str, app_version: str) -> APIRouter:
    router = APIRouter(tags=["Monitor"])

    @router.get("/", response_model=schemas.Health, operation_id="healthCheck")
    async def health_check() -> schemas.Health:
        return schemas.Health(name=app_name, version=app_version)

    return router
