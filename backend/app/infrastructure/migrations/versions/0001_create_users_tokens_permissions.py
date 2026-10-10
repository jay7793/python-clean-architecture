"""create users, user_tokens and user_permissions

Revision ID: 0001
Revises:
Create Date: 2026-10-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def _owner() -> sa.Column:
    return sa.Column(
        "user_id",
        sa.Integer,
        sa.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(255), nullable=False),
        sa.Column("last_name", sa.String(255), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    # One row per user: a new login or refresh replaces the stored pair.
    op.create_table(
        "user_tokens",
        sa.Column("id", sa.Integer, primary_key=True),
        _owner(),
        sa.Column("access", sa.Text, nullable=False),
        sa.Column("refresh", sa.Text, nullable=False),
        _timestamp("updated_at"),
    )
    op.create_table(
        "user_permissions",
        sa.Column("id", sa.Integer, primary_key=True),
        _owner(),
        sa.Column("permission", sa.String(64), nullable=False),
        _timestamp("updated_at"),
    )


def downgrade() -> None:
    op.drop_table("user_permissions")
    op.drop_table("user_tokens")
    op.drop_table("users")
