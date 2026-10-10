import re
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt

from app.domain.entities.token import TokenClaims, TokenKind

ALGORITHM = "HS256"


def issuer_slug(app_name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", app_name.lower()).strip("-")


class JwtTokenIssuer:
    def __init__(
        self,
        secret_key: str,
        app_name: str,
        lifetimes: dict[TokenKind, timedelta],
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._secret_key = secret_key
        self._issuer = issuer_slug(app_name)
        self._lifetimes = lifetimes
        self._now = now

    def issue(self, user_id: int, kind: TokenKind, expires_at: datetime | None = None) -> str:
        issued_at = self._now()
        payload = {
            "iss": self._issuer,
            "sub": kind.value,
            "uid": user_id,
            "iat": issued_at,
            "nbf": issued_at,
            "exp": expires_at or self.expires_at(kind),
            "jti": uuid.uuid4().hex,
        }
        return jwt.encode(payload, self._secret_key, algorithm=ALGORITHM)

    def expires_at(self, kind: TokenKind) -> datetime:
        return self._now() + self._lifetimes[kind]

    def parse(self, token: str, kind: TokenKind) -> TokenClaims | None:
        try:
            payload = jwt.decode(
                token,
                self._secret_key,
                algorithms=[ALGORITHM],
                issuer=self._issuer,
                subject=kind.value,
                options={"require": ["exp", "sub", "uid", "iss"]},
            )
        except jwt.PyJWTError:
            return None
        return TokenClaims(
            user_id=payload["uid"],
            kind=kind,
            expires_at=datetime.fromtimestamp(payload["exp"], UTC),
        )
