import secrets
from datetime import datetime

from app.domain.entities import (
    NO_REQUEST,
    AuditAction,
    AuthenticatedUser,
    LoginResult,
    NewUser,
    RequestContext,
    TokenKind,
    TokenPair,
    User,
    UserCredentials,
)
from app.domain.errors import (
    DomainError,
    InvalidCredentials,
    LogoutRejected,
    RefreshRejected,
    Unauthenticated,
    UserNotFound,
)
from app.domain.repositories import UnitOfWorkFactory
from app.domain.services import Clock, PasswordHasher, TokenIssuer
from app.usecases.audit import AuditTrail


class UserUsecase:
    def __init__(
        self,
        unit_of_work: UnitOfWorkFactory,
        hasher: PasswordHasher,
        issuer: TokenIssuer,
        clock: Clock,
    ) -> None:
        self._unit_of_work = unit_of_work
        self._hasher = hasher
        self._issuer = issuer
        self._clock = clock
        self._audit = AuditTrail(clock)
        self._unknown_user_hash: str | None = None

    async def register(
        self,
        email: str,
        password: str,
        first_name: str,
        last_name: str,
        context: RequestContext = NO_REQUEST,
    ) -> User:
        password_hash = await self._hasher.hash(password)
        async with self._unit_of_work() as uow:
            user = await uow.users.add(NewUser(email, password_hash, first_name, last_name))
            await self._audit.record(uow.audit, AuditAction.USER_REGISTERED, context, actor=user)
        return user

    async def login(
        self, email: str, password: str, context: RequestContext = NO_REQUEST
    ) -> LoginResult:
        async with self._unit_of_work() as uow:
            credentials = await uow.users.find_by_email(email)
        if not await self._hasher.verify(password, await self._stored_hash(credentials)):
            # No user id even when the email exists: the attempt is all that is known.
            raise await self._refuse(
                InvalidCredentials(), AuditAction.LOGIN_FAILED, context, actor_email=email
            )
        async with self._unit_of_work() as uow:
            expires_at = self._issuer.expires_at(TokenKind.REFRESH)
            tokens = self._issue(credentials.user.id, expires_at)
            await uow.tokens.upsert(credentials.user.id, tokens, expires_at)
            await uow.users.record_sign_in(credentials.user.id, self._clock())
            await self._audit.record(uow.audit, AuditAction.LOGIN, context, actor=credentials.user)
        return LoginResult(credentials.user, tokens)

    async def refresh(
        self, refresh_token: str, context: RequestContext = NO_REQUEST
    ) -> LoginResult:
        claims = self._issuer.parse(refresh_token, TokenKind.REFRESH)
        async with self._unit_of_work() as uow:
            user = await uow.users.get(claims.user_id) if claims else None
            if claims is not None and user is not None:
                tokens = self._issue(user.id, claims.expires_at)
                if await uow.tokens.rotate(user.id, refresh_token, tokens):
                    await self._audit.record(uow.audit, AuditAction.REFRESH, context, actor=user)
                    return LoginResult(user, tokens)
        raise await self._refuse(
            RefreshRejected(), AuditAction.REFRESH_REJECTED, context, actor=user
        )

    async def logout(self, refresh_token: str, context: RequestContext = NO_REQUEST) -> None:
        claims = self._issuer.parse(refresh_token, TokenKind.REFRESH)
        async with self._unit_of_work() as uow:
            if claims is not None and await uow.tokens.revoke(claims.user_id, refresh_token):
                user = await uow.users.get(claims.user_id)
                await self._audit.record(uow.audit, AuditAction.LOGOUT, context, actor=user)
                return
        raise LogoutRejected()

    async def authenticate(self, access_token: str) -> AuthenticatedUser:
        claims = self._issuer.parse(access_token, TokenKind.ACCESS)
        if claims is None:
            raise Unauthenticated()
        async with self._unit_of_work() as uow:
            user = await uow.users.get(claims.user_id)
            if user is None or not await uow.tokens.holds_access(user.id, access_token):
                raise Unauthenticated()
            permission = await uow.permissions.find_by_user_id(user.id)
        return AuthenticatedUser(user, permission.permission if permission else None)

    async def grant_permission(self, email: str, permission: str) -> bool:
        """False when the user already holds `permission`: nothing changes and nothing is
        recorded, so granting again is safe."""
        async with self._unit_of_work() as uow:
            credentials = await uow.users.find_by_email(email)
            if credentials is None:
                raise UserNotFound()
            held = await uow.permissions.find_by_user_id(credentials.user.id)
            if held is not None and held.permission == permission:
                return False
            await uow.permissions.grant(credentials.user.id, permission)
            await self._audit.record(
                uow.audit,
                AuditAction.ADMIN_PERMISSION_GRANTED,
                NO_REQUEST,
                target=credentials.user,
                details={"permission": permission},
            )
        return True

    async def _refuse(
        self,
        error: DomainError,
        action: AuditAction,
        context: RequestContext,
        *,
        actor: User | None = None,
        actor_email: str | None = None,
    ) -> DomainError:
        """Record a refusal and hand back the error to raise.

        The refused operation changed nothing, so its audit event commits in a unit of its own.
        """
        async with self._unit_of_work() as uow:
            await self._audit.record(
                uow.audit, action, context, actor=actor, actor_email=actor_email, refused=error
            )
        return error

    async def _stored_hash(self, credentials: UserCredentials | None) -> str:
        """The hash to check the password against. An unknown email gets a hash no password
        matches, so a refusal costs one hash check either way and timing does not reveal
        which emails have accounts."""
        if credentials is not None:
            return credentials.password_hash
        if self._unknown_user_hash is None:
            self._unknown_user_hash = await self._hasher.hash(secrets.token_urlsafe(32))
        return self._unknown_user_hash

    def _issue(self, user_id: int, refresh_expires_at: datetime) -> TokenPair:
        return TokenPair(
            access=self._issuer.issue(user_id, TokenKind.ACCESS),
            refresh=self._issuer.issue(user_id, TokenKind.REFRESH, refresh_expires_at),
        )
