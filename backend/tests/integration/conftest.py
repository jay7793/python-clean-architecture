"""Integration tests run against a throwaway `goapp_test` database on the compose Postgres."""

import asyncio
import os
from collections.abc import AsyncIterator
from pathlib import Path

import asyncpg
import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.infrastructure.config import Settings
from app.infrastructure.main import create_app
from app.interface.repositories.postgres.unit_of_work import PostgresUnitOfWork

BACKEND_DIR = Path(__file__).resolve().parents[2]
TEST_DATABASE = "goapp_test"
TABLES = ("users", "user_tokens", "user_permissions", "audit_events")


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(
        _env_file=None,
        secret_key="integration-test-secret-of-32-bytes!",
        postgres_db_host=os.environ.get("GOAPP_POSTGRES_DB_HOST", "localhost"),
        postgres_db_port=int(os.environ.get("GOAPP_POSTGRES_DB_PORT", "5433")),
        postgres_db_name=TEST_DATABASE,
    )


async def _recreate_database(settings: Settings) -> None:
    connection = await asyncpg.connect(
        user=settings.postgres_db_user,
        password=settings.postgres_db_password,
        host=settings.postgres_db_host,
        port=settings.postgres_db_port,
        database="postgres",
    )
    try:
        await connection.execute(f'DROP DATABASE IF EXISTS "{TEST_DATABASE}" WITH (FORCE)')
        await connection.execute(f'CREATE DATABASE "{TEST_DATABASE}"')
    finally:
        await connection.close()


@pytest.fixture(scope="session")
def migrated_database(settings: Settings) -> Settings:
    asyncio.run(_recreate_database(settings))
    config = Config(BACKEND_DIR / "alembic.ini")
    config.attributes["url"] = settings.database_url
    command.upgrade(config, "head")
    return settings


@pytest.fixture
async def session_factory(migrated_database: Settings) -> AsyncIterator[async_sessionmaker]:
    engine = create_async_engine(migrated_database.database_url)
    async with engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
    yield async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
async def session(session_factory) -> AsyncIterator[AsyncSession]:
    """One session for a repository test: the repositories share it as a unit of work does."""
    async with session_factory() as session:
        yield session


AUDIT_DOWN = "audit store down"


@pytest.fixture
async def refusing_audit_inserts(session_factory) -> AsyncIterator[None]:
    """A trigger that fails every audit insert, standing in for an audit store that is down."""
    async with session_factory.begin() as session:
        await session.execute(
            text(
                f"""
                CREATE FUNCTION audit_down() RETURNS trigger AS $$
                BEGIN RAISE EXCEPTION '{AUDIT_DOWN}'; END;
                $$ LANGUAGE plpgsql
                """
            )
        )
        await session.execute(
            text(
                "CREATE TRIGGER audit_down BEFORE INSERT ON audit_events "
                "FOR EACH ROW EXECUTE FUNCTION audit_down()"
            )
        )
    yield
    async with session_factory.begin() as session:
        await session.execute(text("DROP TRIGGER audit_down ON audit_events"))
        await session.execute(text("DROP FUNCTION audit_down()"))


@pytest.fixture
async def client(session_factory, migrated_database: Settings) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(migrated_database)
    transport = httpx.ASGITransport(app=app)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as client,
    ):
        yield client


ADA = {
    "email": "ada@example.com",
    "password": "s3cret-pass",
    "first_name": "Ada",
    "last_name": "Lovelace",
}


async def log_in(
    client: httpx.AsyncClient, email: str = ADA["email"], password: str = ADA["password"]
) -> dict:
    response = await client.post("/api/v1/users/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


async def grant_admin(session_factory: async_sessionmaker, user_id: int) -> None:
    async with PostgresUnitOfWork(session_factory) as uow:
        await uow.permissions.grant(user_id, "admin")


def bearer(login: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {login['token']['access']}"}


@pytest.fixture
async def ada_login(client) -> dict:
    """Ada, registered and logged in: the LoginResult body."""
    assert (await client.post("/api/v1/users/register", json=ADA)).status_code == 201
    return await log_in(client)
