import pytest

from tests.integration.conftest import ADA, bearer, grant_admin, log_in

AUDIT = "/api/v1/admin/audit-logs"
USERS = "/api/v1/admin/users"
GRACE = {
    "email": "grace@example.com",
    "password": "grace-pass",
    "first_name": "Grace",
    "last_name": "Hopper",
}
EVENT_FIELDS = {
    "id",
    "occurred_at",
    "action",
    "outcome",
    "actor_user_id",
    "actor_email",
    "target_user_id",
    "target_email",
    "trace_id",
    "ip",
    "details",
}


@pytest.fixture
async def admin_login(client, session_factory, ada_login) -> dict:
    """Ada as an admin, after a failed sign-in and a create, edit and delete of Grace."""
    await grant_admin(session_factory, ada_login["user"]["id"])
    failed = await client.post(
        "/api/v1/users/login", json={"email": GRACE["email"], "password": "guess"}
    )
    assert failed.status_code == 400
    headers = bearer(ada_login)
    grace = (await client.post(USERS, json=GRACE, headers=headers)).json()
    edit = {"last_name": "Brewster", "password": "next-pass"}
    assert (await client.patch(f"{USERS}/{grace['id']}", json=edit, headers=headers)).is_success
    assert (await client.delete(f"{USERS}/{grace['id']}", headers=headers)).is_success
    return ada_login


async def get_log(client, login: dict, **query) -> dict:
    response = await client.get(AUDIT, params=query, headers=bearer(login))
    assert response.status_code == 200, response.text
    return response.json()


def error(response) -> tuple[int, str]:
    return response.status_code, response.json()["trace_id"]


async def test_the_audit_log_needs_a_bearer_token(client):
    assert error(await client.get(AUDIT)) == (401, "middleware-002")


async def test_the_audit_log_is_forbidden_to_a_member(client, ada_login):
    assert error(await client.get(AUDIT, headers=bearer(ada_login))) == (403, "middleware-004")


async def test_an_admin_reads_every_event_newest_first(client, admin_login):
    body = await get_log(client, admin_login)

    assert [e["action"] for e in body["data"]] == [
        "admin.user_deleted",
        "admin.user_updated",
        "admin.user_created",
        "auth.login_failed",
        "auth.login",
        "user.registered",
    ]
    assert (body["page"], body["page_size"], body["total_page"], body["total_data"]) == (
        1,
        10,
        1,
        6,
    )
    assert all(set(event) == EVENT_FIELDS for event in body["data"])


async def test_events_carry_actor_target_ip_trace_id_and_details(client, admin_login):
    deleted, updated, created, failed, login, _ = (await get_log(client, admin_login))["data"]

    ada_id = admin_login["user"]["id"]
    assert (failed["outcome"], failed["actor_user_id"], failed["actor_email"]) == (
        "failure",
        None,
        "grace@example.com",
    )
    assert (failed["trace_id"], failed["ip"]) == ("users-002", "127.0.0.1")
    assert (login["actor_user_id"], login["outcome"], login["trace_id"]) == (
        ada_id,
        "success",
        None,
    )
    assert (created["actor_email"], created["target_email"], created["details"]) == (
        ADA["email"],
        "grace@example.com",
        {"is_admin": "false"},
    )
    assert updated["details"] == {"changed": "password, last_name"}
    assert (deleted["target_user_id"], deleted["target_email"], deleted["ip"]) == (
        created["target_user_id"],
        "grace@example.com",
        "127.0.0.1",
    )


async def test_filters_narrow_by_action_outcome_and_part_of_the_actor_email(client, admin_login):
    created = await get_log(client, admin_login, action="admin.user_created")
    failures = await get_log(client, admin_login, outcome="failure")
    by_grace = await get_log(client, admin_login, actor_email="GRACE@")
    ada_success = await get_log(client, admin_login, actor_email="ada", outcome="success")

    assert [e["action"] for e in created["data"]] == ["admin.user_created"]
    assert [e["action"] for e in failures["data"]] == ["auth.login_failed"]
    assert [e["action"] for e in by_grace["data"]] == ["auth.login_failed"]
    assert ada_success["total_data"] == 5


async def test_pages_split_the_log(client, admin_login):
    second = await get_log(client, admin_login, _page=2, _pageSize=4)

    assert [e["action"] for e in second["data"]] == ["auth.login", "user.registered"]
    assert (second["page"], second["total_page"], second["total_data"]) == (2, 2, 6)


async def test_the_log_holds_ten_events_a_page_without_page_size(client, admin_login):
    for _ in range(5):
        failed = await client.post(
            "/api/v1/users/login", json={"email": GRACE["email"], "password": "guess"}
        )
        assert failed.status_code == 400

    body = await get_log(client, admin_login)

    assert len(body["data"]) == 10
    assert (body["page"], body["page_size"], body["total_page"], body["total_data"]) == (
        1,
        10,
        2,
        11,
    )


@pytest.mark.parametrize(
    "query", [{"action": "auth.nope"}, {"outcome": "maybe"}, {"_page": 0}, {"_pageSize": 1001}]
)
async def test_invalid_filters_are_422(client, admin_login, query):
    response = await client.get(AUDIT, params=query, headers=bearer(admin_login))

    assert error(response) == (422, "middleware-003")


async def test_no_password_hash_or_token_appears_in_the_log(client, admin_login):
    fresh = await log_in(client)
    text = (await client.get(AUDIT, params={"_pageSize": 100}, headers=bearer(fresh))).text

    tokens = [*admin_login["token"].values(), *fresh["token"].values()]
    leaked = [ADA["password"], "grace-pass", "next-pass", "guess", "$2b$", *tokens]
    assert [secret for secret in leaked if secret in text] == []
