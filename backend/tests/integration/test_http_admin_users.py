import pytest

from tests.integration.conftest import ADA, bearer, grant_admin, log_in

USERS = "/api/v1/admin/users"
GRACE = {
    "email": "grace@example.com",
    "password": "grace-pass",
    "first_name": "Grace",
    "last_name": "Hopper",
    "is_admin": False,
}
ROUTES = [
    ("post", USERS, GRACE),
    ("get", f"{USERS}/1", None),
    ("patch", f"{USERS}/1", {"first_name": "Augusta"}),
    ("delete", f"{USERS}/1", None),
]


@pytest.fixture
async def admin_login(session_factory, ada_login) -> dict:
    await grant_admin(session_factory, ada_login["user"]["id"])
    return ada_login


@pytest.fixture
async def grace(client, admin_login) -> dict:
    """Grace, created by the admin and signed in: her AdminUser body and her LoginResult."""
    response = await client.post(USERS, json=GRACE, headers=bearer(admin_login))
    assert response.status_code == 201, response.text
    return {"user": response.json(), "login": await log_in(client, GRACE["email"], "grace-pass")}


async def send(client, method: str, path: str, body: dict | None, headers: dict | None = None):
    return await client.request(method, path, json=body, headers=headers)


def error(response) -> tuple[int, str]:
    return response.status_code, response.json()["trace_id"]


@pytest.mark.parametrize(("method", "path", "body"), ROUTES)
async def test_admin_routes_need_a_bearer_token(client, method, path, body):
    assert error(await send(client, method, path, body)) == (401, "middleware-002")


@pytest.mark.parametrize(("method", "path", "body"), ROUTES)
async def test_admin_routes_are_forbidden_to_a_member(client, ada_login, method, path, body):
    response = await send(client, method, path, body, bearer(ada_login))

    assert error(response) == (403, "middleware-004")


async def test_an_admin_creates_a_user_who_can_sign_in(client, admin_login):
    response = await client.post(USERS, json=GRACE, headers=bearer(admin_login))

    assert response.status_code == 201
    created = response.json()
    assert set(created) == {
        "id",
        "email",
        "first_name",
        "last_name",
        "created_at",
        "updated_at",
        "is_admin",
        "protected",
    }
    assert (created["email"], created["first_name"], created["is_admin"]) == (
        "grace@example.com",
        "Grace",
        False,
    )
    assert (await log_in(client, "grace@example.com", "grace-pass"))["user"]["id"] == created["id"]


async def test_a_user_created_as_admin_may_list_the_users(client, admin_login):
    body = {**GRACE, "is_admin": True}
    created = (await client.post(USERS, json=body, headers=bearer(admin_login))).json()

    grace_login = await log_in(client, "grace@example.com", "grace-pass")
    assert created["is_admin"] is True
    assert (await client.get(USERS, headers=bearer(grace_login))).status_code == 200


async def test_creating_with_a_taken_email_is_409_users_001(client, admin_login):
    body = {**GRACE, "email": ADA["email"]}

    response = await client.post(USERS, json=body, headers=bearer(admin_login))

    assert error(response) == (409, "users-001")


WITHOUT_PASSWORD = {k: v for k, v in GRACE.items() if k != "password"}


@pytest.mark.parametrize("body", [{**GRACE, "email": "not-an-email"}, WITHOUT_PASSWORD])
async def test_an_invalid_new_user_is_422(client, admin_login, body):
    response = await client.post(USERS, json=body, headers=bearer(admin_login))

    assert error(response) == (422, "middleware-003")


async def test_an_admin_reads_a_user_with_the_admin_flag(client, admin_login, grace):
    response = await client.get(f"{USERS}/{grace['user']['id']}", headers=bearer(admin_login))
    own = await client.get(f"{USERS}/{admin_login['user']['id']}", headers=bearer(admin_login))

    assert (response.status_code, response.json()) == (200, grace["user"])
    assert own.json() == {**admin_login["user"], "is_admin": True, "protected": False}


