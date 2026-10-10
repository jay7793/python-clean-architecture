from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class AuditAction(StrEnum):
    USER_REGISTERED = "user.registered"
    LOGIN = "auth.login"
    LOGIN_FAILED = "auth.login_failed"
    REFRESH = "auth.refresh"
    REFRESH_REJECTED = "auth.refresh_rejected"
    LOGOUT = "auth.logout"
    ADMIN_USER_CREATED = "admin.user_created"
    ADMIN_USER_UPDATED = "admin.user_updated"
    ADMIN_USER_DELETED = "admin.user_deleted"
    ADMIN_SESSION_REVOKED = "admin.session_revoked"
    ADMIN_PERMISSION_GRANTED = "admin.permission_granted"


class Outcome(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"


@dataclass(frozen=True, slots=True, kw_only=True)
class AuditDraft:
    """An event a usecase records. The emails are snapshots: they outlive a deleted user.

    `details` holds plain strings such as changed field names, never a password, hash or token.
    """

    occurred_at: datetime
    action: AuditAction
    outcome: Outcome
    actor_user_id: int | None = None
    actor_email: str | None = None
    target_user_id: int | None = None
    target_email: str | None = None
    trace_id: str | None = None
    ip: str | None = None
    details: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True, kw_only=True)
class AuditEvent(AuditDraft):
    """A recorded draft. The log assigns the id."""

    id: int


@dataclass(frozen=True, slots=True)
class AuditFilters:
    """None matches everything. `actor_email` matches any part of the email, ignoring case."""

    action: AuditAction | None = None
    actor_email: str | None = None
    outcome: Outcome | None = None


@dataclass(frozen=True, slots=True)
class RequestContext:
    """Where a call came from. The HTTP layer fills it; the CLI has none."""

    ip: str | None = None


NO_REQUEST = RequestContext()
