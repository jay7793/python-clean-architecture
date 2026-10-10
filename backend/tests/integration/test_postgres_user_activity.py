from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event, select

from app.domain.entities import NewUser, StoredSession, TokenPair, UserActivity
from app.interface.repositories.postgres.models import UserTokenModel
from app.interface.repositories.postgres.user import (
    PostgresUserActivityRepository,
    PostgresUserPermissionRepository,
    PostgresUserRepository,
    PostgresUserTokenRepository,
)

START = datetime(2026, 10, 10, 9, 0, tzinfo=UTC)


@pytest.fixture
def users(session) -> PostgresUserRepository:
    return PostgresUserRepository(session)


@pytest.fixture
def tokens(session) -> PostgresUserTokenRepository:
    return PostgresUserTokenRepository(session)


@pytest.fixture
def permissions(session) -> PostgresUserPermissionRepository:
    return PostgresUserPermissionRepository(session)


@pytest.fixture
def activity(session) -> PostgresUserActivityRepository:
    return PostgresUserActivityRepository(session)


def new_user(name: str) -> NewUser:
    return NewUser(f"{name}@example.com", "hashed-pw", name.title(), "Example")


def at(minute: int) -> datetime:
    return START + timedelta(minutes=minute)


async def stored_session(session, user_id: int) -> StoredSession:
    row = await session.scalar(select(UserTokenModel).where(UserTokenModel.user_id == user_id))
    return StoredSession(row.refresh_expires_at, row.updated_at)


async def test_each_user_comes_with_permission_session_and_latest_sign_in(
    session, users, tokens, permissions, activity
):
    ada = await users.add(new_user("ada"))
    grace = await users.add(new_user("grace"))
    await permissions.grant(ada.id, "admin")
    await tokens.upsert(ada.id, TokenPair("ada-access", "ada-refresh"), at(60))
    await users.record_sign_in(ada.id, at(1))
    await users.record_sign_in(ada.id, at(5))
    await users.record_sign_in(grace.id, at(9))

    page = await activity.page(1, 10)

    assert page.data == [
        UserActivity(ada, "admin", await stored_session(session, ada.id), at(5)),
        UserActivity(grace, None, None, at(9)),
    ]
    assert page.data[0].session.expires_at == at(60)
    assert (page.page, page.page_size, page.total_data) == (1, 10, 2)


async def test_a_user_who_never_signed_in_has_no_last_sign_in(users, activity):
    grace = await users.add(new_user("grace"))

    page = await activity.page(1, 10)

    assert page.data == [UserActivity(grace, None, None, None)]


async def test_users_are_ordered_by_id_and_paged(users, activity):
    added = [await users.add(new_user(name)) for name in ("cy", "ada", "bob")]

    first = await activity.page(1, 2)
    second = await activity.page(2, 2)
    beyond = await activity.page(3, 2)

    assert [a.user for a in first.data] == added[:2]
    assert [a.user for a in second.data] == added[2:]
    assert beyond.data == []
    assert [p.total_data for p in (first, second, beyond)] == [3, 3, 3]


async def test_a_page_of_ten_users_is_one_statement(
    session_factory, users, tokens, permissions, activity
):
    for n in range(12):
        user = await users.add(new_user(f"user{n}"))
        await permissions.grant(user.id, "admin" if n % 2 else "reader")
        await tokens.upsert(user.id, TokenPair(f"a{n}", f"r{n}"), at(60))
        await users.record_sign_in(user.id, at(n))
    statements: list[str] = []
    engine = session_factory.kw["bind"].sync_engine

    def count(_conn, _cursor, statement, *_args) -> None:
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    try:
        page = await activity.page(1, 10)
    finally:
        event.remove(engine, "before_cursor_execute", count)

    assert len(page.data) == 10
    assert all(a.session and a.permission and a.last_sign_in_at for a in page.data)
    assert page.total_data == 12
    assert len(statements) == 1, statements


async def test_one_user_comes_with_the_same_fields_as_their_page_row(
    users, tokens, permissions, activity
):
    await users.add(new_user("ada"))
    grace = await users.add(new_user("grace"))
    await permissions.grant(grace.id, "admin")
    await tokens.upsert(grace.id, TokenPair("grace-access", "grace-refresh"), at(60))
    await users.record_sign_in(grace.id, at(4))

    one = await activity.get(grace.id)

    assert one == (await activity.page(2, 1)).data[0]
    assert one.session.expires_at == at(60)
    assert await activity.get(999) is None
