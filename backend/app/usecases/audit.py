from app.domain.entities import (
    AuditAction,
    AuditDraft,
    AuditEvent,
    AuditFilters,
    AuthenticatedUser,
    Outcome,
    Page,
    RequestContext,
    User,
)
from app.domain.errors import DomainError
from app.domain.repositories import AuditLog, UnitOfWorkFactory
from app.domain.services import Clock


class AuditTrail:
    """Stamps an event with the time and the request, then writes it to the given log.

    The log belongs to the caller's unit of work, so a failed write rolls back the change it
    describes: audit is never dropped silently.
    """

    def __init__(self, clock: Clock) -> None:
        self._clock = clock

    async def record(
        self,
        log: AuditLog,
        action: AuditAction,
        context: RequestContext,
        *,
        actor: User | None = None,
        actor_email: str | None = None,
        target: User | None = None,
        refused: DomainError | None = None,
        details: dict[str, str] | None = None,
    ) -> None:
        await log.record(
            AuditDraft(
                occurred_at=self._clock(),
                action=action,
                outcome=Outcome.SUCCESS if refused is None else Outcome.FAILURE,
                actor_user_id=actor.id if actor else None,
                actor_email=actor.email if actor else actor_email,
                target_user_id=target.id if target else None,
                target_email=target.email if target else None,
                trace_id=refused.trace_id if refused else None,
                ip=context.ip,
                details=details or {},
            )
        )


class AuditUsecase:
    def __init__(self, unit_of_work: UnitOfWorkFactory) -> None:
        self._unit_of_work = unit_of_work

    async def list_events(
        self, caller: AuthenticatedUser, filters: AuditFilters, page: int, page_size: int
    ) -> Page[AuditEvent]:
        caller.require_admin()
        async with self._unit_of_work() as uow:
            return await uow.audit.page(filters, page, page_size)
