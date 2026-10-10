import pytest

from app.domain.errors import EmailAlreadyUsed


async def test_register_returns_the_new_user(usecase):
    user = await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")

    assert (user.email, user.first_name, user.last_name) == ("ada@example.com", "Ada", "Lovelace")


async def test_register_stores_a_hash_that_verifies_and_not_the_password(usecase, users, hasher):
    await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")

    stored = users.credentials["ada@example.com"].password_hash
    assert stored != "s3cret-pass"
    assert await hasher.verify("s3cret-pass", stored)


async def test_register_refuses_an_email_that_is_already_used(usecase):
    await usecase.register("ada@example.com", "s3cret-pass", "Ada", "Lovelace")

    with pytest.raises(EmailAlreadyUsed):
        await usecase.register("ada@example.com", "other-pass", "Ada", "Byron")
