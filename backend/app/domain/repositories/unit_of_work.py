from collections.abc import Callable
from types import TracebackType
from typing import Protocol, Self

from app.domain.repositories.audit import AuditLog
from app.domain.repositories.user import (
    UserActivityRepository,
    UserPermissionRepository,
    UserRepository,
    UserTokenRepository,
)


class UnitOfWork(Protocol):
    """One transaction across every repository it exposes.

    Leaving the `async with` block commits; an exception rolls everything back, so a change and
    its audit event are stored together or not at all.
    """

    users: UserRepository
    tokens: UserTokenRepository
    permissions: UserPermissionRepository
    activity: UserActivityRepository
    audit: AuditLog

    async def __aenter__(self) -> Self: ...

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None: ...


type UnitOfWorkFactory = Callable[[], UnitOfWork]
