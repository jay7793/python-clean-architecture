import pytest

from tests.integration.conftest import bearer, grant_admin, log_in

USERS = "/api/v1/admin/users"
GRACE = {
    "email": "grace@example.com",
    "password": "grace-pass",
    "first_name": "Grace",
    "last_name": "Hopper",
}
ROUTES = [("get", USERS), ("get", f"{USERS}/2/overview"), ("delete", f"{USERS}/2/session")]
SIGNED_OUT = {"active": False, "last_active_at": None}


@pytest.fixture
async def admin_login(session_factory, ada_login) -> dict:
    await grant_admin(session_factory, ada_login["user"]["id"])
    return ada_login


@pytest.fixture
async def grace(client, admin_login) -> dict:
    """Grace, created by the admin and never signed in: her AdminUser body."""
    response = await client.post(USERS, json=GRACE, headers=bearer(admin_login))
    assert response.status_code == 201, response.text
    return response.json()


def error(response) -> tuple[int, str | None]:
    return response.status_code, response.json().get("trace_id")


async def overview(client, admin_login, user_id: int) -> dict:
    response = await client.get(USERS, headers=bearer(admin_login))
    assert response.status_code == 200, response.text
    return next(row for row in response.json()["data"] if row["id"] == user_id)


@pytest.mark.parametrize(("method", "path"), ROUTES)
async def test_the_routes_need_a_bearer_token(client, method, path):
    assert error(await client.request(method, path)) == (401, "middleware-002")


@pytest.mark.parametrize(("method", "path"), ROUTES)
async def test_the_routes_are_forbidden_to_a_member(client, ada_login, method, path):
    response = await client.request(method, path, headers=bearer(ada_login))

    assert error(response) == (403, "middleware-004")


async def test_the_list_shows_role_session_and_last_sign_in(client, admin_login, grace):
    response = await client.get(USERS, headers=bearer(admin_login))

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["page"], body["page_size"], body["total_page"], body["total_data"]) == (
        1,
        10,
        1,
        2,
    )
    ada, listed_grace = body["data"]
    assert set(ada) == {
        "id",
        "email",
        "first_name",
        "last_name",
        "created_at",
        "updated_at",
        "role",
        "session",
        "last_sign_in_at",
        "protected",
    }
    assert (ada["id"], ada["role"], ada["session"]["active"]) == (
        admin_login["user"]["id"],
        "admin",
        True,
    )
    assert ada["session"]["last_active_at"] is not None
    assert ada["last_sign_in_at"] is not None
    assert (listed_grace["email"], listed_grace["role"], listed_grace["session"]) == (
        "grace@example.com",
        "member",
        SIGNED_OUT,
    )
    assert listed_grace["last_sign_in_at"] is None


async def test_signing_in_shows_in_the_list(client, admin_login, grace):
    await log_in(client, GRACE["email"], GRACE["password"])

    row = await overview(client, admin_login, grace["id"])

    assert row["session"]["active"] is True
    assert row["session"]["last_active_at"] is not None
    assert row["last_sign_in_at"] is not None


async def test_the_list_is_paged(client, admin_login, grace):
    response = await client.get(f"{USERS}?_page=2&_pageSize=1", headers=bearer(admin_login))

    assert response.status_code == 200, response.text
    body = response.json()
    assert [row["id"] for row in body["data"]] == [grace["id"]]
    assert (body["page"], body["page_size"], body["total_page"], body["total_data"]) == (
        2,
        1,
        2,
        2,
    )


async def test_the_list_holds_ten_users_a_page_without_page_size(client, admin_login):
    for n in range(10):
        user = {
            "email": f"user{n}@example.com",
            "password": "user-pass",
            "first_name": "U",
            "last_name": str(n),
        }
        assert (await client.post(USERS, json=user, headers=bearer(admin_login))).status_code == 201

    response = await client.get(USERS, headers=bearer(admin_login))

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["data"]) == 10
    assert (body["page"], body["page_size"], body["total_page"], body["total_data"]) == (
        1,
        10,
        2,
        11,
    )


async def test_revoking_signs_the_user_out(client, admin_login, grace):
    login = await log_in(client, GRACE["email"], GRACE["password"])

    response = await client.delete(f"{USERS}/{grace['id']}/session", headers=bearer(admin_login))

    assert (response.status_code, response.content) == (204, b"")
    profile = await client.get("/api/v1/users/profile", headers=bearer(login))
    assert error(profile) == (401, "middleware-002")
    refresh = await client.post(
        "/api/v1/users/refresh-token", json={"refresh_token": login["token"]["refresh"]}
    )
    assert error(refresh) == (401, "users-003")
    assert (await overview(client, admin_login, grace["id"]))["session"] == SIGNED_OUT


async def test_revoking_is_in_the_audit_log(client, admin_login, grace):
    await client.delete(f"{USERS}/{grace['id']}/session", headers=bearer(admin_login))

    response = await client.get(
        "/api/v1/admin/audit-logs?action=admin.session_revoked", headers=bearer(admin_login)
    )

    events = response.json()["data"]
    assert [(e["actor_email"], e["target_user_id"], e["target_email"]) for e in events] == [
        ("ada@example.com", grace["id"], "grace@example.com")
    ]


async def test_revoking_a_user_without_a_session_is_204(client, admin_login, grace):
    path = f"{USERS}/{grace['id']}/session"

    first = await client.delete(path, headers=bearer(admin_login))
    second = await client.delete(path, headers=bearer(admin_login))

    assert (first.status_code, second.status_code) == (204, 204)


async def test_revoking_an_unknown_user_is_404_users_005(client, admin_login):
    response = await client.delete(f"{USERS}/999/session", headers=bearer(admin_login))

    assert error(response) == (404, "users-005")


async def test_an_admin_cannot_revoke_their_own_session(client, admin_login):
    own = f"{USERS}/{admin_login['user']['id']}/session"

    response = await client.delete(own, headers=bearer(admin_login))

    assert error(response) == (409, "admin-003")
    profile = await client.get("/api/v1/users/profile", headers=bearer(admin_login))
    assert profile.status_code == 200


async def test_one_user_overview_matches_their_row(client, admin_login, grace):
    await log_in(client, GRACE["email"], GRACE["password"])

    response = await client.get(f"{USERS}/{grace['id']}/overview", headers=bearer(admin_login))

    assert response.status_code == 200, response.text
    assert response.json() == await overview(client, admin_login, grace["id"])
    assert response.json()["session"]["active"] is True


async def test_the_overview_follows_a_revoke(client, admin_login, grace):
    await log_in(client, GRACE["email"], GRACE["password"])
    await client.delete(f"{USERS}/{grace['id']}/session", headers=bearer(admin_login))

    response = await client.get(f"{USERS}/{grace['id']}/overview", headers=bearer(admin_login))

    assert response.json()["session"]["active"] is False


async def test_an_unknown_user_overview_is_404_users_005(client, admin_login):
    response = await client.get(f"{USERS}/999/overview", headers=bearer(admin_login))

    assert error(response) == (404, "users-005")
