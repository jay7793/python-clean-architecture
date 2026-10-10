import asyncio

import pytest

from app.infrastructure.security.bcrypt_hasher import BcryptPasswordHasher

hasher = BcryptPasswordHasher(rounds=4)


async def test_the_stored_hash_does_not_contain_the_password():
    assert "correct horse" not in await hasher.hash("correct horse")


async def test_the_right_password_verifies():
    assert await hasher.verify("correct horse", await hasher.hash("correct horse")) is True


async def test_a_wrong_password_does_not_verify():
    assert await hasher.verify("battery staple", await hasher.hash("correct horse")) is False


async def test_a_password_beyond_bcrypts_72_byte_limit_is_rejected_not_raised():
    assert await hasher.verify("x" * 73, await hasher.hash("correct horse")) is False


@pytest.mark.parametrize("operation", ["hash", "verify"])
async def test_hashing_leaves_the_event_loop_free_for_other_requests(operation):
    slow = BcryptPasswordHasher(rounds=10)
    stored = await slow.hash("correct horse")
    ticks = 0

    async def other_request() -> None:
        nonlocal ticks
        while True:
            ticks += 1
            await asyncio.sleep(0.001)

    ticker = asyncio.create_task(other_request())
    await asyncio.sleep(0)
    if operation == "hash":
        await slow.hash("correct horse")
    else:
        await slow.verify("correct horse", stored)
    ticker.cancel()

    # bcrypt at 10 rounds takes tens of milliseconds; a blocked loop would tick once.
    assert ticks > 5
