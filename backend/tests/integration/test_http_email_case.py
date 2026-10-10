"""An email names one account whatever its letter case."""

from tests.integration.conftest import ADA, bearer, grant_admin, log_in

MIXED_CASE = {**ADA, "email": "Ada@Example.COM"}
GRACE = {
    "email": "grace@example.com",
    "password": "grace-pass",
    "first_name": "Grace",
    "last_name": "Hopper",
}


async def test_register_stores_the_email_in_lower_case(client):
    response = await client.post("/api/v1/users/register", json=MIXED_CASE)

    assert response.status_code == 201
    assert response.json()["email"] == "ada@example.com"


async def test_login_accepts_the_email_in_any_case(client):
    await client.post("/api/v1/users/register", json=MIXED_CASE)

    for email in ("ada@example.com", "Ada@Example.COM", "ADA@EXAMPLE.COM"):
        login = await log_in(client, email)
        assert login["user"]["email"] == "ada@example.com"


async def test_the_same_email_in_another_case_is_already_used(client):
    await client.post("/api/v1/users/register", json=ADA)

    response = await client.post("/api/v1/users/register", json=MIXED_CASE)

    assert (response.status_code, response.json()["trace_id"]) == (409, "users-001")


async def test_an_admin_cannot_create_or_rename_onto_an_email_in_another_case(
    client, session_factory, ada_login
):
    await grant_admin(session_factory, ada_login["user"]["id"])
    headers = bearer(ada_login)
    grace = (await client.post("/api/v1/admin/users", json=GRACE, headers=headers)).json()

    created = await client.post(
        "/api/v1/admin/users", json={**GRACE, "email": "GRACE@example.com"}, headers=headers
    )
    renamed = await client.patch(
        f"/api/v1/admin/users/{grace['id']}", json={"email": "ADA@example.com"}, headers=headers
    )

    assert (created.status_code, renamed.status_code) == (409, 409)
