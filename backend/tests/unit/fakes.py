"""In-memory adapters that honour the repository ports' contracts."""

from dataclasses import replace
from datetime import UTC, datetime
from itertools import count
from types import TracebackType
from typing import Self

from app.domain.entities import (
    AuditDraft,
    AuditEvent,
    AuditFilters,
    NewUser,
    Page,
    StoredSession,
    TokenPair,
    User,
    UserActivity,
    UserChanges,
    UserCredentials,
    UserPermission,
)
from app.domain.errors import EmailAlreadyUsed
from app.domain.services import Clock


class InMemoryUserRepository:
    """Keyed by the lowercased email, so an email matches and collides in any case."""

    def __init__(self) -> None:
        self.credentials: dict[str, UserCredentials] = {}
        self.sign_ins: dict[int, datetime] = {}
        self._ids = count(1)

    async def add(self, new_user: NewUser) -> User:
        if new_user.email.lower() in self.credentials:
            raise EmailAlreadyUsed()
        now = datetime.now(UTC)
        user = User(
            id=next(self._ids),
            email=new_user.email,
            first_name=new_user.first_name,
            last_name=new_user.last_name,
            created_at=now,
            updated_at=now,
        )
        self.credentials[user.email.lower()] = UserCredentials(user, new_user.password_hash)
        return user

    async def find_by_email(self, email: str) -> UserCredentials | None:
        return self.credentials.get(email.lower())

    async def get(self, user_id: int) -> User | None:
        return next((c.user for c in self.credentials.values() if c.user.id == user_id), None)

    async def update(self, user_id: int, changes: UserChanges) -> User | None:
        user = await self.get(user_id)
        if user is None:
            return None
        current = self.credentials.pop(user.email.lower())
        email = _changed(changes.email, user.email)
        if email.lower() in self.credentials:
            self.credentials[user.email.lower()] = current
            raise EmailAlreadyUsed()
        updated = replace(
            user,
            email=email,
            first_name=_changed(changes.first_name, user.first_name),
            last_name=_changed(changes.last_name, user.last_name),
            updated_at=datetime.now(UTC),
        )
        password_hash = _changed(changes.password_hash, current.password_hash)
        self.credentials[email.lower()] = UserCredentials(updated, password_hash)
        return updated

    async def delete(self, user_id: int) -> bool:
        user = await self.get(user_id)
        if user is None:
            return False
        del self.credentials[user.email.lower()]
        self.sign_ins.pop(user_id, None)
        return True

    async def record_sign_in(self, user_id: int, signed_in_at: datetime) -> None:
        self.sign_ins[user_id] = signed_in_at


def _changed[T](new: T | None, old: T) -> T:
    """None leaves a field as it is; any other value, even an empty one, replaces it."""
    return old if new is None else new


class InMemoryUserTokenRepository:
    def __init__(self, clock: Clock) -> None:
        self.sessions: dict[int, TokenPair] = {}
        self.expires_at: dict[int, datetime] = {}
        self.updated_at: dict[int, datetime] = {}
        self._clock = clock

    async def upsert(self, user_id: int, tokens: TokenPair, expires_at: datetime) -> None:
        self.sessions[user_id] = tokens
        self.expires_at[user_id] = expires_at
        self.updated_at[user_id] = self._clock()

    async def rotate(self, user_id: int, presented_refresh: str, tokens: TokenPair) -> bool:
        if not self._holds(user_id, presented_refresh):
            return False
        await self.upsert(user_id, tokens, self.expires_at[user_id])
        return True

    async def revoke(self, user_id: int, presented_refresh: str) -> bool:
        if not self._holds(user_id, presented_refresh):
            return False
        await self.delete_by_user_id(user_id)
        return True

    async def holds_access(self, user_id: int, access: str) -> bool:
        stored = self.sessions.get(user_id)
        return stored is not None and stored.access == access

    def _holds(self, user_id: int, refresh: str) -> bool:
        stored = self.sessions.get(user_id)
        return stored is not None and stored.refresh == refresh

    async def delete_by_user_id(self, user_id: int) -> None:
        self.sessions.pop(user_id, None)
        self.expires_at.pop(user_id, None)
        self.updated_at.pop(user_id, None)


