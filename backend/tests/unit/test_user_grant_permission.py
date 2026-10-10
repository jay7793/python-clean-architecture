import pytest

from app.domain.entities import AuditAction
from app.domain.errors import UserNotFound


async def test_granting_by_email_gives_the_user_that_permission(usecase):
    await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")
    login = await usecase.login("ada@example.com", "s3cret-pass")

    granted = await usecase.grant_permission("ada@example.com", "admin")

    assert granted is True
    assert (await usecase.authenticate(login.token.access)).permission == "admin"


async def test_granting_a_permission_the_user_holds_changes_and_records_nothing(usecase, audit):
    await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")
    await usecase.grant_permission("ada@example.com", "admin")
    recorded = list(audit.events)

    granted = await usecase.grant_permission("ada@example.com", "admin")

    assert granted is False
    assert audit.events == recorded
    assert [e.action for e in recorded].count(AuditAction.ADMIN_PERMISSION_GRANTED) == 1


async def test_granting_to_an_unknown_email_fails(usecase):
    with pytest.raises(UserNotFound):
        await usecase.grant_permission("nobody@example.com", "admin")
