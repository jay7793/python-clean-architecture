from typing import Protocol

# bcrypt reads only the first 72 bytes, so a longer password is refused rather than truncated.
MAX_PASSWORD_BYTES = 72


class PasswordHasher(Protocol):
    """Hashing is deliberately slow; implementations keep it off the event loop."""

    async def hash(self, password: str) -> str: ...

    async def verify(self, password: str, password_hash: str) -> bool: ...