@pytest.mark.parametrize(
    ("method", "body"), [("get", None), ("patch", {"first_name": "Nobody"}), ("delete", None)]
)
async def test_a_missing_user_is_404_users_005(client, admin_login, method, body):
    response = await send(client, method, f"{USERS}/999", body, bearer(admin_login))

    assert error(response) == (404, "users-005")


async def test_renaming_a_user_keeps_their_session(client, admin_login, grace):
    path = f"{USERS}/{grace['user']['id']}"
    changes = {"first_name": "Amazing", "last_name": "Grace", "is_admin": True}

    response = await client.patch(path, json=changes, headers=bearer(admin_login))

    assert response.status_code == 200
    assert {k: response.json()[k] for k in changes} == changes
    profile = await client.get("/api/v1/users/profile", headers=bearer(grace["login"]))
    assert (profile.status_code, profile.json()["first_name"]) == (200, "Amazing")


async def test_a_new_password_ends_the_session_and_replaces_the_old_one(client, admin_login, grace):
    path = f"{USERS}/{grace['user']['id']}"

    response = await client.patch(path, json={"password": "new-pass"}, headers=bearer(admin_login))

    assert response.status_code == 200
    profile = await client.get("/api/v1/users/profile", headers=bearer(grace["login"]))
    assert error(profile) == (401, "middleware-002")
    refresh = await client.post(
        "/api/v1/users/refresh-token", json={"refresh_token": grace["login"]["token"]["refresh"]}
    )
    assert error(refresh) == (401, "users-003")
    old = await client.post(
        "/api/v1/users/login", json={"email": GRACE["email"], "password": "grace-pass"}
    )
    assert error(old) == (400, "users-002")
    await log_in(client, GRACE["email"], "new-pass")


async def test_a_new_email_ends_the_session(client, admin_login, grace):
    path = f"{USERS}/{grace['user']['id']}"

    response = await client.patch(
        path, json={"email": "grace@navy.example"}, headers=bearer(admin_login)
    )

    assert response.json()["email"] == "grace@navy.example"
    profile = await client.get("/api/v1/users/profile", headers=bearer(grace["login"]))
    assert error(profile) == (401, "middleware-002")


async def test_editing_to_a_taken_email_is_409_users_001(client, admin_login, grace):
    path = f"{USERS}/{grace['user']['id']}"

    response = await client.patch(path, json={"email": ADA["email"]}, headers=bearer(admin_login))

    assert error(response) == (409, "users-001")


async def test_an_invalid_edit_is_422(client, admin_login, grace):
    path = f"{USERS}/{grace['user']['id']}"

    response = await client.patch(path, json={"email": "nope"}, headers=bearer(admin_login))

    assert error(response) == (422, "middleware-003")


async def test_an_admin_cannot_remove_their_own_admin_flag(client, admin_login):
    path = f"{USERS}/{admin_login['user']['id']}"

    response = await client.patch(path, json={"is_admin": False}, headers=bearer(admin_login))

    assert (response.status_code, response.json()) == (
        409,
        {"trace_id": "admin-002", "message": "an admin cannot remove their own admin permission"},
    )


async def test_an_admin_deletes_a_user_and_ends_their_session(client, admin_login, grace):
    path = f"{USERS}/{grace['user']['id']}"

    response = await client.delete(path, headers=bearer(admin_login))

    assert (response.status_code, response.content) == (204, b"")
    assert error(await client.get(path, headers=bearer(admin_login))) == (404, "users-005")
    profile = await client.get("/api/v1/users/profile", headers=bearer(grace["login"]))
    assert error(profile) == (401, "middleware-002")


async def test_an_admin_cannot_delete_themselves(client, admin_login):
    path = f"{USERS}/{admin_login['user']['id']}"

    response = await client.delete(path, headers=bearer(admin_login))

    assert (response.status_code, response.json()) == (
        409,
        {"trace_id": "admin-001", "message": "an admin cannot delete their own account"},
    )
    assert (await client.get(path, headers=bearer(admin_login))).status_code == 200
