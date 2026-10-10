from datetime import datetime
from typing import Protocol

from app.domain.entities import (
    NewUser,
    Page,
    TokenPair,
    User,
    UserActivity,
    UserChanges,
    UserCredentials,
    UserPermission,
)


class UserRepository(Protocol):
    async def add(self, new_user: NewUser) -> User:
        """Raises EmailAlreadyUsed when the email is taken in any letter case."""
        ...

    async def find_by_email(self, email: str) -> UserCredentials | None:
        """Matches the email ignoring letter case."""
        ...

    async def get(self, user_id: int) -> User | None: ...

    async def update(self, user_id: int, changes: UserChanges) -> User | None:
        """None when no user has that id. Raises EmailAlreadyUsed when the email is taken."""
        ...

    async def delete(self, user_id: int) -> bool:
        """False when no user has that id. The user's session and permission go with them."""
        ...

    async def record_sign_in(self, user_id: int, signed_in_at: datetime) -> None:
        """Store the user's latest sign-in. It is not an edit: `updated_at` stays."""
        ...


class UserTokenRepository(Protocol):
    """The active session of each user: at most one token pair per user.

    Implementations may store only digests of the tokens, so the port never hands a stored
    token back; it answers whether a presented one is the stored one.
    """

    async def upsert(self, user_id: int, tokens: TokenPair, expires_at: datetime) -> None:
        """Store the pair as the user's session, replacing any other. `expires_at` is when the
        refresh token expires."""
        ...

    async def rotate(self, user_id: int, presented_refresh: str, tokens: TokenPair) -> bool:
        """Replace the pair only while `presented_refresh` is the stored one, in one write.
        The session keeps its expiry.

        False when it is not, so of two concurrent rotations with one token exactly one wins.
        """
        ...

    async def revoke(self, user_id: int, presented_refresh: str) -> bool:
        """Delete the pair only while `presented_refresh` is the stored one, in one write."""
        ...

    async def holds_access(self, user_id: int, access: str) -> bool:
        """True while `access` is the user's stored access token."""
        ...

    async def delete_by_user_id(self, user_id: int) -> None: ...


class UserPermissionRepository(Protocol):
    async def find_by_user_id(self, user_id: int) -> UserPermission | None: ...

    async def grant(self, user_id: int, permission: str) -> UserPermission:
        """Set the user's single permission, replacing any previous one."""
        ...

    async def revoke(self, user_id: int) -> None: ...


class UserActivityRepository(Protocol):
    async def page(self, page: int, page_size: int) -> Page[UserActivity]:
        """Every user ordered by id, with no query per user."""
        ...

    async def get(self, user_id: int) -> UserActivity | None:
        """The same fields as the user's page row. None when no user has that id."""
        ...
