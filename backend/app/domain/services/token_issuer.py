from datetime import datetime
from typing import Protocol

from app.domain.entities.token import TokenClaims, TokenKind


class TokenIssuer(Protocol):
    def issue(self, user_id: int, kind: TokenKind, expires_at: datetime | None = None) -> str:
        """Sign a token. `expires_at` overrides the lifetime configured for `kind`."""
        ...

    def expires_at(self, kind: TokenKind) -> datetime:
        """When a token of `kind` issued now would expire."""
        ...

    def parse(self, token: str, kind: TokenKind) -> TokenClaims | None:
        """Return the claims of a valid, unexpired token of `kind`, else None."""
        ...
