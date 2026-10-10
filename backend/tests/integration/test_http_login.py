import pytest

ADA = {
    "email": "ada@example.com",
    "password": "s3cret-pass",
    "first_name": "Ada",
    "last_name": "Lovelace",
}
INVALID_LOGIN = {"trace_id": "users-002", "message": "invalid email or password"}


@pytest.fixture
async def ada(client) -> dict:
    return (await client.post("/api/v1/users/register", json=ADA)).json()


async def test_login_returns_the_user_and_a_token_pair(client, ada):
    response = await client.post(
        "/api/v1/users/login", json={"email": ADA["email"], "password": ADA["password"]}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user"] == ada
    assert set(body["token"]) == {"access", "refresh"}


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": "ada@example.com", "password": "wrong-pass"},
        {"email": "nobody@example.com", "password": "s3cret-pass"},
    ],
    ids=["wrong-password", "unknown-email"],
)
async def test_bad_credentials_get_one_indistinguishable_answer(client, ada, credentials):
    response = await client.post("/api/v1/users/login", json=credentials)

    assert (response.status_code, response.json()) == (400, INVALID_LOGIN)


async def test_a_malformed_login_is_422_with_the_login_trace_id(client):
    response = await client.post("/api/v1/users/login", json={"email": "ada@example.com"})

    assert response.status_code == 422
    assert response.json()["trace_id"] == "users-002"
