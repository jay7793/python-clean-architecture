from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from app.domain.entities.token import TokenPair
from app.domain.errors import PermissionDenied

ADMIN_PERMISSION = "admin"


@dataclass(frozen=True, slots=True)
class User:
    id: int
    email: str
    first_name: str
    last_name: str
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class NewUser:
    email: str
    password_hash: str
    first_name: str
    last_name: str


@dataclass(frozen=True, slots=True)
class UserCredentials:
    user: User
    password_hash: str


@dataclass(frozen=True, slots=True)
class LoginResult:
    user: User
    token: TokenPair


@dataclass(frozen=True, slots=True)
class UserPermission:
    user_id: int
    permission: str


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    """The caller behind a valid access token."""

    user: User
    permission: str | None

    @property
    def is_admin(self) -> bool:
        return self.permission == ADMIN_PERMISSION

    def require_admin(self) -> None:
        if not self.is_admin:
            raise PermissionDenied()


@dataclass(frozen=True, slots=True)
class AdminUser:
    """A user as an admin manages it: the account, whether it holds the admin permission, and
    whether it is protected from admin edits."""

    user: User
    is_admin: bool
    protected: bool


@dataclass(frozen=True, slots=True)
class NewAccount:
    email: str
    password: str
    first_name: str
    last_name: str
    is_admin: bool = False


@dataclass(frozen=True, slots=True)
class AccountChanges:
    """An admin's edit of an account. None leaves that field as it is."""

    email: str | None = None
    password: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    is_admin: bool | None = None


@dataclass(frozen=True, slots=True)
class UserChanges:
    """The stored columns an edit changes. None leaves that column as it is."""

    email: str | None = None
    password_hash: str | None = None
    first_name: str | None = None
    last_name: str | None = None


@dataclass(frozen=True, slots=True)
class StoredSession:
    """A user's stored session: when its refresh token expires and when it last changed."""

    expires_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class UserActivity:
    """The stored facts behind a user's role, session and last sign-in."""

    user: User
    permission: str | None
    session: StoredSession | None
    last_sign_in_at: datetime | None


class Role(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


@dataclass(frozen=True, slots=True)
class SessionState:
    """`active` while the stored refresh token is still valid. `last_active_at` is the last
    sign-in or refresh of the stored session, and None once it is gone."""

    active: bool
    last_active_at: datetime | None


@dataclass(frozen=True, slots=True)
class UserOverview:
    """A row of the admin's user list."""

    user: User
    role: Role
    session: SessionState
    last_sign_in_at: datetime | None
    protected: bool
