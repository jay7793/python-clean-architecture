"""index each user's sign-ins in audit_events

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The admin user list reads each user's newest auth.login through this index.
    op.create_index(
        "ix_audit_events_login_by_actor",
        "audit_events",
        ["actor_user_id", sa.text("occurred_at DESC")],
        postgresql_where=sa.text("action = 'auth.login'"),
    )


def downgrade() -> None:
    op.drop_index("ix_audit_events_login_by_actor", table_name="audit_events")
