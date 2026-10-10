from fastapi import Request

from app.domain.entities import RequestContext


def request_context(request: Request) -> RequestContext:
    """The parts of a request the audit log keeps, as a plain value."""
    return RequestContext(ip=request.client.host if request.client else None)
