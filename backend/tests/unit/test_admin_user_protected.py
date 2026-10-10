from datetime import UTC, datetime

import pytest

from app.domain.entities import AccountChanges, NewAccount, TokenPair
from app.domain.errors import AccountProtected
from app.usecases.admin_user import AdminUserUsecase

LATER = datetime(2030, 1, 1, tzinfo=UTC)
GRACE_SESSION = TokenPair("grace-access", "grace-refresh")
EVERY_FIELD = [
    AccountChanges(email="augusta@example.com"),
    AccountChanges(password="new-pass"),
    AccountChanges(first_name="Augusta"),
    AccountChanges(last_name="King"),
    AccountChanges(is_admin=True),
]


@pytest.fixture
def guarded(unit_of_work, hasher, clock) -> AdminUserUsecase:
    """Grace's account is protected; the email is listed in another case than it is stored."""
    return AdminUserUsecase(unit_of_work, hasher, clock, frozenset({"grace@example.com"}))


@pytest.fixture
async def grace(guarded, admin, tokens):
    created = await guarded.create(
        admin, NewAccount("Grace@Example.com", "grace-pass", "Grace", "Hopper")
    )
    await tokens.upsert(created.user.id, GRACE_SESSION, LATER)
    return created.user


@pytest.mark.parametrize("changes", EVERY_FIELD)
async def test_a_protected_account_refuses_any_edit(
    guarded, admin, grace, changes, users, permissions, tokens, audit
):
    recorded = len(audit.events)

    with pytest.raises(AccountProtected) as refused:
        await guarded.update(admin, grace.id, changes)

    assert (refused.value.trace_id, str(refused.value)) == (
        "admin-004",
        "this demo account is protected",
    )
    assert await users.get(grace.id) == grace
    assert await permissions.find_by_user_id(grace.id) is None
    assert await tokens.holds_access(grace.id, GRACE_SESSION.access)
    assert len(audit.events) == recorded


async def test_a_protected_account_refuses_deletion(guarded, admin, grace, users, audit):
    recorded = len(audit.events)

    with pytest.raises(AccountProtected):
        await guarded.delete(admin, grace.id)

    assert await users.get(grace.id) == grace
    assert len(audit.events) == recorded


async def test_a_protected_account_keeps_its_session(guarded, admin, grace, tokens, audit):
    recorded = len(audit.events)

    with pytest.raises(AccountProtected):
        await guarded.revoke_session(admin, grace.id)

    assert await tokens.holds_access(grace.id, GRACE_SESSION.access)
    assert len(audit.events) == recorded


async def test_other_accounts_stay_editable(guarded, admin, grace, users):
    other = await guarded.create(admin, NewAccount("alan@example.com", "pass", "Alan", "Turing"))

    updated = await guarded.update(admin, other.user.id, AccountChanges(first_name="Alonzo"))
    await guarded.revoke_session(admin, other.user.id)
    await guarded.delete(admin, other.user.id)

    assert (updated.user.first_name, updated.protected) == ("Alonzo", False)
    assert await users.get(other.user.id) is None


async def test_an_admin_sees_which_accounts_are_protected(guarded, admin, grace):
    listed = {o.user.id: o.protected for o in (await guarded.list_users(admin, 1, 10)).data}

    assert listed == {admin.user.id: False, grace.id: True}
    assert (await guarded.overview(admin, grace.id)).protected is True
    assert (await guarded.get(admin, grace.id)).protected is True
    assert (await guarded.get(admin, admin.user.id)).protected is False
