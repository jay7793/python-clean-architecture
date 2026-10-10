import pytest

from app.domain.errors import LogoutRejected, RefreshRejected, Unauthenticated


@pytest.fixture
async def login(usecase):
    await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")
    return await usecase.login("ada@example.com", "s3cret-pass")


async def test_after_logout_the_refresh_token_no_longer_refreshes(usecase, login):
    await usecase.logout(login.token.refresh)

    with pytest.raises(RefreshRejected):
        await usecase.refresh(login.token.refresh)


async def test_after_logout_the_access_token_no_longer_authenticates(usecase, login):
    await usecase.logout(login.token.refresh)

    with pytest.raises(Unauthenticated):
        await usecase.authenticate(login.token.access)


async def test_logging_out_twice_is_rejected(usecase, login):
    await usecase.logout(login.token.refresh)

    with pytest.raises(LogoutRejected):
        await usecase.logout(login.token.refresh)


async def test_logout_rejects_an_access_token(usecase, login):
    with pytest.raises(LogoutRejected):
        await usecase.logout(login.token.access)
