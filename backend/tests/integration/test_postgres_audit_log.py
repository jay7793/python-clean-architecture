from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.domain.entities import AuditAction, AuditDraft, AuditEvent, AuditFilters, Outcome
from app.interface.repositories.postgres.audit import PostgresAuditLog

START = datetime(2026, 10, 10, 9, 0, tzinfo=UTC)


def draft(minute: int, action: AuditAction, email: str, **fields) -> AuditDraft:
    outcome = Outcome.FAILURE if action is AuditAction.LOGIN_FAILED else Outcome.SUCCESS
    return AuditDraft(
        occurred_at=START + timedelta(minutes=minute),
        action=action,
        outcome=outcome,
        actor_email=email,
        **fields,
    )


@pytest.fixture
def log(session) -> PostgresAuditLog:
    return PostgresAuditLog(session)


async def record_history(log: PostgresAuditLog) -> list[AuditEvent]:
    """Five events recorded out of time order, so ordering cannot come from insertion."""
    drafts = [
        draft(2, AuditAction.LOGIN, "ada@example.com", actor_user_id=1),
        draft(0, AuditAction.USER_REGISTERED, "ada@example.com", actor_user_id=1),
        draft(3, AuditAction.LOGIN_FAILED, "grace@example.com", trace_id="users-002"),
        draft(
            4,
            AuditAction.ADMIN_USER_UPDATED,
            "Ada@Example.com",
            actor_user_id=1,
            target_user_id=2,
            target_email="grace@example.com",
            ip="203.0.113.7",
            details={"changed": "email, password"},
        ),
        draft(1, AuditAction.LOGIN, "grace@example.com", actor_user_id=2),
    ]
    return [await log.record(d) for d in drafts]


async def test_a_recorded_event_comes_back_with_every_field_and_an_id(log):
    history = await record_history(log)

    page = await log.page(AuditFilters(action=AuditAction.ADMIN_USER_UPDATED), 1, 10)

    assert page.data == [history[3]]
    event = page.data[0]
    assert event.id > 0
    assert (event.occurred_at, event.action, event.outcome) == (
        START + timedelta(minutes=4),
        AuditAction.ADMIN_USER_UPDATED,
        Outcome.SUCCESS,
    )
    assert (event.actor_user_id, event.actor_email) == (1, "Ada@Example.com")
    assert (event.target_user_id, event.target_email) == (2, "grace@example.com")
    assert (event.ip, event.trace_id) == ("203.0.113.7", None)
    assert event.details == {"changed": "email, password"}


async def test_pages_run_newest_first_with_totals(log):
    await record_history(log)

    first = await log.page(AuditFilters(), 1, 2)
    last = await log.page(AuditFilters(), 3, 2)

    minutes = [int((e.occurred_at - START).total_seconds() // 60) for e in first.data]
    assert minutes == [4, 3]
    assert [int((e.occurred_at - START).total_seconds() // 60) for e in last.data] == [0]
    assert (first.total_data, first.total_page, last.page) == (5, 3, 3)


async def test_filters_combine_action_outcome_and_part_of_the_actor_email(log):
    history = await record_history(log)

    logins = await log.page(AuditFilters(action=AuditAction.LOGIN), 1, 10)
    failures = await log.page(AuditFilters(outcome=Outcome.FAILURE), 1, 10)
    ada = await log.page(AuditFilters(actor_email="ADA@"), 1, 10)
    ada_logins = await log.page(AuditFilters(action=AuditAction.LOGIN, actor_email="ada"), 1, 10)

    assert [e.actor_email for e in logins.data] == ["ada@example.com", "grace@example.com"]
    assert [(e.action, e.trace_id) for e in failures.data] == [
        (AuditAction.LOGIN_FAILED, "users-002")
    ]
    assert ada.total_data == 3
    assert [e.id for e in ada_logins.data] == [history[0].id]


async def test_like_wildcards_in_the_email_filter_match_literally(log):
    await record_history(log)

    assert (await log.page(AuditFilters(actor_email="%"), 1, 10)).total_data == 0
    assert (await log.page(AuditFilters(actor_email="_"), 1, 10)).total_data == 0


async def test_the_log_offers_no_way_to_change_or_remove_an_event():
    public = {name for name in dir(PostgresAuditLog) if not name.startswith("_")}

    assert public == {"record", "page"}


@pytest.mark.parametrize(
    "statement", ["UPDATE audit_events SET actor_email = 'x'", "DELETE FROM audit_events"]
)
async def test_the_database_refuses_updates_and_deletes(session_factory, session, log, statement):
    await record_history(log)
    await session.commit()

    with pytest.raises(DBAPIError, match="audit_events is append-only"):
        async with session_factory.begin() as session:
            await session.execute(text(statement))
