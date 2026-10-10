from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import (
    AuditAction,
    AuditDraft,
    AuditEvent,
    AuditFilters,
    Outcome,
    Page,
)
from app.interface.repositories.postgres.models import AuditEventModel


def _to_event(row: AuditEventModel) -> AuditEvent:
    return AuditEvent(
        id=row.id,
        occurred_at=row.occurred_at,
        action=AuditAction(row.action),
        outcome=Outcome(row.outcome),
        actor_user_id=row.actor_user_id,
        actor_email=row.actor_email,
        target_user_id=row.target_user_id,
        target_email=row.target_email,
        trace_id=row.trace_id,
        ip=row.ip,
        details=row.details,
    )


def _matching[T: tuple](statement: Select[T], filters: AuditFilters) -> Select[T]:
    if filters.action is not None:
        statement = statement.where(AuditEventModel.action == filters.action.value)
    if filters.outcome is not None:
        statement = statement.where(AuditEventModel.outcome == filters.outcome.value)
    if filters.actor_email:
        statement = statement.where(
            AuditEventModel.actor_email.icontains(filters.actor_email, autoescape=True)
        )
    return statement


class PostgresAuditLog:
    """Inserts and reads only. The table's trigger refuses UPDATE and DELETE as well."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def record(self, draft: AuditDraft) -> AuditEvent:
        row = AuditEventModel(
            occurred_at=draft.occurred_at,
            action=draft.action.value,
            outcome=draft.outcome.value,
            actor_user_id=draft.actor_user_id,
            actor_email=draft.actor_email,
            target_user_id=draft.target_user_id,
            target_email=draft.target_email,
            trace_id=draft.trace_id,
            ip=draft.ip,
            details=dict(draft.details),
        )
        self._session.add(row)
        await self._session.flush()
        return _to_event(row)

    async def page(self, filters: AuditFilters, page: int, page_size: int) -> Page[AuditEvent]:
        rows = (
            _matching(select(AuditEventModel), filters)
            .order_by(AuditEventModel.occurred_at.desc(), AuditEventModel.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        count = _matching(select(func.count()).select_from(AuditEventModel), filters)
        events = [_to_event(row) for row in (await self._session.scalars(rows)).all()]
        total = await self._session.scalar(count)
        return Page(events, page, page_size, total_data=total or 0)
