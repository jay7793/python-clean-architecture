import pytest

from tests.integration.conftest import bearer, log_in

UNAUTHENTICATED = {"trace_id": "middleware-002", "message": "invalid or expired access token"}


async def test_profile_is_a_get_that_returns_the_caller(client, ada_login):
    response = await client.get("/api/v1/users/profile", headers=bearer(ada_login))

    assert response.status_code == 200
    assert response.json() == ada_login["user"]


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer garbage"}, {"Authorization": "Basic YWRhOnB3"}],
    ids=["missing", "garbage", "wrong-scheme"],
)
async def test_profile_without_a_valid_bearer_token_is_401(client, ada_login, headers):
    response = await client.get("/api/v1/users/profile", headers=headers)

    assert (response.status_code, response.json()) == (401, UNAUTHENTICATED)


async def test_the_previous_access_token_stops_working_after_a_new_login(client, ada_login):
    await log_in(client)

    response = await client.get("/api/v1/users/profile", headers=bearer(ada_login))

    assert (response.status_code, response.json()) == (401, UNAUTHENTICATED)


async def test_a_refresh_token_is_not_accepted_as_a_bearer_token(client, ada_login):
    headers = {"Authorization": f"Bearer {ada_login['token']['refresh']}"}

    response = await client.get("/api/v1/users/profile", headers=headers)

    assert (response.status_code, response.json()) == (401, UNAUTHENTICATED)
