from typing import Protocol

from app.domain.entities import AuditDraft, AuditEvent, AuditFilters, Page


class AuditLog(Protocol):
    """Append-only: there is no way to change or remove an event once recorded."""

    async def record(self, draft: AuditDraft) -> AuditEvent: ...

    async def page(self, filters: AuditFilters, page: int, page_size: int) -> Page[AuditEvent]:
        """Newest first."""
        ...
