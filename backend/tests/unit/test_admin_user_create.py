from dataclasses import replace

import pytest

from app.domain.entities import AdminUser, AuthenticatedUser, NewAccount
from app.domain.errors import EmailAlreadyUsed, PermissionDenied

GRACE = NewAccount("grace@example.com", "s3cret-pass", "Grace", "Hopper")


async def test_an_admin_creates_a_user_with_a_hashed_password(admin_usecase, admin, users, hasher):
    created = await admin_usecase.create(admin, GRACE)

    assert created == AdminUser(await users.get(created.user.id), is_admin=False, protected=False)
    assert (created.user.email, created.user.first_name, created.user.last_name) == (
        "grace@example.com",
        "Grace",
        "Hopper",
    )
    stored = users.credentials["grace@example.com"].password_hash
    assert stored != "s3cret-pass"
    assert await hasher.verify("s3cret-pass", stored)


async def test_a_user_created_as_admin_holds_the_admin_permission(
    admin_usecase, admin, permissions
):
    created = await admin_usecase.create(admin, replace(GRACE, is_admin=True))

    assert created.is_admin is True
    assert (await permissions.find_by_user_id(created.user.id)).permission == "admin"


async def test_a_user_created_without_the_flag_has_no_permission(admin_usecase, admin, permissions):
    created = await admin_usecase.create(admin, GRACE)

    assert await permissions.find_by_user_id(created.user.id) is None


async def test_creating_with_a_taken_email_fails(admin_usecase, admin):
    with pytest.raises(EmailAlreadyUsed):
        await admin_usecase.create(admin, NewAccount("ada@example.com", "pw", "Ada", "Byron"))


async def test_only_an_admin_creates_users(admin_usecase, admin, users):
    member = AuthenticatedUser(admin.user, None)

    with pytest.raises(PermissionDenied):
        await admin_usecase.create(member, GRACE)
    assert await users.find_by_email("grace@example.com") is None
