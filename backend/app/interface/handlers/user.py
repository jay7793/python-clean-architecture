from typing import Annotated

from fastapi import APIRouter, Depends

from app.domain.entities import AuthenticatedUser, RequestContext
from app.interface.handlers import schemas
from app.interface.handlers.auth import CurrentUser
from app.interface.handlers.context import request_context
from app.interface.handlers.errors import error_responses
from app.usecases.user import UserUsecase

LOGGED_OUT = {"content": {"application/json": {"schema": {"type": "null"}}}}


def user_router(users: UserUsecase, current_user: CurrentUser) -> APIRouter:
    router = APIRouter(prefix="/users", tags=["User"])
    Context = Annotated[RequestContext, Depends(request_context)]

    @router.post(
        "/register",
        status_code=201,
        response_model=schemas.User,
        operation_id="register",
        responses=error_responses(409, 422),
    )
    async def register(body: schemas.RegisterRequest, context: Context):
        return await users.register(
            body.email, body.password, body.first_name, body.last_name, context
        )

    @router.post(
        "/login",
        response_model=schemas.LoginResult,
        operation_id="login",
        responses=error_responses(400, 422),
    )
    async def login(body: schemas.LoginRequest, context: Context):
        return await users.login(body.email, body.password, context)

    @router.post(
        "/refresh-token",
        response_model=schemas.LoginResult,
        operation_id="refreshToken",
        responses=error_responses(401, 422),
    )
    async def refresh_token(body: schemas.RefreshTokenRequest, context: Context):
        return await users.refresh(body.refresh_token, context)

    @router.post(
        "/logout",
        response_model=None,
        operation_id="logout",
        responses={200: LOGGED_OUT, **error_responses(401, 422)},
    )
    async def logout(body: schemas.RefreshTokenRequest, context: Context) -> None:
        await users.logout(body.refresh_token, context)

    @router.get(
        "/profile",
        response_model=schemas.User,
        operation_id="getProfile",
        responses=error_responses(401),
    )
    async def get_profile(caller: Annotated[AuthenticatedUser, Depends(current_user)]):
        return caller.user

    return router