class InMemoryUserPermissionRepository:
    def __init__(self) -> None:
        self.permissions: dict[int, UserPermission] = {}

    async def find_by_user_id(self, user_id: int) -> UserPermission | None:
        return self.permissions.get(user_id)

    async def grant(self, user_id: int, permission: str) -> UserPermission:
        self.permissions[user_id] = UserPermission(user_id, permission)
        return self.permissions[user_id]

    async def revoke(self, user_id: int) -> None:
        self.permissions.pop(user_id, None)


class InMemoryAuditLog:
    def __init__(self) -> None:
        self.events: list[AuditEvent] = []
        self._ids = count(1)

    async def record(self, draft: AuditDraft) -> AuditEvent:
        fields = {name: getattr(draft, name) for name in AuditDraft.__dataclass_fields__}
        event = AuditEvent(id=next(self._ids), **fields)
        self.events.append(event)
        return event

    async def page(self, filters: AuditFilters, page: int, page_size: int) -> Page[AuditEvent]:
        matching = [
            e
            for e in reversed(self.events)
            if filters.action in (None, e.action)
            and filters.outcome in (None, e.outcome)
            and (filters.actor_email or "").lower() in (e.actor_email or "").lower()
        ]
        start = (page - 1) * page_size
        return Page(matching[start : start + page_size], page, page_size, len(matching))


class InMemoryUserActivityRepository:
    """Reads the other in-memory fakes the way the SQL joins their tables."""

    def __init__(
        self,
        users: InMemoryUserRepository,
        tokens: InMemoryUserTokenRepository,
        permissions: InMemoryUserPermissionRepository,
    ) -> None:
        self._users = users
        self._tokens = tokens
        self._permissions = permissions

    async def page(self, page: int, page_size: int) -> Page[UserActivity]:
        users = sorted((c.user for c in self._users.credentials.values()), key=lambda u: u.id)
        start = (page - 1) * page_size
        return Page(
            [self._activity(user) for user in users[start : start + page_size]],
            page,
            page_size,
            len(users),
        )

    async def get(self, user_id: int) -> UserActivity | None:
        user = await self._users.get(user_id)
        return self._activity(user) if user else None

    def _activity(self, user: User) -> UserActivity:
        permission = self._permissions.permissions.get(user.id)
        expires_at = self._tokens.expires_at.get(user.id)
        return UserActivity(
            user,
            permission.permission if permission else None,
            StoredSession(expires_at, self._tokens.updated_at[user.id]) if expires_at else None,
            self._users.sign_ins.get(user.id),
        )


class InMemoryUnitOfWork:
    """Rolls the fakes back to their state at entry when the block raises, as a transaction does.

    Entities are frozen, so copying each fake's containers is a full snapshot. Counters are not
    restored: a database sequence does not roll back either.
    """

    def __init__(
        self,
        users: InMemoryUserRepository,
        tokens: InMemoryUserTokenRepository,
        permissions: InMemoryUserPermissionRepository,
        activity: InMemoryUserActivityRepository,
        audit: InMemoryAuditLog,
    ) -> None:
        self.users = users
        self.tokens = tokens
        self.permissions = permissions
        self.activity = activity
        self.audit = audit

    async def __aenter__(self) -> Self:
        self._snapshot = [(fake, _containers(fake)) for fake in self._fakes()]
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        if exc_type is not None:
            for fake, containers in self._snapshot:
                vars(fake).update(containers)

    def _fakes(self) -> tuple[object, ...]:
        return (self.users, self.tokens, self.permissions, self.audit)


def _containers(fake: object) -> dict[str, dict | list]:
    return {
        name: value.copy() for name, value in vars(fake).items() if isinstance(value, dict | list)
    }
