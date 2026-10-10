from datetime import timedelta

import pytest

from app.domain.entities import TokenKind
from app.domain.errors import RefreshRejected, Unauthenticated


@pytest.fixture
async def ada(usecase):
    return await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")


async def test_refresh_hands_out_a_working_access_token_and_retires_the_old_one(usecase, ada):
    login = await usecase.login("ada@example.com", "s3cret-pass")

    refreshed = await usecase.refresh(login.token.refresh)

    assert refreshed.user == ada
    assert (await usecase.authenticate(refreshed.token.access)).user == ada
    with pytest.raises(Unauthenticated):
        await usecase.authenticate(login.token.access)


async def test_the_rotated_refresh_token_keeps_the_original_expiry(usecase, issuer, clock, ada):
    clock.now -= timedelta(hours=1)
    login = await usecase.login("ada@example.com", "s3cret-pass")
    clock.now += timedelta(hours=1)

    refreshed = await usecase.refresh(login.token.refresh)

    original = issuer.parse(login.token.refresh, TokenKind.REFRESH)
    rotated = issuer.parse(refreshed.token.refresh, TokenKind.REFRESH)
    assert rotated is not None and original is not None
    assert refreshed.token.refresh != login.token.refresh
    assert rotated.expires_at == original.expires_at


async def test_a_refresh_token_works_only_once(usecase, ada):
    login = await usecase.login("ada@example.com", "s3cret-pass")
    await usecase.refresh(login.token.refresh)

    with pytest.raises(RefreshRejected):
        await usecase.refresh(login.token.refresh)


async def test_an_access_token_is_rejected_at_refresh(usecase, ada):
    login = await usecase.login("ada@example.com", "s3cret-pass")

    with pytest.raises(RefreshRejected):
        await usecase.refresh(login.token.access)
