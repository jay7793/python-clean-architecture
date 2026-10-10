from app.domain.entities import (
    ADMIN_PERMISSION,
    NO_REQUEST,
    AccountChanges,
    AdminUser,
    AuditAction,
    AuthenticatedUser,
    NewAccount,
    NewUser,
    Page,
    RequestContext,
    Role,
    SessionState,
    User,
    UserActivity,
    UserChanges,
    UserOverview,
)
from app.domain.errors import (
    AccountProtected,
    SelfDeletionRefused,
    SelfDemotionRefused,
    SelfSessionRevokeRefused,
    UserNotFound,
)
from app.domain.repositories import UnitOfWork, UnitOfWorkFactory
from app.domain.services import Clock, PasswordHasher
from app.usecases.audit import AuditTrail


class AdminUserUsecase:
    """An admin managing other accounts. Self-service flows live in UserUsecase.

    `protected_emails` (lowercase) name accounts an admin can see but not edit, delete or sign
    out, so public demo accounts keep working whatever visitors do.
    """

    def __init__(
        self,
        unit_of_work: UnitOfWorkFactory,
        hasher: PasswordHasher,
        clock: Clock,
        protected_emails: frozenset[str] = frozenset(),
    ) -> None:
        self._unit_of_work = unit_of_work
        self._hasher = hasher
        self._clock = clock
        self._audit = AuditTrail(clock)
        self._protected_emails = protected_emails

    async def create(
        self,
        caller: AuthenticatedUser,
        account: NewAccount,
        context: RequestContext = NO_REQUEST,
    ) -> AdminUser:
        caller.require_admin()
        password_hash = await self._hasher.hash(account.password)
        async with self._unit_of_work() as uow:
            user = await uow.users.add(
                NewUser(account.email, password_hash, account.first_name, account.last_name)
            )
            if account.is_admin:
                await uow.permissions.grant(user.id, ADMIN_PERMISSION)
            await self._audit.record(
                uow.audit,
                AuditAction.ADMIN_USER_CREATED,
                context,
                actor=caller.user,
                target=user,
                details={"is_admin": str(account.is_admin).lower()},
            )
        return AdminUser(user, account.is_admin, self._is_protected(user))

    async def list_users(
        self, caller: AuthenticatedUser, page: int, page_size: int
    ) -> Page[UserOverview]:
        caller.require_admin()
        async with self._unit_of_work() as uow:
            found = await uow.activity.page(page, page_size)
        overviews = [self._overview(activity) for activity in found.data]
        return Page(overviews, found.page, found.page_size, found.total_data)

    async def overview(self, caller: AuthenticatedUser, user_id: int) -> UserOverview:
        caller.require_admin()
        async with self._unit_of_work() as uow:
            activity = await uow.activity.get(user_id)
        if activity is None:
            raise UserNotFound()
        return self._overview(activity)

    async def get(self, caller: AuthenticatedUser, user_id: int) -> AdminUser:
        caller.require_admin()
        async with self._unit_of_work() as uow:
            return await self._admin_user(uow, await _existing(uow, user_id))

    async def update(
        self,
        caller: AuthenticatedUser,
        user_id: int,
        changes: AccountChanges,
        context: RequestContext = NO_REQUEST,
    ) -> AdminUser:
        caller.require_admin()
        if user_id == caller.user.id and changes.is_admin is False:
            raise SelfDemotionRefused()
        password_hash = (
            None if changes.password is None else await self._hasher.hash(changes.password)
        )
        async with self._unit_of_work() as uow:
            current = await self._admin_user(uow, self._unprotected(await _existing(uow, user_id)))
            changed = _changed_fields(current, changes)
            user = await uow.users.update(
                user_id,
                UserChanges(changes.email, password_hash, changes.first_name, changes.last_name),
            )
            if user is None:
                raise UserNotFound()
            if changes.is_admin is not None:
                await _set_admin(uow, user_id, changes.is_admin)
            if password_hash is not None or user.email != current.user.email:
                await uow.tokens.delete_by_user_id(user_id)
            await self._audit.record(
                uow.audit,
                AuditAction.ADMIN_USER_UPDATED,
                context,
                actor=caller.user,
                target=user,
                details={"changed": ", ".join(changed)} if changed else {},
            )
            return await self._admin_user(uow, user)

    async def delete(
        self, caller: AuthenticatedUser, user_id: int, context: RequestContext = NO_REQUEST
    ) -> None:
        caller.require_admin()
        # With self-demotion also refused, an admin can never remove the last admin.
        if user_id == caller.user.id:
            raise SelfDeletionRefused()
        async with self._unit_of_work() as uow:
            user = self._unprotected(await _existing(uow, user_id))
            if not await uow.users.delete(user_id):
                raise UserNotFound()
            await self._audit.record(
                uow.audit, AuditAction.ADMIN_USER_DELETED, context, actor=caller.user, target=user
            )

    async def revoke_session(
        self, caller: AuthenticatedUser, user_id: int, context: RequestContext = NO_REQUEST
    ) -> None:
        caller.require_admin()
        if user_id == caller.user.id:
            raise SelfSessionRevokeRefused()
        async with self._unit_of_work() as uow:
            user = self._unprotected(await _existing(uow, user_id))
            await uow.tokens.delete_by_user_id(user_id)
            await self._audit.record(
                uow.audit,
                AuditAction.ADMIN_SESSION_REVOKED,
                context,
                actor=caller.user,
                target=user,
            )

    def _overview(self, activity: UserActivity) -> UserOverview:
        stored = activity.session
        active = stored is not None and stored.expires_at > self._clock()
        return UserOverview(
            activity.user,
            Role.ADMIN if activity.permission == ADMIN_PERMISSION else Role.MEMBER,
            SessionState(active, stored.updated_at if stored else None),
            activity.last_sign_in_at,
            self._is_protected(activity.user),
        )

    def _is_protected(self, user: User) -> bool:
        return user.email.lower() in self._protected_emails

    def _unprotected(self, user: User) -> User:
        if self._is_protected(user):
            raise AccountProtected()
        return user

    async def _admin_user(self, uow: UnitOfWork, user: User) -> AdminUser:
        return AdminUser(user, await _holds_admin(uow, user.id), self._is_protected(user))


async def _existing(uow: UnitOfWork, user_id: int) -> User:
    user = await uow.users.get(user_id)
    if user is None:
        raise UserNotFound()
    return user


async def _holds_admin(uow: UnitOfWork, user_id: int) -> bool:
    permission = await uow.permissions.find_by_user_id(user_id)
    return permission is not None and permission.permission == ADMIN_PERMISSION


async def _set_admin(uow: UnitOfWork, user_id: int, is_admin: bool) -> None:
    if is_admin:
        await uow.permissions.grant(user_id, ADMIN_PERMISSION)
    elif await _holds_admin(uow, user_id):
        # Only the admin permission is revoked; another permission stays.
        await uow.permissions.revoke(user_id)


def _changed_fields(current: AdminUser, changes: AccountChanges) -> list[str]:
    """Names only, never values. A new password always counts: the old one is not readable."""
    before = {
        "email": current.user.email,
        "password": None,
        "first_name": current.user.first_name,
        "last_name": current.user.last_name,
        "is_admin": current.is_admin,
    }
    return [
        name
        for name, old in before.items()
        if (new := getattr(changes, name)) is not None and new != old
    ]
