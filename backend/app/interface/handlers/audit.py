from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.domain.entities import AuditAction, AuditFilters, AuthenticatedUser, Outcome
from app.interface.handlers import schemas
from app.interface.handlers.auth import CurrentUser
from app.interface.handlers.errors import error_responses
from app.interface.handlers.paging import PageNumber, PageSize
from app.usecases.audit import AuditUsecase


def audit_router(audit: AuditUsecase, current_user: CurrentUser) -> APIRouter:
    router = APIRouter(prefix="/admin/audit-logs", tags=["Admin"])

    @router.get(
        "",
        response_model=schemas.AuditLogPage,
        operation_id="listAuditLogs",
        responses=error_responses(401, 403, 422),
    )
    async def list_audit_logs(
        caller: Annotated[AuthenticatedUser, Depends(current_user)],
        page: PageNumber = 1,
        page_size: PageSize = 10,
        action: AuditAction | None = None,
        actor_email: Annotated[str | None, Query(description="Any part, any case")] = None,
        outcome: Outcome | None = None,
    ):
        filters = AuditFilters(action=action, actor_email=actor_email, outcome=outcome)
        return await audit.list_events(caller, filters, page, page_size)

    return router
