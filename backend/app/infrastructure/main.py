from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain.entities import TokenKind
from app.infrastructure.config import Settings
from app.infrastructure.database import create_engine, create_session_factory
from app.infrastructure.security.bcrypt_hasher import BcryptPasswordHasher
from app.infrastructure.security.jwt_issuer import JwtTokenIssuer
from app.infrastructure.single_page_app import serve_single_page_app
from app.interface.handlers.app import create_http_app
from app.interface.repositories.postgres.unit_of_work import PostgresUnitOfWork
from app.usecases.admin_user import AdminUserUsecase
from app.usecases.audit import AuditUsecase
from app.usecases.user import UserUsecase


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True, slots=True)
class Usecases:
    users: UserUsecase
    admin: AdminUserUsecase
    audit: AuditUsecase


def build_usecases(settings: Settings, sessions: async_sessionmaker[AsyncSession]) -> Usecases:
    """Composition root: the only place that picks concrete adapters.

    Services are built once; each operation opens a fresh unit of work over the session factory.
    """

    def unit_of_work() -> PostgresUnitOfWork:
        return PostgresUnitOfWork(sessions)

    hasher = BcryptPasswordHasher()
    issuer = JwtTokenIssuer(
        settings.secret_key,
        settings.name,
        {
            TokenKind.ACCESS: timedelta(seconds=settings.jwt_access_expires),
            TokenKind.REFRESH: timedelta(seconds=settings.jwt_refresh_expires),
        },
    )
    return Usecases(
        users=UserUsecase(unit_of_work, hasher, issuer, utc_now),
        admin=AdminUserUsecase(unit_of_work, hasher, utc_now, settings.protected_emails),
        audit=AuditUsecase(unit_of_work),
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine = create_engine(settings)
    usecases = build_usecases(settings, create_session_factory(engine))

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await engine.dispose()

    app = create_http_app(
        users=usecases.users,
        admin=usecases.admin,
        audit=usecases.audit,
        app_name=settings.name,
        app_version=settings.version,
        cors_origins=settings.cors_origins,
        lifespan=lifespan,
    )
    if settings.static_dir is not None:
        serve_single_page_app(app, settings.static_dir)
    return app
