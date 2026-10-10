from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class TokenKind(StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


@dataclass(frozen=True, slots=True)
class TokenClaims:
    user_id: int
    kind: TokenKind
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class TokenPair:
    access: str
    refresh: str
