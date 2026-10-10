from sqlalchemy import func, select

from app.interface.repositories.postgres.models import UserModel
from tests.integration.conftest import ADA


async def test_a_failed_audit_insert_rolls_back_the_registration(
    client, session_factory, refusing_audit_inserts
):
    response = await client.post("/api/v1/users/register", json=ADA)

    assert response.status_code == 500

    async with session_factory() as session:
        users = await session.scalar(select(func.count()).select_from(UserModel))
    assert users == 0
