from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.domain.entities import AuthenticatedUser
from app.domain.errors import Unauthenticated
from app.usecases.user import UserUsecase

type CurrentUser = Callable[..., Awaitable[AuthenticatedUser]]

# auto_error=False so a missing header reaches our handler and gets the error envelope.
_bearer_scheme = HTTPBearer(auto_error=False)


def bearer_authentication(users: UserUsecase) -> CurrentUser:
    """A dependency that resolves the `Authorization: Bearer <access>` caller."""

    async def current_user(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    ) -> AuthenticatedUser:
        if credentials is None:
            raise Unauthenticated()
        return await users.authenticate(credentials.credentials)

    return current_user
