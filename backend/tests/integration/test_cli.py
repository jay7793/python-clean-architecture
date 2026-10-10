from sqlalchemy import func, select

from app.infrastructure.cli import run
from app.interface.repositories.postgres.models import AuditEventModel
from tests.integration.conftest import bearer, log_in

ADMIN_USERS = "/api/v1/admin/users"


async def test_grant_permission_turns_a_user_into_an_admin(client, ada_login, settings, capsys):
    before = await client.get(ADMIN_USERS, headers=bearer(ada_login))

    exit_code = await run(["grant-permission", "ada@example.com", "admin"], settings)

    after = await client.get(ADMIN_USERS, headers=bearer(ada_login))
    assert (before.status_code, exit_code, after.status_code) == (403, 0, 200)
    assert capsys.readouterr().out == "granted admin to ada@example.com\n"


async def test_granting_a_held_permission_again_says_so(client, ada_login, settings, capsys):
    await run(["grant-permission", "ada@example.com", "admin"], settings)

    exit_code = await run(["grant-permission", "ada@example.com", "admin"], settings)

    assert exit_code == 0
    assert capsys.readouterr().out.splitlines()[-1] == "ada@example.com already holds admin"


async def test_grant_permission_to_an_unknown_email_fails(client, settings, capsys):
    exit_code = await run(["grant-permission", "nobody@example.com", "admin"], settings)

    assert exit_code == 1
    assert capsys.readouterr().err == "user not found: nobody@example.com\n"


async def audit_rows(session_factory) -> int:
    async with session_factory() as session:
        return await session.scalar(select(func.count()).select_from(AuditEventModel))


async def test_seed_demo_creates_an_admin_and_a_member_and_a_second_run_changes_nothing(
    client, settings, session_factory, capsys
):
    first = await run(["seed-demo"], settings)
    after_first = await audit_rows(session_factory)
    second = await run(["seed-demo"], settings)

    assert await audit_rows(session_factory) == after_first == 3

    admin = await log_in(client, "admin@demo.test", "demo-admin-pass")
    member = await log_in(client, "member@demo.test", "demo-member-pass")
    users = await client.get(ADMIN_USERS, headers=bearer(admin))
    member_users = await client.get(ADMIN_USERS, headers=bearer(member))
    assert (first, second) == (0, 0)
    assert (users.status_code, member_users.status_code) == (200, 403)
    assert users.json()["total_data"] == 2
    names = {(u["email"], u["first_name"], u["last_name"]) for u in users.json()["data"]}
    assert names == {
        ("admin@demo.test", "Ada", "Lovelace"),
        ("member@demo.test", "Grace", "Hopper"),
    }
    assert capsys.readouterr().out == (
        "created admin@demo.test (admin)\n"
        "created member@demo.test\n"
        "admin@demo.test already exists (admin)\n"
        "member@demo.test already exists\n"
    )


async def test_grant_permission_finds_the_email_in_any_case(client, ada_login, settings, capsys):
    exit_code = await run(["grant-permission", "Ada@Example.COM", "admin"], settings)

    assert exit_code == 0
    assert capsys.readouterr().out == "granted admin to ada@example.com\n"
