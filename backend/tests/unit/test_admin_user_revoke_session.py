from datetime import UTC, datetime

import pytest

from app.domain.entities import (
    AuditAction,
    AuthenticatedUser,
    NewAccount,
    Outcome,
    RequestContext,
    TokenPair,
)
from app.domain.errors import (
    PermissionDenied,
    RefreshRejected,
    SelfSessionRevokeRefused,
    Unauthenticated,
    UserNotFound,
)

HERE = RequestContext(ip="198.51.100.4")
LATER = datetime(2030, 1, 1, tzinfo=UTC)


@pytest.fixture
async def grace(admin_usecase, admin):
    created = await admin_usecase.create(
        admin, NewAccount("grace@example.com", "grace-pass", "Grace", "Hopper")
    )
    return created.user


async def test_a_revoked_user_can_neither_call_nor_refresh(admin_usecase, admin, grace, usecase):
    login = await usecase.login("grace@example.com", "grace-pass")

    await admin_usecase.revoke_session(admin, grace.id, HERE)

    with pytest.raises(Unauthenticated):
        await usecase.authenticate(login.token.access)
    with pytest.raises(RefreshRejected):
        await usecase.refresh(login.token.refresh)


async def test_revoking_records_the_admin_and_the_user(admin_usecase, admin, grace, audit, clock):
    await admin_usecase.revoke_session(admin, grace.id, HERE)

    event = audit.events[-1]
    assert (event.action, event.outcome, event.occurred_at, event.ip) == (
        AuditAction.ADMIN_SESSION_REVOKED,
        Outcome.SUCCESS,
        clock.now,
        "198.51.100.4",
    )
    assert (event.actor_user_id, event.actor_email, event.target_user_id, event.target_email) == (
        admin.user.id,
        "ada@example.com",
        grace.id,
        "grace@example.com",
    )
    assert event.details == {}


async def test_revoking_a_user_without_a_session_succeeds(admin_usecase, admin, grace, tokens):
    await admin_usecase.revoke_session(admin, grace.id)
    await admin_usecase.revoke_session(admin, grace.id)

    assert grace.id not in tokens.sessions


async def test_revoking_an_unknown_user_fails_and_records_nothing(admin_usecase, admin, audit):
    recorded = len(audit.events)

    with pytest.raises(UserNotFound):
        await admin_usecase.revoke_session(admin, 999)
    assert len(audit.events) == recorded


async def test_an_admin_cannot_revoke_their_own_session(admin_usecase, admin, tokens, audit):
    own = TokenPair("ada-access", "ada-refresh")
    await tokens.upsert(admin.user.id, own, LATER)
    recorded = len(audit.events)

    with pytest.raises(SelfSessionRevokeRefused) as refused:
        await admin_usecase.revoke_session(admin, admin.user.id)

    assert refused.value.trace_id == "admin-003"
    assert await tokens.holds_access(admin.user.id, own.access)
    assert len(audit.events) == recorded


async def test_only_an_admin_revokes_sessions(admin_usecase, admin, grace, tokens):
    own = TokenPair("ada-access", "ada-refresh")
    await tokens.upsert(admin.user.id, own, LATER)

    with pytest.raises(PermissionDenied):
        await admin_usecase.revoke_session(AuthenticatedUser(grace, None), admin.user.id)
    assert await tokens.holds_access(admin.user.id, own.access)
