"""Every failure answers with the error envelope, never a framework default."""

import logging

import pytest

from tests.integration.conftest import ADA, AUDIT_DOWN

UNEXPECTED = {"trace_id": "internal-001", "message": "unexpected server error"}


async def test_an_unexpected_error_is_a_500_envelope_and_logs_the_traceback(
    client, refusing_audit_inserts, caplog
):
    with caplog.at_level(logging.ERROR):
        response = await client.post(
            "/api/v1/users/register", json=ADA, headers={"Origin": "http://localhost:5173"}
        )

    assert (response.status_code, response.json()) == (500, UNEXPECTED)
    # The browser can read the envelope only if the 500 carries the CORS headers too.
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert AUDIT_DOWN not in response.text
    logged = [r for r in caplog.records if r.exc_info]
    assert len(logged) == 1
    assert "POST /api/v1/users/register" in logged[0].getMessage()
    assert AUDIT_DOWN in str(logged[0].exc_info[1])


async def test_a_wrong_method_is_a_405_envelope_naming_the_allowed_ones(client):
    response = await client.delete("/api/v1/")

    assert response.status_code == 405
    assert response.json() == {"trace_id": "middleware-005", "message": "method not allowed"}
    assert response.headers["allow"] == "GET"


@pytest.mark.parametrize(
    ("body", "message"),
    [
        ('{"email": "ada@example.com",', "body: invalid JSON at character 28: Expecting"),
        ("", "body: Field required"),
    ],
    ids=["malformed", "empty"],
)
async def test_an_unreadable_body_gets_a_readable_message(client, body, message):
    response = await client.post(
        "/api/v1/users/login", content=body, headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 422
    assert response.json()["trace_id"] == "users-002"
    assert response.json()["message"].startswith(message)
