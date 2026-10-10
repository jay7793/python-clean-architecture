from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    """Read once at startup from `GOAPP_*` variables or `.env`, using the Go env.template names."""

    model_config = SettingsConfigDict(env_prefix="GOAPP_", env_file=".env", extra="ignore")

    name: str = "GOLANG FIRST API APP"
    version: str = "0.0.1"

    postgres_db_name: str = "postgres"
    postgres_db_user: str = "postgres"
    postgres_db_password: str = "golang-first-api"
    postgres_db_host: str = "localhost"
    postgres_db_port: int = 5432

    # HS256 signs with this key; a short one can be brute-forced from any issued token.
    secret_key: str = Field(min_length=32)
    jwt_access_expires: int = 86400
    jwt_refresh_expires: int = 172800

    cors_origins: list[str] = ["http://localhost:5173"]

    # Accounts an admin can see but not edit, delete or sign out, e.g. public demo accounts.
    protected_emails: frozenset[str] = frozenset()

    @field_validator("protected_emails", mode="after")
    @classmethod
    def _lowercase(cls, emails: frozenset[str]) -> frozenset[str]:
        return frozenset(email.lower() for email in emails)

    # The built frontend (`frontend/dist`). When set, the API also serves the dashboard.
    static_dir: Path | None = None

    @field_validator("static_dir", mode="after")
    @classmethod
    def _holds_an_index(cls, directory: Path | None) -> Path | None:
        if directory is not None and not (directory / "index.html").is_file():
            raise ValueError(f"{directory} has no index.html; build the frontend first")
        return directory

    @property
    def database_url(self) -> URL:
        return URL.create(
            "postgresql+asyncpg",
            username=self.postgres_db_user,
            password=self.postgres_db_password,
            host=self.postgres_db_host,
            port=self.postgres_db_port,
            database=self.postgres_db_name,
        )
