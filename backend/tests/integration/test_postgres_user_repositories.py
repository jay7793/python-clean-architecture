from datetime import UTC, datetime

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy.ext.asyncio import create_async_engine

from app.domain.entities import NewUser, TokenPair, UserChanges, UserCredentials, UserPermission
from app.domain.errors import EmailAlreadyUsed
from app.interface.repositories.postgres.models import Base
from app.interface.repositories.postgres.user import (
    PostgresUserPermissionRepository,
    PostgresUserRepository,
    PostgresUserTokenRepository,
)

ADA = NewUser("ada@example.com", "hashed-pw", "Ada", "Lovelace")
EXPIRES = datetime(2030, 1, 1, tzinfo=UTC)


@pytest.fixture
def users(session) -> PostgresUserRepository:
    return PostgresUserRepository(session)


@pytest.fixture
def tokens(session) -> PostgresUserTokenRepository:
    return PostgresUserTokenRepository(session)


@pytest.fixture
def permissions(session) -> PostgresUserPermissionRepository:
    return PostgresUserPermissionRepository(session)


async def test_the_orm_models_match_the_migrated_schema(migrated_database):
    engine = create_async_engine(migrated_database.database_url)
    async with engine.connect() as connection:
        drift = await connection.run_sync(
            lambda sync: compare_metadata(MigrationContext.configure(sync), Base.metadata)
        )
    await engine.dispose()

    assert drift == []


async def test_an_added_user_can_be_found_by_email_and_id(users):
    added = await users.add(ADA)

    assert (added.email, added.first_name, added.last_name) == (
        "ada@example.com",
        "Ada",
        "Lovelace",
    )
    assert added.created_at is not None
    assert await users.find_by_email("ada@example.com") == UserCredentials(added, "hashed-pw")
    assert await users.get(added.id) == added


async def test_a_taken_email_raises_email_already_used(users):
    await users.add(ADA)

    with pytest.raises(EmailAlreadyUsed):
        await users.add(NewUser("ada@example.com", "other", "Ada", "Byron"))


async def test_unknown_users_are_none(users):
    assert await users.find_by_email("nobody@example.com") is None
    assert await users.get(404) is None


async def test_a_user_keeps_only_the_latest_token_pair(users, tokens):
    ada = await users.add(ADA)

    await tokens.upsert(ada.id, TokenPair("access-1", "refresh-1"), EXPIRES)
    await tokens.upsert(ada.id, TokenPair("access-2", "refresh-2"), EXPIRES)

    assert await tokens.holds_access(ada.id, "access-2") is True
    assert await tokens.holds_access(ada.id, "access-1") is False
    assert await tokens.rotate(ada.id, "refresh-1", TokenPair("a", "r")) is False


async def test_a_rotation_replaces_the_pair_only_for_the_stored_refresh(users, tokens):
    ada = await users.add(ADA)
    await tokens.upsert(ada.id, TokenPair("access-1", "refresh-1"), EXPIRES)

    assert await tokens.rotate(ada.id, "refresh-1", TokenPair("access-2", "refresh-2")) is True
    assert await tokens.holds_access(ada.id, "access-2") is True
    assert await tokens.revoke(ada.id, "refresh-1") is False
    assert await tokens.revoke(ada.id, "refresh-2") is True
    assert await tokens.holds_access(ada.id, "access-2") is False


async def test_deleting_the_token_pair_ends_the_session(users, tokens):
    ada = await users.add(ADA)
    await tokens.upsert(ada.id, TokenPair("access", "refresh"), EXPIRES)

    await tokens.delete_by_user_id(ada.id)

    assert await tokens.holds_access(ada.id, "access") is False


async def test_granting_a_permission_replaces_the_previous_one(users, permissions):
    ada = await users.add(ADA)
    assert await permissions.find_by_user_id(ada.id) is None

    await permissions.grant(ada.id, "editor")
    granted = await permissions.grant(ada.id, "admin")

    assert granted == UserPermission(ada.id, "admin")
    assert await permissions.find_by_user_id(ada.id) == UserPermission(ada.id, "admin")


async def test_an_update_writes_only_the_given_columns(session, users):
    ada = await users.add(ADA)
    # now() is the transaction's start, so the edit runs in a later transaction, as it would live.
    await session.commit()

    updated = await users.update(ada.id, UserChanges(first_name="Augusta", password_hash="new"))

    assert (updated.email, updated.first_name, updated.last_name) == (
        "ada@example.com",
        "Augusta",
        "Lovelace",
    )
    assert updated.updated_at > ada.updated_at
    assert await users.find_by_email("ada@example.com") == UserCredentials(updated, "new")


async def test_an_update_to_a_taken_email_raises_email_already_used(users):
    ada = await users.add(ADA)
    await users.add(NewUser("grace@example.com", "pw", "Grace", "Hopper"))

    with pytest.raises(EmailAlreadyUsed):
        await users.update(ada.id, UserChanges(email="grace@example.com"))
    assert (await users.get(ada.id)).email == "ada@example.com"


async def test_updating_or_deleting_a_missing_user_finds_nothing(users):
    assert await users.update(404, UserChanges(first_name="Nobody")) is None
    assert await users.delete(404) is False


async def test_deleting_a_user_takes_their_session_and_permission(users, tokens, permissions):
    ada = await users.add(ADA)
    grace = await users.add(NewUser("grace@example.com", "pw", "Grace", "Hopper"))
    for user in (ada, grace):
        await tokens.upsert(user.id, TokenPair(f"access-{user.id}", f"refresh-{user.id}"), EXPIRES)
        await permissions.grant(user.id, "admin")

    assert await users.delete(ada.id) is True

    assert await users.get(ada.id) is None
    assert await tokens.holds_access(ada.id, f"access-{ada.id}") is False
    assert await permissions.find_by_user_id(ada.id) is None
    assert await tokens.holds_access(grace.id, f"access-{grace.id}") is True
    assert await permissions.find_by_user_id(grace.id) is not None


async def test_revoking_removes_the_permission(users, permissions):
    ada = await users.add(ADA)
    await permissions.grant(ada.id, "admin")

    await permissions.revoke(ada.id)

    assert await permissions.find_by_user_id(ada.id) is None


async def test_an_email_matches_and_collides_in_any_case(users):
    # Rows stored before emails were normalised can hold capitals.
    added = await users.add(NewUser("Ada@Example.COM", "hashed-pw", "Ada", "Lovelace"))

    found = await users.find_by_email("ada@example.com")

    assert found == UserCredentials(added, "hashed-pw")
    with pytest.raises(EmailAlreadyUsed):
        await users.add(NewUser("ADA@example.com", "other", "Ada", "Byron"))


async def test_recording_a_sign_in_leaves_the_account_unedited(session, users):
    ada = await users.add(ADA)
    await session.commit()

    await users.record_sign_in(ada.id, datetime(2026, 10, 10, 9, 0, tzinfo=UTC))

    assert await users.get(ada.id) == ada
