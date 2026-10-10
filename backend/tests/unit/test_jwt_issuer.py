from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.domain.entities.token import TokenClaims, TokenKind
from app.infrastructure.security.jwt_issuer import JwtTokenIssuer

SECRET = "test-secret-of-at-least-32-bytes!"
LIFETIMES = {TokenKind.ACCESS: timedelta(minutes=1), TokenKind.REFRESH: timedelta(minutes=10)}


@pytest.fixture
def now() -> datetime:
    # Read when the test runs: parse checks exp against the real clock, and a one-minute token
    # issued at import time would expire before a slow suite reached it.
    return datetime.now(UTC).replace(microsecond=0)


@pytest.fixture
def issuer(now) -> JwtTokenIssuer:
    return JwtTokenIssuer(SECRET, "GOLANG FIRST API APP", LIFETIMES, now=lambda: now)


@pytest.mark.parametrize("kind", list(TokenKind))
def test_a_token_parses_back_to_its_user_and_lifetime(issuer, now, kind):
    token = issuer.issue(7, kind)

    assert issuer.parse(token, kind) == TokenClaims(
        user_id=7, kind=kind, expires_at=now + LIFETIMES[kind]
    )


def test_refresh_tokens_use_the_refresh_lifetime_not_the_access_one(issuer, now):
    claims = issuer.parse(issuer.issue(7, TokenKind.REFRESH), TokenKind.REFRESH)

    assert claims is not None
    assert claims.expires_at == now + timedelta(minutes=10)


def test_an_explicit_expiry_is_kept(issuer, now):
    original_expiry = now + timedelta(minutes=5)

    claims = issuer.parse(issuer.issue(7, TokenKind.REFRESH, original_expiry), TokenKind.REFRESH)

    assert claims is not None
    assert claims.expires_at == original_expiry


def test_parsing_rejects_a_token_of_the_other_kind(issuer):
    access = issuer.issue(7, TokenKind.ACCESS)

    assert issuer.parse(access, TokenKind.REFRESH) is None


def test_tokens_issued_in_the_same_second_are_distinct(issuer):
    assert issuer.issue(7, TokenKind.ACCESS) != issuer.issue(7, TokenKind.ACCESS)


def test_issuer_claim_is_the_slugified_app_name(issuer):
    payload = jwt.decode(issuer.issue(7, TokenKind.ACCESS), options={"verify_signature": False})

    assert payload["iss"] == "golang-first-api-app"


def foreign_signature() -> str:
    return JwtTokenIssuer(
        "another-secret-of-at-least-32-bytes", "GOLANG FIRST API APP", LIFETIMES
    ).issue(7, TokenKind.ACCESS)


def expired() -> str:
    an_hour_ago = datetime.now(UTC) - timedelta(hours=1)
    return JwtTokenIssuer(SECRET, "GOLANG FIRST API APP", LIFETIMES, now=lambda: an_hour_ago).issue(
        7, TokenKind.ACCESS
    )


@pytest.mark.parametrize("make_token", [lambda: "not-a-jwt", foreign_signature, expired])
def test_parsing_rejects_untrusted_tokens(issuer, make_token):
    assert issuer.parse(make_token(), TokenKind.ACCESS) is None


@pytest.mark.parametrize("kind", list(TokenKind))
def test_the_expiry_of_a_token_issued_now_matches_the_token(issuer, kind):
    expected = issuer.expires_at(kind)

    assert issuer.parse(issuer.issue(7, kind), kind).expires_at == expected
