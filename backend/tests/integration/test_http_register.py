import pytest

ADA = {
    "email": "ada@example.com",
    "password": "s3cret-pass",
    "first_name": "Ada",
    "last_name": "Lovelace",
}


async def test_register_returns_201_and_the_user_without_a_password(client):
    response = await client.post("/api/v1/users/register", json=ADA)

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"id", "email", "first_name", "last_name", "created_at", "updated_at"}
    assert (body["email"], body["first_name"], body["last_name"]) == (
        "ada@example.com",
        "Ada",
        "Lovelace",
    )


async def test_a_used_email_is_409_not_a_raw_database_error(client):
    await client.post("/api/v1/users/register", json=ADA)

    response = await client.post("/api/v1/users/register", json={**ADA, "first_name": "Again"})

    assert response.status_code == 409
    assert response.json() == {"trace_id": "users-001", "message": "email already used"}


async def test_a_top_level_domain_longer_than_four_letters_is_accepted(client):
    response = await client.post(
        "/api/v1/users/register", json={**ADA, "email": "ada@example.museum"}
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    "invalid",
    [{"email": "not-an-email"}, {"password": "x" * 73}, {"first_name": None}],
    ids=["email", "password-over-72-bytes", "missing-name"],
)
async def test_invalid_input_is_422_with_the_register_trace_id(client, invalid):
    response = await client.post("/api/v1/users/register", json={**ADA, **invalid})

    assert response.status_code == 422
    assert response.json()["trace_id"] == "users-001"
