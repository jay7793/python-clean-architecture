import pytest

from app.domain.entities import AuthenticatedUser, NewAccount
from app.domain.errors import PermissionDenied, SelfDeletionRefused, UserNotFound


@pytest.fixture
async def grace_id(admin_usecase, admin) -> int:
    created = await admin_usecase.create(
        admin, NewAccount("grace@example.com", "pass", "Grace", "Hopper")
    )
    return created.user.id


async def test_an_admin_deletes_a_user(admin_usecase, admin, grace_id, users):
    await admin_usecase.delete(admin, grace_id)

    assert await users.get(grace_id) is None
    with pytest.raises(UserNotFound):
        await admin_usecase.get(admin, grace_id)


async def test_deleting_a_missing_user_fails(admin_usecase, admin):
    with pytest.raises(UserNotFound):
        await admin_usecase.delete(admin, 999)


async def test_an_admin_cannot_delete_themselves(admin_usecase, admin, users):
    with pytest.raises(SelfDeletionRefused):
        await admin_usecase.delete(admin, admin.user.id)
    assert await users.get(admin.user.id) == admin.user


async def test_only_an_admin_deletes_users(admin_usecase, admin, grace_id, users):
    member = AuthenticatedUser(await users.get(grace_id), None)

    with pytest.raises(PermissionDenied):
        await admin_usecase.delete(member, admin.user.id)
    assert await users.get(admin.user.id) == admin.user
