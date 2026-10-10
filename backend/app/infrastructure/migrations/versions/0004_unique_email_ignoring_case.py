"""make users.email unique ignoring letter case

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Rows stored earlier keep their capitals; the index still refuses a second account whose
    # email differs only in case, and lookups by lower(email) use it.
    op.create_index("ux_users_email_lower", "users", [sa.text("lower(email)")], unique=True)
    op.drop_constraint("users_email_key", "users", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("users_email_key", "users", ["email"])
    op.drop_index("ux_users_email_lower", table_name="users")
