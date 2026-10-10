import pytest
from pydantic import ValidationError

from app.infrastructure.config import Settings

SECRET = "a-secret-key-of-thirty-two-bytes"


def test_reads_goapp_variables_by_their_go_template_names(monkeypatch):
    monkeypatch.setenv("GOAPP_SECRET_KEY", SECRET)
    monkeypatch.setenv("GOAPP_JWT_REFRESH_EXPIRES", "600")
    monkeypatch.setenv("GOAPP_POSTGRES_DB_PORT", "5433")

    settings = Settings(_env_file=None)

    assert (settings.secret_key, settings.jwt_refresh_expires, settings.postgres_db_port) == (
        SECRET,
        600,
        5433,
    )


def test_refuses_to_start_without_a_secret_key(monkeypatch):
    monkeypatch.delenv("GOAPP_SECRET_KEY", raising=False)

    with pytest.raises(ValidationError, match="secret_key"):
        Settings(_env_file=None)


def test_refuses_a_secret_key_shorter_than_32_characters():
    with pytest.raises(ValidationError, match="secret_key"):
        Settings(_env_file=None, secret_key=SECRET[:31])

    assert Settings(_env_file=None, secret_key=SECRET).secret_key == SECRET


def test_database_url_points_asyncpg_at_the_configured_server():
    settings = Settings(
        _env_file=None,
        secret_key=SECRET,
        postgres_db_user="app",
        postgres_db_password="p@ss",
        postgres_db_host="db",
        postgres_db_port=5433,
        postgres_db_name="goapp",
    )

    assert (
        settings.database_url.render_as_string(hide_password=False)
        == "postgresql+asyncpg://app:p%40ss@db:5433/goapp"
    )


def test_protects_no_account_unless_told_to(monkeypatch):
    monkeypatch.delenv("GOAPP_PROTECTED_EMAILS", raising=False)

    assert Settings(_env_file=None, secret_key=SECRET).protected_emails == frozenset()


def test_reads_protected_emails_as_a_lowercase_set(monkeypatch):
    monkeypatch.setenv("GOAPP_PROTECTED_EMAILS", '["Admin@Demo.test", "member@demo.test"]')

    settings = Settings(_env_file=None, secret_key=SECRET)

    assert settings.protected_emails == frozenset({"admin@demo.test", "member@demo.test"})
