from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import pytest

from app.domain.entities import ADMIN_PERMISSION, AuthenticatedUser, NewUser, TokenKind
from app.infrastructure.security.bcrypt_hasher import BcryptPasswordHasher
from app.infrastructure.security.jwt_issuer import JwtTokenIssuer
from app.usecases.admin_user import AdminUserUsecase
from app.usecases.user import UserUsecase
from tests.unit.fakes import (
    InMemoryAuditLog,
    InMemoryUnitOfWork,
    InMemoryUserActivityRepository,
    InMemoryUserPermissionRepository,
    InMemoryUserRepository,
    InMemoryUserTokenRepository,
)

SECRET = "unit-test-secret-of-at-least-32-bytes"
LIFETIMES = {TokenKind.ACCESS: timedelta(minutes=15), TokenKind.REFRESH: timedelta(days=2)}


class Clock:
    """A settable clock, so tests can issue tokens 'earlier' without sleeping."""

    def __init__(self) -> None:
        self.now = datetime.now(UTC).replace(microsecond=0)

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def issuer(clock) -> JwtTokenIssuer:
    return JwtTokenIssuer(SECRET, "Unit Test App", LIFETIMES, clock)


@pytest.fixture
def users() -> InMemoryUserRepository:
    return InMemoryUserRepository()


@pytest.fixture
def tokens(clock) -> InMemoryUserTokenRepository:
    return InMemoryUserTokenRepository(clock)


@pytest.fixture
def permissions() -> InMemoryUserPermissionRepository:
    return InMemoryUserPermissionRepository()


@pytest.fixture
def hasher() -> BcryptPasswordHasher:
    return BcryptPasswordHasher(rounds=4)


@pytest.fixture
def audit() -> InMemoryAuditLog:
    return InMemoryAuditLog()


@pytest.fixture
def unit_of_work(users, tokens, permissions, audit) -> Callable[[], InMemoryUnitOfWork]:
    activity = InMemoryUserActivityRepository(users, tokens, permissions)
    return lambda: InMemoryUnitOfWork(users, tokens, permissions, activity, audit)


@pytest.fixture
def usecase(unit_of_work, hasher, issuer, clock) -> UserUsecase:
    return UserUsecase(unit_of_work, hasher, issuer, clock)


@pytest.fixture
def admin_usecase(unit_of_work, hasher, clock) -> AdminUserUsecase:
    return AdminUserUsecase(unit_of_work, hasher, clock)


@pytest.fixture
async def admin(users, permissions) -> AuthenticatedUser:
    """Ada, stored with the admin permission: the caller of the admin usecase."""
    ada = await users.add(NewUser("ada@example.com", "ada-hash", "Ada", "Lovelace"))
    await permissions.grant(ada.id, ADMIN_PERMISSION)
    return AuthenticatedUser(ada, ADMIN_PERMISSION)
