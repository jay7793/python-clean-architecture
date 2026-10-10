import json
from pathlib import Path

import pytest

from app.infrastructure import export_openapi
from app.infrastructure.config import Settings
from app.infrastructure.main import create_app

COMMITTED_SPEC = Path(__file__).resolve().parents[3] / "openapi.json"

OPERATIONS = {
    ("get", "/api/v1/"): "healthCheck",
    ("post", "/api/v1/users/register"): "register",
    ("post", "/api/v1/users/login"): "login",
    ("post", "/api/v1/users/refresh-token"): "refreshToken",
    ("post", "/api/v1/users/logout"): "logout",
    ("get", "/api/v1/users/profile"): "getProfile",
    ("get", "/api/v1/admin/users"): "listAdminUsers",
    ("post", "/api/v1/admin/users"): "createUser",
    ("get", "/api/v1/admin/users/{user_id}"): "getAdminUser",
    ("patch", "/api/v1/admin/users/{user_id}"): "updateUser",
    ("delete", "/api/v1/admin/users/{user_id}"): "deleteUser",
    ("get", "/api/v1/admin/users/{user_id}/overview"): "getAdminUserOverview",
    ("delete", "/api/v1/admin/users/{user_id}/session"): "revokeUserSession",
    ("get", "/api/v1/admin/audit-logs"): "listAuditLogs",
}

SUCCESS = {
    "healthCheck": ("200", "Health"),
    "register": ("201", "User"),
    "login": ("200", "LoginResult"),
    "refreshToken": ("200", "LoginResult"),
    "getProfile": ("200", "User"),
    "listAdminUsers": ("200", "AdminUserOverviewPage"),
    "createUser": ("201", "AdminUser"),
    "getAdminUser": ("200", "AdminUser"),
    "getAdminUserOverview": ("200", "AdminUserOverview"),
    "updateUser": ("200", "AdminUser"),
    "listAuditLogs": ("200", "AuditLogPage"),
}

ERRORS = {
    "healthCheck": set(),
    "register": {"409", "422"},
    "login": {"400", "422"},
    "refreshToken": {"401", "422"},
    "logout": {"401", "422"},
    "getProfile": {"401"},
    "listAdminUsers": {"401", "403", "422"},
    "createUser": {"401", "403", "409", "422"},
    "getAdminUser": {"401", "403", "404", "422"},
    "getAdminUserOverview": {"401", "403", "404", "422"},
    "updateUser": {"401", "403", "404", "409", "422"},
    "deleteUser": {"401", "403", "404", "409", "422"},
    "revokeUserSession": {"401", "403", "404", "409", "422"},
    "listAuditLogs": {"401", "403", "422"},
}


def build_spec(name: str = "GOLANG FIRST API APP") -> dict:
    return create_app(
        Settings(_env_file=None, secret_key="openapi-test-placeholder-secret-key", name=name)
    ).openapi()


@pytest.fixture(scope="module")
def operations() -> dict[str, dict]:
    spec = build_spec()
    return {
        operation["operationId"]: operation
        for path in spec["paths"].values()
        for operation in path.values()
    }


def test_every_route_has_its_stable_operation_id():
    spec = build_spec()

    assert {
        (method, path): operation.get("operationId")
        for path, methods in spec["paths"].items()
        for method, operation in methods.items()
    } == OPERATIONS


@pytest.mark.parametrize(("operation_id", "expected"), SUCCESS.items())
def test_success_responses_name_their_schema(operations, operation_id, expected):
    status, schema = expected
    content = operations[operation_id]["responses"][status]["content"]["application/json"]

    assert content["schema"] == {"$ref": f"#/components/schemas/{schema}"}


@pytest.mark.parametrize("operation_id", ["deleteUser", "revokeUserSession"])
def test_deletes_document_204_without_a_body(operations, operation_id):
    assert operations[operation_id]["responses"]["204"] == {"description": "Successful Response"}


def test_logout_documents_a_null_body(operations):
    content = operations["logout"]["responses"]["200"]["content"]["application/json"]

    assert content["schema"] == {"type": "null"}


@pytest.mark.parametrize(("operation_id", "statuses"), ERRORS.items())
def test_error_statuses_document_the_error_envelope(operations, operation_id, statuses):
    responses = operations[operation_id]["responses"]
    errors = {status: r for status, r in responses.items() if status.startswith(("4", "5"))}

    assert set(errors) == statuses
    for response in errors.values():
        schema = response["content"]["application/json"]["schema"]
        assert schema == {"$ref": "#/components/schemas/ErrorResponse"}


def test_fastapis_default_validation_schemas_are_gone():
    schemas = build_spec()["components"]["schemas"]

    assert "HTTPValidationError" not in schemas
    assert "ValidationError" not in schemas


def test_the_committed_spec_matches_the_app_whatever_the_environment():
    assert json.loads(COMMITTED_SPEC.read_text()) == build_spec(name="Some Other Name")


def test_the_export_command_prints_the_spec(capsys):
    export_openapi.main()

    assert json.loads(capsys.readouterr().out) == build_spec()
