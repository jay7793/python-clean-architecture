"""Each operation commits its change and its audit row together, or neither."""

from dataclasses import dataclass
from datetime import UTC, datetime

import pytest

from app.domain.entities import (
    ADMIN_PERMISSION,
    AccountChanges,
    AuthenticatedUser,
    LoginResult,
    NewAccount,
    NewUser,
    TokenPair,
    User,
    UserChanges,
)
from app.usecases.admin_user import AdminUserUsecase
from app.usecases.user import UserUsecase

LATER = datetime(2030, 1, 1, tzinfo=UTC)


class AuditDown(Exception):
    pass


@pytest.fixture
def failing_audit(audit, monkeypatch):
    async def refuse(_draft):
        raise AuditDown()

    monkeypatch.setattr(audit, "record", refuse)


def stored(users, tokens, permissions) -> tuple:
    return (
        dict(users.credentials),
        dict(users.sign_ins),
        dict(tokens.sessions),
        dict(permissions.permissions),
    )


@pytest.fixture
async def grace(users, tokens):
    grace = await users.add(NewUser("grace@example.com", "grace-hash", "Grace", "Hopper"))
    await tokens.upsert(grace.id, TokenPair("grace-access", "grace-refresh"), LATER)
    return grace


OPERATIONS = {
    "register": lambda s: s.users.register("cy@example.com", "s3cret-pass", "Cy", "Young"),
    "login": lambda s: s.users.login("ada@example.com", "ada-pass"),
    "refresh": lambda s: s.users.refresh(s.session.token.refresh),
    "logout": lambda s: s.users.logout(s.session.token.refresh),
    "admin create": lambda s: s.admin.create(
        s.caller, NewAccount("cy@example.com", "s3cret-pass", "Cy", "Young", is_admin=True)
    ),
    "admin update": lambda s: s.admin.update(
        s.caller,
        s.grace.id,
        AccountChanges(email="g@example.com", password="new-pass", is_admin=True),
    ),
    "admin delete": lambda s: s.admin.delete(s.caller, s.grace.id),
    "admin revoke session": lambda s: s.admin.revoke_session(s.caller, s.grace.id),
}


@dataclass
class Subjects:
    users: UserUsecase
    admin: AdminUserUsecase
    caller: AuthenticatedUser
    grace: User
    session: LoginResult


@pytest.mark.parametrize("operation", OPERATIONS.values(), ids=OPERATIONS.keys())
async def test_a_failed_audit_write_leaves_no_change_behind(
    operation, usecase, admin_usecase, admin, grace, users, tokens, permissions, hasher, request
):
    await users.update(admin.user.id, UserChanges(password_hash=await hasher.hash("ada-pass")))
    assert permissions.permissions[admin.user.id].permission == ADMIN_PERMISSION
    subjects = Subjects(
        usecase, admin_usecase, admin, grace, await usecase.login("ada@example.com", "ada-pass")
    )
    before = stored(users, tokens, permissions)
    request.getfixturevalue("failing_audit")

    with pytest.raises(AuditDown):
        await operation(subjects)

    assert stored(users, tokens, permissions) == before
