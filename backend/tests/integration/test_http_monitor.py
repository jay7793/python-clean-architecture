async def test_health_check_reports_the_app_name_and_version(client):
    response = await client.get("/api/v1/")

    assert response.status_code == 200
    assert response.json() == {"name": "GOLANG FIRST API APP", "version": "0.0.1"}


async def test_an_unknown_route_returns_the_error_envelope(client):
    response = await client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"trace_id": "middleware-001", "message": "route not found"}
