"""Admin commands, e.g. `python -m app.infrastructure.cli grant-permission <email> <permission>`."""

import argparse
import asyncio
import sys
from dataclasses import dataclass

from app.domain.errors import EmailAlreadyUsed, UserNotFound
from app.infrastructure.config import Settings
from app.infrastructure.database import create_engine, create_session_factory
from app.infrastructure.main import build_usecases
from app.usecases.user import UserUsecase


@dataclass(frozen=True)
class DemoAccount:
    email: str
    password: str
    first_name: str
    last_name: str
    permission: str | None


# Public on purpose: the demo sign-in page lists them (frontend/src/ui/demoAccounts.ts).
DEMO_ACCOUNTS = (
    DemoAccount("admin@demo.test", "demo-admin-pass", "Ada", "Lovelace", "admin"),
    DemoAccount("member@demo.test", "demo-member-pass", "Grace", "Hopper", None),
)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.infrastructure.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    grant = commands.add_parser("grant-permission", help="set a user's permission, e.g. admin")
    grant.add_argument("email", type=str.lower)
    grant.add_argument("permission")
    commands.add_parser(
        "seed-demo", help="create the public demo accounts if they are missing; safe to rerun"
    )
    return parser


async def _grant_permission(users: UserUsecase, email: str, permission: str) -> int:
    try:
        granted = await users.grant_permission(email, permission)
    except UserNotFound as error:
        print(f"{error}: {email}", file=sys.stderr)
        return 1
    print(f"granted {permission} to {email}" if granted else f"{email} already holds {permission}")
    return 0


async def _seed_demo(users: UserUsecase) -> int:
    for account in DEMO_ACCOUNTS:
        try:
            await users.register(
                account.email, account.password, account.first_name, account.last_name
            )
            line = f"created {account.email}"
        except EmailAlreadyUsed:
            line = f"{account.email} already exists"
        if account.permission:
            await users.grant_permission(account.email, account.permission)
            line += f" ({account.permission})"
        print(line)
    return 0


async def run(argv: list[str], settings: Settings) -> int:
    args = _parser().parse_args(argv)
    engine = create_engine(settings)
    try:
        users = build_usecases(settings, create_session_factory(engine)).users
        if args.command == "seed-demo":
            return await _seed_demo(users)
        return await _grant_permission(users, args.email, args.permission)
    finally:
        await engine.dispose()


def main() -> None:
    sys.exit(asyncio.run(run(sys.argv[1:], Settings())))


if __name__ == "__main__":
    main()
