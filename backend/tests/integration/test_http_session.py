import asyncio
import hashlib

import pytest
from sqlalchemy import text

from tests.integration.conftest import bearer


async def refresh(client, token: str):
    return await client.post("/api/v1/users/refresh-token", json={"refresh_token": token})


async def logout(client, token: str):
    return await client.post("/api/v1/users/logout", json={"refresh_token": token})


async def test_refresh_returns_a_new_working_pair_and_retires_the_old_access(client, ada_login):
    response = await refresh(client, ada_login["token"]["refresh"])

    assert response.status_code == 200
    renewed = response.json()
    assert renewed["user"] == ada_login["user"]
    assert renewed["token"]["refresh"] != ada_login["token"]["refresh"]
    new_profile = await client.get("/api/v1/users/profile", headers=bearer(renewed))
    old_profile = await client.get("/api/v1/users/profile", headers=bearer(ada_login))
    assert (new_profile.status_code, old_profile.status_code) == (200, 401)


async def test_an_access_token_cannot_refresh(client, ada_login):
    response = await refresh(client, ada_login["token"]["access"])

    assert (response.status_code, response.json()) == (
        401,
        {"trace_id": "users-003", "message": "invalid or expired refresh token"},
    )


async def test_logout_answers_null_and_ends_the_session(client, ada_login):
    response = await logout(client, ada_login["token"]["refresh"])

    assert (response.status_code, response.json()) == (200, None)
    assert (await refresh(client, ada_login["token"]["refresh"])).status_code == 401
    profile = await client.get("/api/v1/users/profile", headers=bearer(ada_login))
    assert profile.status_code == 401


async def test_logging_out_twice_is_401_users_004(client, ada_login):
    await logout(client, ada_login["token"]["refresh"])

    response = await logout(client, ada_login["token"]["refresh"])

    assert (response.status_code, response.json()["trace_id"]) == (401, "users-004")


@pytest.mark.parametrize(
    ("path", "trace_id"),
    [("/api/v1/users/refresh-token", "users-003"), ("/api/v1/users/logout", "users-004")],
)
async def test_a_missing_refresh_token_is_422_with_the_endpoint_trace_id(client, path, trace_id):
    response = await client.post(path, json={})

    assert (response.status_code, response.json()["trace_id"]) == (422, trace_id)


async def test_two_concurrent_refreshes_with_one_token_let_exactly_one_through(client, ada_login):
    body = {"refresh_token": ada_login["token"]["refresh"]}

    responses = await asyncio.gather(
        client.post("/api/v1/users/refresh-token", json=body),
        client.post("/api/v1/users/refresh-token", json=body),
    )

    assert sorted(r.status_code for r in responses) == [200, 401]
    refused = next(r for r in responses if r.status_code == 401)
    assert refused.json()["trace_id"] == "users-003"


async def test_two_concurrent_logouts_with_one_token_let_exactly_one_through(client, ada_login):
    body = {"refresh_token": ada_login["token"]["refresh"]}

    responses = await asyncio.gather(
        client.post("/api/v1/users/logout", json=body),
        client.post("/api/v1/users/logout", json=body),
    )

    assert sorted(r.status_code for r in responses) == [200, 401]
    refused = next(r for r in responses if r.status_code == 401)
    assert refused.json()["trace_id"] == "users-004"


async def test_the_database_keeps_only_digests_of_the_session_tokens(session_factory, ada_login):
    token = ada_login["token"]
    async with session_factory() as session:
        row = (await session.execute(text("SELECT * FROM user_tokens"))).mappings().one()

    assert row["access_hash"] == hashlib.sha256(token["access"].encode()).hexdigest()
    assert row["refresh_hash"] == hashlib.sha256(token["refresh"].encode()).hexdigest()
    stored = " ".join(str(value) for value in row.values())
    assert token["access"] not in stored
    assert token["refresh"] not in stored
