import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import HTTPException, RequestValidationError
from fastapi.responses import JSONResponse

from app.domain.errors import (
    AccountProtected,
    DomainError,
    EmailAlreadyUsed,
    InvalidCredentials,
    LogoutRejected,
    PermissionDenied,
    RefreshRejected,
    SelfDeletionRefused,
    SelfDemotionRefused,
    SelfSessionRevokeRefused,
    Unauthenticated,
    UserNotFound,
)
from app.interface.handlers import schemas

ERROR_STATUSES: dict[type[DomainError], int] = {
    EmailAlreadyUsed: 409,
    InvalidCredentials: 400,
    RefreshRejected: 401,
    LogoutRejected: 401,
    Unauthenticated: 401,
    PermissionDenied: 403,
    UserNotFound: 404,
    SelfDeletionRefused: 409,
    SelfDemotionRefused: 409,
    SelfSessionRevokeRefused: 409,
    AccountProtected: 409,
}

VALIDATION_TRACE_IDS: dict[str, str] = {
    "register": "users-001",
    "login": "users-002",
    "refreshToken": "users-003",
    "logout": "users-004",
}
DEFAULT_VALIDATION_TRACE_ID = "middleware-003"

ROUTE_NOT_FOUND = schemas.ErrorResponse(trace_id="middleware-001", message="route not found")
METHOD_NOT_ALLOWED = schemas.ErrorResponse(trace_id="middleware-005", message="method not allowed")
UNEXPECTED = schemas.ErrorResponse(trace_id="internal-001", message="unexpected server error")

logger = logging.getLogger(__name__)


def error_responses(*statuses: int) -> dict[int | str, dict[str, Any]]:
    """OpenAPI `responses=` entries declaring the error envelope for each status."""
    return {status: {"model": schemas.ErrorResponse} for status in statuses}


def install_error_handlers(app: FastAPI) -> None:
    """Install before CORS: middleware added later wraps it, so a 500 still gets CORS headers."""
    app.add_exception_handler(DomainError, _domain_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(404, _route_not_found)
    app.add_exception_handler(405, _method_not_allowed)
    app.middleware("http")(_unexpected_error)


def _envelope(status: int, error: schemas.ErrorResponse) -> JSONResponse:
    return JSONResponse(status_code=status, content=error.model_dump())


async def _domain_error(_: Request, error: DomainError) -> JSONResponse:
    status = ERROR_STATUSES[type(error)]
    return _envelope(status, schemas.ErrorResponse(trace_id=error.trace_id, message=str(error)))


async def _validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
    operation_id = getattr(request.scope.get("route"), "operation_id", None)
    trace_id = VALIDATION_TRACE_IDS.get(operation_id, DEFAULT_VALIDATION_TRACE_ID)
    return _envelope(422, schemas.ErrorResponse(trace_id=trace_id, message=_describe(error)))


def _describe(error: RequestValidationError) -> str:
    first = error.errors()[0]
    if first["type"] == "json_invalid":
        # The location holds the character offset where parsing stopped.
        return f"body: invalid JSON at character {first['loc'][-1]}: {first['ctx']['error']}"
    field = ".".join(str(part) for part in first["loc"] if part != "body") or "body"
    return f"{field}: {first['msg']}"


async def _route_not_found(_: Request, __: Exception) -> JSONResponse:
    return _envelope(404, ROUTE_NOT_FOUND)


async def _method_not_allowed(_: Request, error: HTTPException) -> JSONResponse:
    response = _envelope(405, METHOD_NOT_ALLOWED)
    response.headers.update(error.headers or {})
    return response


async def _unexpected_error(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """A bug or an outage: log the traceback, and tell the client nothing about the cause."""
    try:
        return await call_next(request)
    except Exception:
        logger.exception("unexpected error on %s %s", request.method, request.url.path)
        return _envelope(500, UNEXPECTED)
