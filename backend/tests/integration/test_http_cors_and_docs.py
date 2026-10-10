import pytest

PREFLIGHT = {
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
}


async def test_the_frontend_origin_may_call_the_api(client):
    response = await client.options(
        "/api/v1/users/login", headers={"Origin": "http://localhost:5173", **PREFLIGHT}
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize("origin", ["http://evil.example", "http://localhost:3001"])
async def test_other_origins_are_not_allowed(client, origin):
    response = await client.options("/api/v1/users/login", headers={"Origin": origin, **PREFLIGHT})

    assert "access-control-allow-origin" not in response.headers


async def test_swagger_ui_is_served_at_swagger(client):
    response = await client.get("/swagger")

    assert response.status_code == 200
    assert "swagger-ui" in response.text
