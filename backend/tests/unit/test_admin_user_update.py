from datetime import UTC, datetime

import pytest

from app.domain.entities import AccountChanges, AdminUser, AuthenticatedUser, NewAccount, TokenPair
from app.domain.errors import (
    EmailAlreadyUsed,
    PermissionDenied,
    SelfDemotionRefused,
    UserNotFound,
)

SESSION = TokenPair("grace-access", "grace-refresh")
LATER = datetime(2030, 1, 1, tzinfo=UTC)


@pytest.fixture
async def grace(admin_usecase, admin, tokens) -> AdminUser:
    """Grace, created by the admin and signed in somewhere."""
    created = await admin_usecase.create(
        admin, NewAccount("grace@example.com", "old-pass", "Grace", "Hopper")
    )
    await tokens.upsert(created.user.id, SESSION, LATER)
    return created


async def test_an_admin_reads_a_user_with_the_admin_flag(admin_usecase, admin, grace):
    assert await admin_usecase.get(admin, grace.user.id) == grace
    assert (await admin_usecase.get(admin, admin.user.id)).is_admin is True


async def test_reading_a_missing_user_fails(admin_usecase, admin):
    with pytest.raises(UserNotFound):
        await admin_usecase.get(admin, 999)


async def test_renaming_keeps_the_session(admin_usecase, admin, grace, tokens):
    updated = await admin_usecase.update(
        admin, grace.user.id, AccountChanges(first_name="Amazing", last_name="Grace")
    )

    assert (updated.user.first_name, updated.user.last_name) == ("Amazing", "Grace")
    assert updated.user.email == "grace@example.com"
    assert await tokens.holds_access(grace.user.id, SESSION.access)


async def test_a_new_password_is_hashed_and_ends_the_session(
    admin_usecase, admin, grace, users, hasher, tokens
):
    await admin_usecase.update(admin, grace.user.id, AccountChanges(password="new-pass"))

    stored = users.credentials["grace@example.com"].password_hash
    assert stored != "new-pass"
    assert await hasher.verify("new-pass", stored)
    assert not await hasher.verify("old-pass", stored)
    assert not await tokens.holds_access(grace.user.id, SESSION.access)


async def test_a_new_email_ends_the_session(admin_usecase, admin, grace, tokens):
    updated = await admin_usecase.update(
        admin, grace.user.id, AccountChanges(email="grace@navy.example")
    )

    assert updated.user.email == "grace@navy.example"
    assert not await tokens.holds_access(grace.user.id, SESSION.access)


async def test_sending_the_same_email_keeps_the_session(admin_usecase, admin, grace, tokens):
    await admin_usecase.update(admin, grace.user.id, AccountChanges(email="grace@example.com"))

    assert await tokens.holds_access(grace.user.id, SESSION.access)


async def test_a_taken_email_is_refused(admin_usecase, admin, grace):
    with pytest.raises(EmailAlreadyUsed):
        await admin_usecase.update(admin, grace.user.id, AccountChanges(email="ada@example.com"))


async def test_the_admin_flag_grants_and_revokes_the_permission(
    admin_usecase, admin, grace, permissions
):
    promoted = await admin_usecase.update(admin, grace.user.id, AccountChanges(is_admin=True))
    assert promoted.is_admin is True
    assert (await permissions.find_by_user_id(grace.user.id)).permission == "admin"

    demoted = await admin_usecase.update(admin, grace.user.id, AccountChanges(is_admin=False))
    assert demoted.is_admin is False
    assert await permissions.find_by_user_id(grace.user.id) is None


async def test_an_admin_cannot_remove_their_own_admin_flag(admin_usecase, admin, permissions):
    with pytest.raises(SelfDemotionRefused):
        await admin_usecase.update(admin, admin.user.id, AccountChanges(is_admin=False))
    assert (await permissions.find_by_user_id(admin.user.id)).permission == "admin"


async def test_an_admin_can_rename_themselves(admin_usecase, admin):
    updated = await admin_usecase.update(
        admin, admin.user.id, AccountChanges(first_name="Augusta", is_admin=True)
    )

    assert (updated.user.first_name, updated.is_admin) == ("Augusta", True)


async def test_updating_a_missing_user_fails(admin_usecase, admin):
    with pytest.raises(UserNotFound):
        await admin_usecase.update(admin, 999, AccountChanges(first_name="Nobody"))


async def test_only_an_admin_reads_or_updates_users(admin_usecase, admin, grace):
    member = AuthenticatedUser(grace.user, None)

    with pytest.raises(PermissionDenied):
        await admin_usecase.get(member, admin.user.id)
    with pytest.raises(PermissionDenied):
        await admin_usecase.update(member, grace.user.id, AccountChanges(is_admin=True))
