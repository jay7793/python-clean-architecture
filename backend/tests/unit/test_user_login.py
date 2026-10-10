import pytest

from app.domain.entities import TokenKind
from app.domain.errors import InvalidCredentials
from app.usecases.user import UserUsecase


@pytest.fixture
async def ada(usecase):
    return await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")


async def test_login_returns_the_user_and_a_token_pair_for_them(usecase, issuer, ada):
    result = await usecase.login("ada@example.com", "s3cret-pass")

    assert result.user == ada
    access = issuer.parse(result.token.access, TokenKind.ACCESS)
    refresh = issuer.parse(result.token.refresh, TokenKind.REFRESH)
    assert (access and access.user_id, refresh and refresh.user_id) == (ada.id, ada.id)


async def test_wrong_password_and_unknown_email_fail_identically(usecase, ada):
    with pytest.raises(InvalidCredentials) as wrong_password:
        await usecase.login("ada@example.com", "not-the-password")
    with pytest.raises(InvalidCredentials) as unknown_email:
        await usecase.login("nobody@example.com", "s3cret-pass")

    assert str(wrong_password.value) == str(unknown_email.value) == "invalid email or password"


class CountingHasher:
    """Counts the hashes it checks, standing in for bcrypt's cost."""

    def __init__(self, hasher) -> None:
        self._hasher = hasher
        self.verified: list[str] = []

    async def hash(self, password: str) -> str:
        return await self._hasher.hash(password)

    async def verify(self, password: str, password_hash: str) -> bool:
        self.verified.append(password_hash)
        return await self._hasher.verify(password, password_hash)


@pytest.mark.parametrize("email", ["ada@example.com", "nobody@example.com"])
async def test_a_refused_login_checks_one_hash_whether_or_not_the_email_exists(
    unit_of_work, hasher, issuer, clock, ada, email
):
    counting = CountingHasher(hasher)
    usecase = UserUsecase(unit_of_work, counting, issuer, clock)

    with pytest.raises(InvalidCredentials):
        await usecase.login(email, "not-the-password")

    assert len(counting.verified) == 1


async def test_the_stored_session_expires_with_its_refresh_token(usecase, issuer, tokens, ada):
    result = await usecase.login("ada@example.com", "s3cret-pass")

    refresh = issuer.parse(result.token.refresh, TokenKind.REFRESH)
    assert tokens.expires_at[ada.id] == refresh.expires_at
