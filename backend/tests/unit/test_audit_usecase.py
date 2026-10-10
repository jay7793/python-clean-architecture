import pytest

from app.domain.entities import AuditAction, AuditFilters, AuthenticatedUser, Outcome
from app.domain.errors import InvalidCredentials, PermissionDenied
from app.usecases.audit import AuditUsecase


@pytest.fixture
async def history(usecase):
    """Mary registers and signs in, then someone fails to sign in as Grace."""
    await usecase.register("mary@example.com", "s3cret-pass", "Mary", "Somerville")
    await usecase.login("mary@example.com", "s3cret-pass")
    with pytest.raises(InvalidCredentials):
        await usecase.login("grace@example.com", "guess")


async def test_an_admin_pages_the_log_newest_first(unit_of_work, admin, history):
    page = await AuditUsecase(unit_of_work).list_events(admin, AuditFilters(), 1, 2)

    assert [e.action for e in page.data] == [AuditAction.LOGIN_FAILED, AuditAction.LOGIN]
    assert (page.page, page.page_size, page.total_data, page.total_page) == (1, 2, 3, 2)


async def test_the_filters_reach_the_log(unit_of_work, admin, history):
    failures = AuditFilters(outcome=Outcome.FAILURE)
    mary = AuditFilters(actor_email="MARY", action=AuditAction.LOGIN)

    failed = await AuditUsecase(unit_of_work).list_events(admin, failures, 1, 10)
    mary_logins = await AuditUsecase(unit_of_work).list_events(admin, mary, 1, 10)

    assert [e.actor_email for e in failed.data] == ["grace@example.com"]
    assert [(e.action, e.actor_email) for e in mary_logins.data] == [
        (AuditAction.LOGIN, "mary@example.com")
    ]


async def test_a_member_cannot_read_the_log(unit_of_work, admin, history):
    member = AuthenticatedUser(admin.user, None)

    with pytest.raises(PermissionDenied):
        await AuditUsecase(unit_of_work).list_events(member, AuditFilters(), 1, 10)
