from collections.abc import AsyncIterator

import httpx
import pytest

from app.infrastructure.config import Settings
from app.infrastructure.main import create_app
from tests.integration.conftest import ADA, bearer, grant_admin, log_in

USERS = "/api/v1/admin/users"
PROTECTED = {
    "email": "grace@example.com",
    "password": "grace-pass",
    "first_name": "Grace",
    "last_name": "Hopper",
}
REFUSED = [
    ("patch", "", {"first_name": "Augusta"}),
    ("patch", "", {"password": "taken-over"}),
    ("delete", "", None),
    ("delete", "/session", None),
]


@pytest.fixture
async def guarded_client(
    session_factory, migrated_database: Settings
) -> AsyncIterator[httpx.AsyncClient]:
    settings = migrated_database.model_copy(update={"protected_emails": {"grace@example.com"}})
    app = create_app(settings)
    transport = httpx.ASGITransport(app=app)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as client,
    ):
        yield client


@pytest.fixture
async def admin(guarded_client, session_factory) -> dict:
    assert (await guarded_client.post("/api/v1/users/register", json=ADA)).status_code == 201
    login = await log_in(guarded_client)
    await grant_admin(session_factory, login["user"]["id"])
    return bearer(login)


@pytest.fixture
async def member(guarded_client) -> dict:
    """Grace, protected, registered and signed in: the LoginResult body."""
    response = await guarded_client.post("/api/v1/users/register", json=PROTECTED)
    assert response.status_code == 201, response.text
    return await log_in(guarded_client, PROTECTED["email"], PROTECTED["password"])


async def audit_total(client, admin) -> int:
    return (await client.get("/api/v1/admin/audit-logs", headers=admin)).json()["total_data"]


@pytest.mark.parametrize(("method", "suffix", "body"), REFUSED)
async def test_an_admin_cannot_change_a_protected_account(
    guarded_client, admin, member, method, suffix, body
):
    path = f"{USERS}/{member['user']['id']}{suffix}"
    recorded = await audit_total(guarded_client, admin)

    response = await guarded_client.request(method, path, json=body, headers=admin)

    assert (response.status_code, response.json()) == (
        409,
        {"trace_id": "admin-004", "message": "this demo account is protected"},
    )
    assert await audit_total(guarded_client, admin) == recorded
    profile = await guarded_client.get("/api/v1/users/profile", headers=bearer(member))
    assert (profile.status_code, profile.json()["first_name"]) == (200, "Grace")
    await log_in(guarded_client, PROTECTED["email"], PROTECTED["password"])


async def test_a_protected_account_still_refreshes_and_signs_out(guarded_client, member):
    refresh = {"refresh_token": member["token"]["refresh"]}
    refreshed = await guarded_client.post("/api/v1/users/refresh-token", json=refresh)
    assert refreshed.status_code == 200, refreshed.text

    logout = {"refresh_token": refreshed.json()["token"]["refresh"]}
    assert (await guarded_client.post("/api/v1/users/logout", json=logout)).status_code == 200


async def test_the_admin_views_say_which_account_is_protected(guarded_client, admin, member):
    member_id = member["user"]["id"]

    detail = await guarded_client.get(f"{USERS}/{member_id}", headers=admin)
    overview = await guarded_client.get(f"{USERS}/{member_id}/overview", headers=admin)
    listed = await guarded_client.get(USERS, headers=admin)

    assert (detail.json()["protected"], overview.json()["protected"]) == (True, True)
    assert {row["email"]: row["protected"] for row in listed.json()["data"]} == {
        ADA["email"]: False,
        PROTECTED["email"]: True,
    }
