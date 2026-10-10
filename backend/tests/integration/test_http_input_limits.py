"""Every text a request stores is capped at the 255 characters its column holds."""

import pytest

from tests.integration.conftest import ADA, bearer, grant_admin

TOO_LONG_NAME = "x" * 256
TOO_LONG_EMAIL = f"{'a' * 64}@{'b' * 63}.{'c' * 63}.{'d' * 59}.com"
GRACE = {
    "email": "grace@example.com",
    "password": "grace-pass",
    "first_name": "Grace",
    "last_name": "Hopper",
}


@pytest.fixture
async def admin_headers(client, session_factory, ada_login) -> dict[str, str]:
    await grant_admin(session_factory, ada_login["user"]["id"])
    return bearer(ada_login)


@pytest.mark.parametrize(
    ("field", "value"),
    [("first_name", TOO_LONG_NAME), ("last_name", TOO_LONG_NAME), ("email", TOO_LONG_EMAIL)],
)
async def test_register_refuses_an_over_long_field(client, field, value):
    response = await client.post("/api/v1/users/register", json={**ADA, field: value})

    assert response.status_code == 422
    assert response.json()["trace_id"] == "users-001"
    assert response.json()["message"].startswith(f"{field}: ")


async def test_a_255_character_name_is_accepted(client):
    response = await client.post("/api/v1/users/register", json={**ADA, "first_name": "x" * 255})

    assert response.status_code == 201


@pytest.mark.parametrize(
    ("field", "value"),
    [("first_name", TOO_LONG_NAME), ("last_name", TOO_LONG_NAME), ("email", TOO_LONG_EMAIL)],
)
async def test_an_admin_create_refuses_an_over_long_field(client, admin_headers, field, value):
    response = await client.post(
        "/api/v1/admin/users", json={**GRACE, field: value}, headers=admin_headers
    )

    assert response.status_code == 422
    assert response.json()["trace_id"] == "middleware-003"
    assert response.json()["message"].startswith(f"{field}: ")


@pytest.mark.parametrize(
    ("field", "value"),
    [("first_name", TOO_LONG_NAME), ("last_name", TOO_LONG_NAME), ("email", TOO_LONG_EMAIL)],
)
async def test_an_admin_update_refuses_an_over_long_field(client, admin_headers, field, value):
    created = await client.post("/api/v1/admin/users", json=GRACE, headers=admin_headers)

    response = await client.patch(
        f"/api/v1/admin/users/{created.json()['id']}", json={field: value}, headers=admin_headers
    )

    assert response.status_code == 422
    assert response.json()["trace_id"] == "middleware-003"
    assert response.json()["message"].startswith(f"{field}: ")


@pytest.mark.parametrize("email", [TOO_LONG_EMAIL, "a" * 300], ids=["256-chars", "300-chars"])
async def test_a_login_with_an_over_long_email_is_refused_not_a_server_error(client, email):
    response = await client.post(
        "/api/v1/users/login", json={"email": email, "password": "s3cret-pass"}
    )

    assert response.status_code == 422
    assert response.json()["trace_id"] == "users-002"
    assert response.json()["message"].startswith("email: ")
