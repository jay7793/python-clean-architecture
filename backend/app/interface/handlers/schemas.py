from datetime import datetime
from typing import Annotated, Self

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.domain.entities import AuditAction, Outcome, Role
from app.domain.services.password_hasher import MAX_PASSWORD_BYTES


def _fits_the_hasher(password: str) -> str:
    if len(password.encode()) > MAX_PASSWORD_BYTES:
        raise ValueError(f"must be at most {MAX_PASSWORD_BYTES} bytes")
    return password


# 255 is the width of the users columns these values are stored in.
MAX_TEXT_LENGTH = 255

Password = Annotated[str, Field(min_length=1), AfterValidator(_fits_the_hasher)]
Name = Annotated[str, Field(min_length=1, max_length=MAX_TEXT_LENGTH)]
# An email names one account whatever its case, so every request lowercases it.
Email = Annotated[EmailStr, Field(max_length=MAX_TEXT_LENGTH), AfterValidator(str.lower)]
# Signing in only looks the address up, so any text is accepted: an account the CLI created may
# use a reserved domain such as demo.test that the format check refuses.
LoginEmail = Annotated[
    str, Field(min_length=1, max_length=MAX_TEXT_LENGTH), AfterValidator(str.lower)
]


class ErrorResponse(BaseModel):
    trace_id: str
    message: str


class Health(BaseModel):
    name: str
    version: str


class RegisterRequest(BaseModel):
    email: Email
    password: Password
    first_name: Name
    last_name: Name


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    first_name: str
    last_name: str
    created_at: datetime
    updated_at: datetime


PROTECTED = Field(description="An admin can see this account but not edit, delete or sign it out")


class AdminUser(User):
    is_admin: bool
    protected: bool = PROTECTED


class SessionState(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    active: bool = Field(description="The stored refresh token is still valid")
    last_active_at: datetime | None = Field(
        description="The last sign-in or refresh of the stored session; null when none is stored"
    )


class AdminUserOverview(User):
    role: Role
    session: SessionState
    last_sign_in_at: datetime | None = Field(description="null when the user never signed in")
    protected: bool = PROTECTED


class AdminUserOverviewPage(BaseModel):
    data: list[AdminUserOverview]
    page: int
    page_size: int
    total_page: int
    total_data: int


class CreateUserRequest(BaseModel):
    email: Email
    password: Password
    first_name: Name
    last_name: Name
    is_admin: bool = False


class UpdateUserRequest(BaseModel):
    """Every field is optional. A missing or null field stays as it is, but at least one field
    must carry a value."""

    email: Email | None = None
    password: Password | None = None
    first_name: Name | None = None
    last_name: Name | None = None
    is_admin: bool | None = None

    @model_validator(mode="after")
    def _changes_something(self) -> Self:
        if all(value is None for value in self.model_dump().values()):
            raise ValueError("nothing to update: give at least one field")
        return self


class LoginRequest(BaseModel):
    email: LoginEmail
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    access: str
    refresh: str


class LoginResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: User
    token: TokenPair


class AuditEvent(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    occurred_at: datetime
    action: AuditAction
    outcome: Outcome
    actor_user_id: int | None
    actor_email: str | None
    target_user_id: int | None
    target_email: str | None
    trace_id: str | None
    ip: str | None
    details: dict[str, str]


class AuditLogPage(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    data: list[AuditEvent]
    page: int
    page_size: int
    total_page: int
    total_data: int
