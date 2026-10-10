import pytest

from app.domain.entities import AuditAction, AuditEvent, Outcome, RequestContext
from app.domain.errors import InvalidCredentials, LogoutRejected, RefreshRejected

HERE = RequestContext(ip="203.0.113.7")
PASSWORD = "s3cret-pass"


@pytest.fixture
async def ada(usecase):
    return await usecase.register("ada@example.com", PASSWORD, "Ada", "Lovelace", HERE)


def last(audit) -> AuditEvent:
    assert audit.events, "nothing was recorded"
    return audit.events[-1]


def who(event: AuditEvent) -> tuple:
    return (event.actor_user_id, event.actor_email, event.target_user_id, event.target_email)


async def test_registering_records_the_new_user_as_the_actor(ada, audit, clock):
    assert len(audit.events) == 1
    event = last(audit)
    assert (event.action, event.outcome) == (AuditAction.USER_REGISTERED, Outcome.SUCCESS)
    assert who(event) == (ada.id, "ada@example.com", None, None)
    assert (event.occurred_at, event.ip, event.trace_id, event.details) == (
        clock.now,
        "203.0.113.7",
        None,
        {},
    )


async def test_logging_in_records_who_signed_in_and_from_where(usecase, ada, audit):
    await usecase.login("ada@example.com", PASSWORD, HERE)

    event = last(audit)
    assert (event.action, event.outcome, event.ip) == (
        AuditAction.LOGIN,
        Outcome.SUCCESS,
        "203.0.113.7",
    )
    assert who(event) == (ada.id, "ada@example.com", None, None)


@pytest.mark.parametrize("email", ["ada@example.com", "nobody@example.com"])
async def test_a_failed_login_records_the_attempted_email_but_no_user_id(
    usecase, ada, audit, email
):
    with pytest.raises(InvalidCredentials):
        await usecase.login(email, "not-the-password", HERE)

    event = last(audit)
    assert (event.action, event.outcome, event.trace_id) == (
        AuditAction.LOGIN_FAILED,
        Outcome.FAILURE,
        "users-002",
    )
    assert who(event) == (None, email, None, None)
    assert event.ip == "203.0.113.7"


async def test_refreshing_records_the_user(usecase, ada, audit):
    login = await usecase.login("ada@example.com", PASSWORD)

    await usecase.refresh(login.token.refresh, HERE)

    event = last(audit)
    assert (event.action, event.outcome, event.ip) == (
        AuditAction.REFRESH,
        Outcome.SUCCESS,
        "203.0.113.7",
    )
    assert who(event) == (ada.id, "ada@example.com", None, None)


async def test_a_reused_refresh_token_is_recorded_against_its_user(usecase, ada, audit):
    login = await usecase.login("ada@example.com", PASSWORD)
    await usecase.refresh(login.token.refresh)

    with pytest.raises(RefreshRejected):
        await usecase.refresh(login.token.refresh, HERE)

    event = last(audit)
    assert (event.action, event.outcome, event.trace_id) == (
        AuditAction.REFRESH_REJECTED,
        Outcome.FAILURE,
        "users-003",
    )
    assert who(event) == (ada.id, "ada@example.com", None, None)


async def test_a_forged_refresh_token_is_recorded_without_an_actor(usecase, ada, audit):
    with pytest.raises(RefreshRejected):
        await usecase.refresh("not-a-token", HERE)

    event = last(audit)
    assert (event.action, event.trace_id, event.ip) == (
        AuditAction.REFRESH_REJECTED,
        "users-003",
        "203.0.113.7",
    )
    assert who(event) == (None, None, None, None)


async def test_logging_out_records_the_user(usecase, ada, audit):
    login = await usecase.login("ada@example.com", PASSWORD)

    await usecase.logout(login.token.refresh, HERE)

    event = last(audit)
    assert (event.action, event.outcome, event.ip) == (
        AuditAction.LOGOUT,
        Outcome.SUCCESS,
        "203.0.113.7",
    )
    assert who(event) == (ada.id, "ada@example.com", None, None)


async def test_a_rejected_logout_records_nothing(usecase, ada, audit):
    with pytest.raises(LogoutRejected):
        await usecase.logout("not-a-token", HERE)

    assert [e.action for e in audit.events] == [AuditAction.USER_REGISTERED]


async def test_granting_a_permission_records_the_target_and_the_permission(usecase, ada, audit):
    await usecase.grant_permission("ada@example.com", "admin")

    event = last(audit)
    assert (event.action, event.outcome, event.ip) == (
        AuditAction.ADMIN_PERMISSION_GRANTED,
        Outcome.SUCCESS,
        None,
    )
    assert who(event) == (None, None, ada.id, "ada@example.com")
    assert event.details == {"permission": "admin"}


async def test_no_event_holds_a_password_a_hash_or_a_token(usecase, ada, audit, users):
    login = await usecase.login("ada@example.com", PASSWORD, HERE)
    refreshed = await usecase.refresh(login.token.refresh, HERE)
    with pytest.raises(InvalidCredentials):
        await usecase.login("ada@example.com", "wrong-guess", HERE)
    await usecase.logout(refreshed.token.refresh, HERE)

    recorded = repr(audit.events)
    secrets = [
        PASSWORD,
        "wrong-guess",
        users.credentials["ada@example.com"].password_hash,
        login.token.access,
        login.token.refresh,
        refreshed.token.access,
        refreshed.token.refresh,
    ]
    assert len(audit.events) == 5
    assert [s for s in secrets if s in recorded] == []
