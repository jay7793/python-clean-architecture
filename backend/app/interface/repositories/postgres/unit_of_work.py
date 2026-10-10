from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.interface.repositories.postgres.audit import PostgresAuditLog
from app.interface.repositories.postgres.user import (
    PostgresUserActivityRepository,
    PostgresUserPermissionRepository,
    PostgresUserRepository,
    PostgresUserTokenRepository,
)


class PostgresUnitOfWork:
    """One session, and so one transaction, shared by every repository it exposes."""

    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._session = sessions()
        self.users = PostgresUserRepository(self._session)
        self.tokens = PostgresUserTokenRepository(self._session)
        self.permissions = PostgresUserPermissionRepository(self._session)
        self.activity = PostgresUserActivityRepository(self._session)
        self.audit = PostgresAuditLog(self._session)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        try:
            if exc_type is None:
                await self._session.commit()
            else:
                await self._session.rollback()
        finally:
            await self._session.close()
