from typing import ClassVar


class DomainError(Exception):
    """A business rule refused the request. The HTTP layer maps each subclass to a status.

    `trace_id` is the stable code clients and the audit log see for this refusal.
    """

    trace_id: ClassVar[str]
    default_message: ClassVar[str]

    def __init__(self) -> None:
        super().__init__(self.default_message)


class InvalidCredentials(DomainError):
    trace_id = "users-002"
    default_message = "invalid email or password"


class EmailAlreadyUsed(DomainError):
    trace_id = "users-001"
    default_message = "email already used"


class Unauthenticated(DomainError):
    trace_id = "middleware-002"
    default_message = "invalid or expired access token"


class RefreshRejected(DomainError):
    trace_id = "users-003"
    default_message = "invalid or expired refresh token"


class LogoutRejected(DomainError):
    trace_id = "users-004"
    default_message = "invalid or expired refresh token"


class PermissionDenied(DomainError):
    trace_id = "middleware-004"
    default_message = "admin permission required"


class UserNotFound(DomainError):
    trace_id = "users-005"
    default_message = "user not found"


class SelfDemotionRefused(DomainError):
    trace_id = "admin-002"
    default_message = "an admin cannot remove their own admin permission"


class SelfDeletionRefused(DomainError):
    trace_id = "admin-001"
    default_message = "an admin cannot delete their own account"


class SelfSessionRevokeRefused(DomainError):
    trace_id = "admin-003"
    default_message = "an admin cannot revoke their own session; sign out instead"


class AccountProtected(DomainError):
    trace_id = "admin-004"
    default_message = "this demo account is protected"
