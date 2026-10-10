"""store each user's last sign-in on users

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The login writes this column in the same transaction as its audit event, so the admin
    # user list no longer searches audit_events and the index 0003 built for it goes.
    op.add_column("users", sa.Column("last_sign_in_at", sa.DateTime(timezone=True)))
    op.execute(
        """
        UPDATE users SET last_sign_in_at = sign_ins.latest
        FROM (
            SELECT actor_user_id, max(occurred_at) AS latest
            FROM audit_events
            WHERE action = 'auth.login'
            GROUP BY actor_user_id
        ) AS sign_ins
        WHERE users.id = sign_ins.actor_user_id
        """
    )
    op.drop_index("ix_audit_events_login_by_actor", table_name="audit_events")


def downgrade() -> None:
    op.create_index(
        "ix_audit_events_login_by_actor",
        "audit_events",
        ["actor_user_id", sa.text("occurred_at DESC")],
        postgresql_where=sa.text("action = 'auth.login'"),
    )
    op.drop_column("users", "last_sign_in_at")
