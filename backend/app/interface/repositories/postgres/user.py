import hashlib
from datetime import datetime

from sqlalchemy import ColumnElement, Row, Select, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.entities import (
    NewUser,
    Page,
    StoredSession,
    TokenPair,
    User,
    UserActivity,
    UserChanges,
    UserCredentials,
    UserPermission,
)
from app.domain.errors import EmailAlreadyUsed
from app.interface.repositories.postgres.models import (
    UserModel,
    UserPermissionModel,
    UserTokenModel,
)


def _to_user(row: UserModel) -> User:
    return User(
        id=row.id,
        email=row.email,
        first_name=row.first_name,
        last_name=row.last_name,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class PostgresUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, new_user: NewUser) -> User:
        row = UserModel(
            email=new_user.email,
            password=new_user.password_hash,
            first_name=new_user.first_name,
            last_name=new_user.last_name,
        )
        try:
            # A savepoint, so a taken email leaves the unit of work usable.
            async with self._session.begin_nested():
                self._session.add(row)
        except IntegrityError as error:
            # lower(email) is the only unique key on users.
            raise EmailAlreadyUsed() from error
        return _to_user(row)

    async def find_by_email(self, email: str) -> UserCredentials | None:
        row = await self._session.scalar(
            select(UserModel).where(func.lower(UserModel.email) == func.lower(email))
        )
        return UserCredentials(_to_user(row), row.password) if row else None

    async def get(self, user_id: int) -> User | None:
        row = await self._session.get(UserModel, user_id)
        return _to_user(row) if row else None

    async def update(self, user_id: int, changes: UserChanges) -> User | None:
        columns = {
            "email": changes.email,
            "password": changes.password_hash,
            "first_name": changes.first_name,
            "last_name": changes.last_name,
        }
        statement = (
            update(UserModel)
            .where(UserModel.id == user_id)
            .values(
                **{name: value for name, value in columns.items() if value is not None},
                updated_at=func.now(),
            )
            .returning(UserModel)
        )
        try:
            async with self._session.begin_nested():
                row = await self._session.scalar(statement)
        except IntegrityError as error:
            raise EmailAlreadyUsed() from error
        return _to_user(row) if row else None

    async def delete(self, user_id: int) -> bool:
        # user_tokens and user_permissions rows go with the user (ON DELETE CASCADE).
        deleted = await self._session.scalar(
            delete(UserModel).where(UserModel.id == user_id).returning(UserModel.id)
        )
        return deleted is not None

    async def record_sign_in(self, user_id: int, signed_in_at: datetime) -> None:
        await self._session.execute(
            update(UserModel).where(UserModel.id == user_id).values(last_sign_in_at=signed_in_at)
        )


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _digests(tokens: TokenPair) -> dict[str, str]:
    return {"access_hash": _digest(tokens.access), "refresh_hash": _digest(tokens.refresh)}


class PostgresUserTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert(self, user_id: int, tokens: TokenPair, expires_at: datetime) -> None:
        columns = {**_digests(tokens), "refresh_expires_at": expires_at}
        statement = (
            insert(UserTokenModel)
            .values(user_id=user_id, **columns)
            .on_conflict_do_update(
                index_elements=[UserTokenModel.user_id],
                set_={**columns, "updated_at": func.now()},
            )
        )
        await self._session.execute(statement)

    async def rotate(self, user_id: int, presented_refresh: str, tokens: TokenPair) -> bool:
        rotated = await self._session.scalar(
            update(UserTokenModel)
            .where(*_holding(user_id, presented_refresh))
            .values(**_digests(tokens), updated_at=func.now())
            .returning(UserTokenModel.id)
        )
        return rotated is not None

    async def revoke(self, user_id: int, presented_refresh: str) -> bool:
        revoked = await self._session.scalar(
            delete(UserTokenModel)
            .where(*_holding(user_id, presented_refresh))
            .returning(UserTokenModel.id)
        )
        return revoked is not None

    async def holds_access(self, user_id: int, access: str) -> bool:
        found = await self._session.scalar(
            select(UserTokenModel.id).where(
                UserTokenModel.user_id == user_id, UserTokenModel.access_hash == _digest(access)
            )
        )
        return found is not None

    async def delete_by_user_id(self, user_id: int) -> None:
        await self._session.execute(delete(UserTokenModel).where(UserTokenModel.user_id == user_id))


def _holding(user_id: int, refresh: str) -> tuple[ColumnElement[bool], ...]:
    return UserTokenModel.user_id == user_id, UserTokenModel.refresh_hash == _digest(refresh)


class PostgresUserPermissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_user_id(self, user_id: int) -> UserPermission | None:
        row = await self._session.scalar(
            select(UserPermissionModel).where(UserPermissionModel.user_id == user_id)
        )
        return UserPermission(row.user_id, row.permission) if row else None

    async def grant(self, user_id: int, permission: str) -> UserPermission:
        statement = (
            insert(UserPermissionModel)
            .values(user_id=user_id, permission=permission)
            .on_conflict_do_update(
                index_elements=[UserPermissionModel.user_id],
                set_={"permission": permission, "updated_at": func.now()},
            )
        )
        await self._session.execute(statement)
        return UserPermission(user_id, permission)

    async def revoke(self, user_id: int) -> None:
        await self._session.execute(
            delete(UserPermissionModel).where(UserPermissionModel.user_id == user_id)
        )


class PostgresUserActivityRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def page(self, page: int, page_size: int) -> Page[UserActivity]:
        statement = (
            _activity_query()
            .add_columns(func.count().over().label("total"))
            .order_by(UserModel.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await self._session.execute(statement)).all()
        # The window count rides on the page's rows; a page past the end has none.
        total = (
            rows[0].total
            if rows
            else await self._session.scalar(select(func.count()).select_from(UserModel))
        )
        return Page([_to_activity(row) for row in rows], page, page_size, total_data=total or 0)

    async def get(self, user_id: int) -> UserActivity | None:
        row = (
            await self._session.execute(_activity_query().where(UserModel.id == user_id))
        ).first()
        return _to_activity(row) if row else None


def _activity_query() -> Select:
    return (
        select(
            UserModel,
            UserPermissionModel.permission,
            UserTokenModel.refresh_expires_at,
            UserTokenModel.updated_at.label("session_updated_at"),
        )
        .outerjoin(UserPermissionModel, UserPermissionModel.user_id == UserModel.id)
        .outerjoin(UserTokenModel, UserTokenModel.user_id == UserModel.id)
    )


def _to_activity(row: Row) -> UserActivity:
    return UserActivity(
        user=_to_user(row.UserModel),
        permission=row.permission,
        session=(
            StoredSession(row.refresh_expires_at, row.session_updated_at)
            if row.refresh_expires_at
            else None
        ),
        last_sign_in_at=row.UserModel.last_sign_in_at,
    )
