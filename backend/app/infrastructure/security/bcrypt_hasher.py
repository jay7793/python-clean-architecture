import asyncio

import bcrypt

from app.domain.services.password_hasher import MAX_PASSWORD_BYTES


class BcryptPasswordHasher:
    def __init__(self, rounds: int = 10) -> None:
        self._rounds = rounds

    async def hash(self, password: str) -> str:
        return await asyncio.to_thread(self._hash, password)

    async def verify(self, password: str, password_hash: str) -> bool:
        encoded = password.encode()
        if len(encoded) > MAX_PASSWORD_BYTES:
            return False
        return await asyncio.to_thread(bcrypt.checkpw, encoded, password_hash.encode())

    def _hash(self, password: str) -> str:
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt(self._rounds)).decode()
