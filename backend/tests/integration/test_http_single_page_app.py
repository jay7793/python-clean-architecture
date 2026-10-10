"""One origin for the dashboard and the API: GOAPP_STATIC_DIR serves the built frontend."""

from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest

from app.infrastructure.config import Settings
from app.infrastructure.main import create_app

INDEX = "<!doctype html><title>dashboard</title>"
ASSET = "console.log('app')"
ROUTE_NOT_FOUND = {"trace_id": "middleware-001", "message": "route not found"}


@pytest.fixture
def built_frontend(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text(INDEX)
    (tmp_path / "assets" / "app.js").write_text(ASSET)
    return tmp_path


@pytest.fixture
async def spa(migrated_database: Settings, built_frontend) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(migrated_database.model_copy(update={"static_dir": built_frontend}))
    transport = httpx.ASGITransport(app=app)
    async with (
        app.router.lifespan_context(app),
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as client,
    ):
        yield client


@pytest.mark.parametrize("path", ["/", "/users/7", "/users/7/edit", "/audit-log?page=2"])
async def test_every_page_route_answers_the_index(spa, path):
    response = await spa.get(path)

    assert (response.status_code, response.text) == (200, INDEX)
    assert response.headers["content-type"].startswith("text/html")


async def test_a_built_asset_is_served_as_itself(spa):
    response = await spa.get("/assets/app.js")

    assert (response.status_code, response.text) == (200, ASSET)
    assert "javascript" in response.headers["content-type"]


async def test_the_api_still_answers_under_api(spa):
    response = await spa.get("/api/v1/")

    assert response.status_code == 200
    assert set(response.json()) == {"name", "version"}


@pytest.mark.parametrize(
    ("method", "path"),
    [("get", "/api"), ("get", "/api/v1/nope"), ("post", "/api/v1/nope"), ("get", "/api/x.js")],
)
async def test_an_unknown_api_route_is_still_the_404_envelope(spa, method, path):
    response = await spa.request(method, path)

    assert (response.status_code, response.json()) == (404, ROUTE_NOT_FOUND)


async def test_a_wrong_method_on_an_api_route_is_still_405(spa):
    response = await spa.get("/api/v1/users/login")

    assert response.status_code == 405
    assert response.json()["trace_id"] == "middleware-005"


async def test_swagger_and_the_spec_are_not_shadowed(spa):
    swagger = await spa.get("/swagger")
    spec = await spa.get("/openapi.json")

    assert (swagger.status_code, "swagger-ui" in swagger.text) == (200, True)
    assert spec.status_code == 200
    assert all(path.startswith("/api/") for path in spec.json()["paths"])


async def test_without_a_static_dir_no_page_is_served(client):
    response = await client.get("/users/7")

    assert (response.status_code, response.json()) == (404, ROUTE_NOT_FOUND)


def test_a_static_dir_without_an_index_refuses_to_start(tmp_path):
    with pytest.raises(ValueError, match=r"index\.html"):
        Settings(_env_file=None, secret_key="x" * 32, static_dir=tmp_path)
