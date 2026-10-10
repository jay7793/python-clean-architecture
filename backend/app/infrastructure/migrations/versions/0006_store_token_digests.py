"""store SHA-256 digests of session tokens instead of the tokens

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Open sessions end and each user signs in once more. Keeping them would mean decoding
    # every stored JWT in SQL for the refresh expiry the new column needs.
    op.execute("DELETE FROM user_tokens")
    op.drop_column("user_tokens", "access")
    op.drop_column("user_tokens", "refresh")
    op.add_column("user_tokens", sa.Column("access_hash", sa.String(64), nullable=False))
    op.add_column("user_tokens", sa.Column("refresh_hash", sa.String(64), nullable=False))
    op.add_column(
        "user_tokens",
        sa.Column("refresh_expires_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    # A digest cannot be turned back into its token, so every open session ends here too.
    op.execute("DELETE FROM user_tokens")
    op.drop_column("user_tokens", "refresh_expires_at")
    op.drop_column("user_tokens", "refresh_hash")
    op.drop_column("user_tokens", "access_hash")
    op.add_column("user_tokens", sa.Column("access", sa.Text, nullable=False))
    op.add_column("user_tokens", sa.Column("refresh", sa.Text, nullable=False))
