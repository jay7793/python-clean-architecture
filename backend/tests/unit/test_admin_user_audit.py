import pytest

from app.domain.entities import (
    AccountChanges,
    AdminUser,
    AuditAction,
    AuditEvent,
    AuthenticatedUser,
    NewAccount,
    Outcome,
    RequestContext,
)
from app.domain.errors import PermissionDenied, SelfDeletionRefused

HERE = RequestContext(ip="198.51.100.4")


@pytest.fixture
async def grace(admin_usecase, admin) -> AdminUser:
    created = await admin_usecase.create(
        admin, NewAccount("grace@example.com", "grace-pass", "Grace", "Hopper"), HERE
    )
    return created


def last(audit) -> AuditEvent:
    assert audit.events, "nothing was recorded"
    return audit.events[-1]


def who(event: AuditEvent) -> tuple:
    return (event.actor_user_id, event.actor_email, event.target_user_id, event.target_email)


async def test_creating_a_user_records_the_admin_and_the_new_account(admin, grace, audit, clock):
    event = last(audit)
    assert (event.action, event.outcome, event.occurred_at, event.ip) == (
        AuditAction.ADMIN_USER_CREATED,
        Outcome.SUCCESS,
        clock.now,
        "198.51.100.4",
    )
    assert who(event) == (admin.user.id, "ada@example.com", grace.user.id, "grace@example.com")
    assert event.details == {"is_admin": "false"}


async def test_an_update_records_the_names_of_the_fields_that_changed(
    admin_usecase, admin, grace, audit
):
    changes = AccountChanges(
        email="grace@navy.example",
        password="new-pass",
        first_name="Grace",
        last_name="Brewster",
        is_admin=True,
    )

    await admin_usecase.update(admin, grace.user.id, changes, HERE)

    event = last(audit)
    assert (event.action, event.outcome, event.ip) == (
        AuditAction.ADMIN_USER_UPDATED,
        Outcome.SUCCESS,
        "198.51.100.4",
    )
    assert who(event) == (admin.user.id, "ada@example.com", grace.user.id, "grace@navy.example")
    assert event.details == {"changed": "email, password, last_name, is_admin"}


async def test_an_update_that_changes_nothing_records_no_field_names(
    admin_usecase, admin, grace, audit
):
    same = AccountChanges(email="grace@example.com", first_name="Grace", is_admin=False)

    await admin_usecase.update(admin, grace.user.id, same, HERE)

    assert (last(audit).action, last(audit).details) == (AuditAction.ADMIN_USER_UPDATED, {})


async def test_deleting_a_user_keeps_their_email_in_the_event(admin_usecase, admin, grace, audit):
    await admin_usecase.delete(admin, grace.user.id, HERE)

    event = last(audit)
    assert (event.action, event.outcome, event.ip) == (
        AuditAction.ADMIN_USER_DELETED,
        Outcome.SUCCESS,
        "198.51.100.4",
    )
    assert who(event) == (admin.user.id, "ada@example.com", grace.user.id, "grace@example.com")


async def test_refused_admin_calls_record_nothing(admin_usecase, admin, grace, audit):
    member = AuthenticatedUser(grace.user, None)
    recorded = len(audit.events)

    with pytest.raises(PermissionDenied):
        await admin_usecase.delete(member, admin.user.id, HERE)
    with pytest.raises(SelfDeletionRefused):
        await admin_usecase.delete(admin, admin.user.id, HERE)

    assert len(audit.events) == recorded


async def test_no_admin_event_holds_a_password_or_a_hash(admin_usecase, admin, grace, audit, users):
    await admin_usecase.update(admin, grace.user.id, AccountChanges(password="next-pass"), HERE)

    recorded = repr(audit.events)
    stored_hash = users.credentials["grace@example.com"].password_hash
    assert [s for s in ("grace-pass", "next-pass", stored_hash) if s in recorded] == []
