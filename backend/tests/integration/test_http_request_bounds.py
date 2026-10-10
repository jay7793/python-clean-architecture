"""Requests that could do nothing useful are refused before they reach the database."""

import pytest

from tests.integration.conftest import bearer, grant_admin

USERS = "/api/v1/admin/users"


@pytest.fixture
async def admin_headers(session_factory, ada_login) -> dict[str, str]:
    await grant_admin(session_factory, ada_login["user"]["id"])
    return bearer(ada_login)


@pytest.mark.parametrize("body", [{}, {"email": None, "is_admin": None}], ids=["empty", "nulls"])
async def test_an_edit_that_changes_no_field_is_422(client, admin_headers, ada_login, body):
    response = await client.patch(
        f"{USERS}/{ada_login['user']['id']}", json=body, headers=admin_headers
    )

    assert response.status_code == 422
    assert response.json()["trace_id"] == "middleware-003"
    assert "nothing to update" in response.json()["message"]


@pytest.mark.parametrize("path", [USERS, "/api/v1/admin/audit-logs"])
async def test_a_page_number_past_ten_thousand_is_422(client, admin_headers, path):
    last = await client.get(f"{path}?_page=10000", headers=admin_headers)
    beyond = await client.get(f"{path}?_page=10001", headers=admin_headers)

    assert last.status_code == 200
    assert (beyond.status_code, beyond.json()["trace_id"]) == (422, "middleware-003")
