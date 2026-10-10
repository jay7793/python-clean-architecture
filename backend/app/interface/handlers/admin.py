from typing import Annotated

from fastapi import APIRouter, Depends

from app.domain.entities import (
    AccountChanges,
    AdminUser,
    AuthenticatedUser,
    NewAccount,
    Page,
    RequestContext,
    UserOverview,
)
from app.interface.handlers import schemas
from app.interface.handlers.auth import CurrentUser
from app.interface.handlers.context import request_context
from app.interface.handlers.errors import error_responses
from app.interface.handlers.paging import PageNumber, PageSize
from app.usecases.admin_user import AdminUserUsecase


def _admin_user(entity: AdminUser) -> schemas.AdminUser:
    return schemas.AdminUser(
        **schemas.User.model_validate(entity.user).model_dump(),
        is_admin=entity.is_admin,
        protected=entity.protected,
    )


def _overview(found: UserOverview) -> schemas.AdminUserOverview:
    return schemas.AdminUserOverview(
        **schemas.User.model_validate(found.user).model_dump(),
        role=found.role,
        session=schemas.SessionState.model_validate(found.session),
        last_sign_in_at=found.last_sign_in_at,
        protected=found.protected,
    )


def _overview_page(found: Page[UserOverview]) -> schemas.AdminUserOverviewPage:
    return schemas.AdminUserOverviewPage(
        data=[_overview(o) for o in found.data],
        page=found.page,
        page_size=found.page_size,
        total_page=found.total_page,
        total_data=found.total_data,
    )


def admin_router(admin: AdminUserUsecase, current_user: CurrentUser) -> APIRouter:
    router = APIRouter(prefix="/admin/users", tags=["Admin"])
    Caller = Annotated[AuthenticatedUser, Depends(current_user)]
    Context = Annotated[RequestContext, Depends(request_context)]

    @router.get(
        "",
        response_model=schemas.AdminUserOverviewPage,
        operation_id="listAdminUsers",
        responses=error_responses(401, 403, 422),
    )
    async def list_admin_users(
        caller: Caller,
        page: PageNumber = 1,
        page_size: PageSize = 10,
    ):
        return _overview_page(await admin.list_users(caller, page, page_size))

    @router.post(
        "",
        status_code=201,
        response_model=schemas.AdminUser,
        operation_id="createUser",
        responses=error_responses(401, 403, 409, 422),
    )
    async def create_user(body: schemas.CreateUserRequest, caller: Caller, context: Context):
        return _admin_user(await admin.create(caller, NewAccount(**body.model_dump()), context))

    @router.get(
        "/{user_id}",
        response_model=schemas.AdminUser,
        operation_id="getAdminUser",
        responses=error_responses(401, 403, 404, 422),
    )
    async def get_admin_user(user_id: int, caller: Caller):
        return _admin_user(await admin.get(caller, user_id))

    @router.get(
        "/{user_id}/overview",
        response_model=schemas.AdminUserOverview,
        operation_id="getAdminUserOverview",
        responses=error_responses(401, 403, 404, 422),
    )
    async def get_admin_user_overview(user_id: int, caller: Caller):
        return _overview(await admin.overview(caller, user_id))

    @router.patch(
        "/{user_id}",
        response_model=schemas.AdminUser,
        operation_id="updateUser",
        responses=error_responses(401, 403, 404, 409, 422),
    )
    async def update_user(
        user_id: int, body: schemas.UpdateUserRequest, caller: Caller, context: Context
    ):
        changes = AccountChanges(**body.model_dump())
        return _admin_user(await admin.update(caller, user_id, changes, context))

    @router.delete(
        "/{user_id}",
        status_code=204,
        operation_id="deleteUser",
        responses=error_responses(401, 403, 404, 409, 422),
    )
    async def delete_user(user_id: int, caller: Caller, context: Context) -> None:
        await admin.delete(caller, user_id, context)

    @router.delete(
        "/{user_id}/session",
        status_code=204,
        operation_id="revokeUserSession",
        responses=error_responses(401, 403, 404, 409, 422),
    )
    async def revoke_user_session(user_id: int, caller: Caller, context: Context) -> None:
        await admin.revoke_session(caller, user_id, context)

    return router
