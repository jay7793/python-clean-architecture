#!/bin/sh
set -eu

python - <<'PY'
import asyncio
import sys

import asyncpg

from app.infrastructure.config import Settings


async def wait_for_postgres(attempts: int = 60) -> None:
    settings = Settings()
    for _ in range(attempts):
        try:
            connection = await asyncpg.connect(
                host=settings.postgres_db_host,
                port=settings.postgres_db_port,
                user=settings.postgres_db_user,
                password=settings.postgres_db_password,
                database=settings.postgres_db_name,
            )
        except (OSError, asyncpg.PostgresError):
            await asyncio.sleep(1)
        else:
            await connection.close()
            return
    sys.exit(f"Postgres at {settings.postgres_db_host}:{settings.postgres_db_port} did not answer")


asyncio.run(wait_for_postgres())
PY

alembic upgrade head
# The demo accounts have public passwords, so only a stack that asks for them gets them.
if [ "${GOAPP_SEED_DEMO:-false}" = "true" ]; then
    python -m app.infrastructure.cli seed-demo
fi
set -- --host 0.0.0.0 --port 8000
# Behind a reverse proxy such as kamal-proxy, the client address is in X-Forwarded-For. Trust it
# only when the proxy is the sole way in, or a client could write its own address into the audit log.
if [ "${GOAPP_BEHIND_PROXY:-false}" = "true" ]; then
    set -- "$@" --proxy-headers --forwarded-allow-ips='*'
fi
exec uvicorn app.infrastructure.main:create_app --factory "$@"
