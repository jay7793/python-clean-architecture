from collections.abc import Callable
from contextlib import AbstractAsyncContextManager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.interface.handlers.admin import admin_router
from app.interface.handlers.audit import audit_router
from app.interface.handlers.auth import bearer_authentication
from app.interface.handlers.errors import install_error_handlers
from app.interface.handlers.monitor import monitor_router
from app.interface.handlers.user import user_router
from app.usecases.admin_user import AdminUserUsecase
from app.usecases.audit import AuditUsecase
from app.usecases.user import UserUsecase

# Fixed, not read from settings, so the exported OpenAPI document never depends on the environment.
API_TITLE = "Python Clean Architecture API"
API_VERSION = "1.0.0"

type Lifespan = Callable[[FastAPI], AbstractAsyncContextManager[None]]


def create_http_app(
    *,
    users: UserUsecase,
    admin: AdminUserUsecase,
    audit: AuditUsecase,
    app_name: str,
    app_version: str,
    cors_origins: list[str],
    lifespan: Lifespan | None = None,
) -> FastAPI:
    app = FastAPI(
        title=API_TITLE,
        version=API_VERSION,
        docs_url="/swagger",
        redoc_url=None,
        lifespan=lifespan,
    )
    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware, allow_origins=cors_origins, allow_methods=["*"], allow_headers=["*"]
    )

    api = APIRouter(prefix="/api/v1")
    api.include_router(monitor_router(app_name, app_version))
    current_user = bearer_authentication(users)
    api.include_router(user_router(users, current_user))
    api.include_router(admin_router(admin, current_user))
    api.include_router(audit_router(audit, current_user))
    app.include_router(api)
    return app
