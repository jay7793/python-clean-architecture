import pytest

from app.domain.entities import AuthenticatedUser
from app.domain.errors import Unauthenticated


@pytest.fixture
async def ada(usecase):
    return await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")


async def test_a_fresh_access_token_identifies_the_user(usecase, ada):
    login = await usecase.login("ada@example.com", "s3cret-pass")

    assert await usecase.authenticate(login.token.access) == AuthenticatedUser(ada, None)


async def test_the_callers_permission_comes_along(usecase, permissions, ada):
    await permissions.grant(ada.id, "admin")
    login = await usecase.login("ada@example.com", "s3cret-pass")

    assert (await usecase.authenticate(login.token.access)).permission == "admin"


async def test_logging_in_again_invalidates_the_previous_access_token(usecase, ada):
    first = await usecase.login("ada@example.com", "s3cret-pass")
    await usecase.login("ada@example.com", "s3cret-pass")

    with pytest.raises(Unauthenticated):
        await usecase.authenticate(first.token.access)


async def test_a_refresh_token_is_not_an_access_token(usecase, ada):
    login = await usecase.login("ada@example.com", "s3cret-pass")

    with pytest.raises(Unauthenticated):
        await usecase.authenticate(login.token.refresh)


async def test_garbage_is_not_an_access_token(usecase):
    with pytest.raises(Unauthenticated):
        await usecase.authenticate("garbage")
