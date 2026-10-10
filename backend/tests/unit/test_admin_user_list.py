from datetime import timedelta

import pytest

from app.domain.entities import (
    AuthenticatedUser,
    NewAccount,
    Role,
    SessionState,
    TokenKind,
    UserOverview,
)
from app.domain.errors import PermissionDenied, UserNotFound
from tests.unit.conftest import LIFETIMES

SIGNED_OUT = SessionState(active=False, last_active_at=None)


@pytest.fixture
async def grace(admin_usecase, admin):
    created = await admin_usecase.create(
        admin, NewAccount("grace@example.com", "grace-pass", "Grace", "Hopper")
    )
    return created.user


async def overview_of(admin_usecase, admin, user_id: int) -> UserOverview:
    page = await admin_usecase.list_users(admin, 1, 100)
    return next(o for o in page.data if o.user.id == user_id)


async def test_a_user_who_never_signed_in_is_a_signed_out_member(admin_usecase, admin, grace):
    page = await admin_usecase.list_users(admin, 1, 10)

    assert page.data == [
        UserOverview(admin.user, Role.ADMIN, SIGNED_OUT, None, protected=False),
        UserOverview(grace, Role.MEMBER, SIGNED_OUT, None, protected=False),
    ]
    assert page.total_data == 2


async def test_a_permission_other_than_admin_is_a_member(admin_usecase, admin, grace, permissions):
    await permissions.grant(grace.id, "reader")

    assert (await overview_of(admin_usecase, admin, grace.id)).role is Role.MEMBER


async def test_signing_in_opens_a_session_and_sets_the_last_sign_in(
    admin_usecase, admin, grace, usecase, clock
):
    signed_in_at = clock.now
    await usecase.login("grace@example.com", "grace-pass")

    overview = await overview_of(admin_usecase, admin, grace.id)

    assert overview.session == SessionState(active=True, last_active_at=signed_in_at)
    assert overview.last_sign_in_at == signed_in_at


async def test_a_refresh_moves_last_active_but_not_last_sign_in(
    admin_usecase, admin, grace, usecase, clock
):
    # The issuer checks expiry against the wall clock, so the past is where tokens are issued.
    clock.now -= timedelta(hours=3)
    signed_in_at = clock.now
    login = await usecase.login("grace@example.com", "grace-pass")
    clock.now += timedelta(hours=3)
    await usecase.refresh(login.token.refresh)

    overview = await overview_of(admin_usecase, admin, grace.id)

    assert overview.session == SessionState(active=True, last_active_at=clock.now)
    assert overview.last_sign_in_at == signed_in_at


async def test_an_expired_refresh_token_is_signed_out_but_keeps_last_active(
    admin_usecase, admin, grace, usecase, clock
):
    present = clock.now
    clock.now -= LIFETIMES[TokenKind.REFRESH] + timedelta(seconds=1)
    signed_in_at = clock.now
    await usecase.login("grace@example.com", "grace-pass")
    clock.now = present

    overview = await overview_of(admin_usecase, admin, grace.id)

    assert overview.session == SessionState(active=False, last_active_at=signed_in_at)
    assert overview.last_sign_in_at == signed_in_at


async def test_signing_out_ends_the_session_but_keeps_the_last_sign_in(
    admin_usecase, admin, grace, usecase, clock
):
    signed_in_at = clock.now
    login = await usecase.login("grace@example.com", "grace-pass")
    await usecase.logout(login.token.refresh)

    overview = await overview_of(admin_usecase, admin, grace.id)

    assert overview.session == SIGNED_OUT
    assert overview.last_sign_in_at == signed_in_at


async def test_the_list_is_paged(admin_usecase, admin, grace):
    page = await admin_usecase.list_users(admin, 2, 1)

    assert [o.user for o in page.data] == [grace]
    assert (page.page, page.page_size, page.total_data) == (2, 1, 2)


async def test_only_an_admin_lists_users(admin_usecase, grace):
    with pytest.raises(PermissionDenied):
        await admin_usecase.list_users(AuthenticatedUser(grace, None), 1, 10)


async def test_one_user_reads_as_their_row_in_the_list(admin_usecase, admin, grace, usecase):
    await usecase.login("grace@example.com", "grace-pass")

    one = await admin_usecase.overview(admin, grace.id)

    assert one == await overview_of(admin_usecase, admin, grace.id)
    assert one.session.active is True


async def test_an_unknown_user_has_no_overview(admin_usecase, admin):
    with pytest.raises(UserNotFound):
        await admin_usecase.overview(admin, 999)


async def test_only_an_admin_reads_an_overview(admin_usecase, grace):
    with pytest.raises(PermissionDenied):
        await admin_usecase.overview(AuthenticatedUser(grace, None), grace.id)
