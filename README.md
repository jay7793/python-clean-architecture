# Python Clean Architecture

This repository is a FastAPI rewrite of the Go template [max38/golang-clean-code-architecture](https://github.com/max38/golang-clean-code-architecture), with the same layers and the same `GOAPP_*` settings. It also has a React admin dashboard that runs every API flow and shows the token refresh as it happens, with a check of each step.

Live demo: https://clean-arch.probably-anything.com (sign in with a demo account listed under the form; Swagger at [/swagger](https://clean-arch.probably-anything.com/swagger)).

## Quick start

You need Docker with Compose v2. Nothing else.

```sh
docker compose up --build
```

The first run downloads the base images and builds two images. When the log shows `Uvicorn running on http://0.0.0.0:8000`, open these:

| URL | What it is |
|---|---|
| http://localhost:8080 | The dashboard |
| http://localhost:8000/swagger | Swagger UI for the API |
| http://localhost:8000/api/v1/ | The API root, which answers `{"name", "version"}` |

The API container migrates the database on every start. Because `docker-compose.yml` sets `GOAPP_SEED_DEMO=true`, it also creates two demo accounts. A second start creates nothing new and records no audit events.

| Account | Email | Password | What it sees |
|---|---|---|---|
| Admin (Ada Lovelace) | `admin@demo.test` | `demo-admin-pass` | Profile, the Users table, user create, edit and delete, signing a user out, and the Audit log |
| Member (Grace Hopper) | `member@demo.test` | `demo-member-pass` | Profile. Every admin page shows a 403 state that explains how to become an admin |

These are public demo credentials. The sign-in page lists them.

Each account has one session at a time, as in the Go original. Signing in to the same account in a second browser ends the first session, and that browser shows "Your session ended" on its next request.

The demo accounts are protected, because `docker-compose.yml` lists them in `GOAPP_PROTECTED_EMAILS`. An admin sees them in the Users table but cannot edit, delete or sign them out. The API answers 409 `admin-004`, and the user page turns those buttons off. The accounts can still sign in, refresh and sign out. To make them editable, remove `GOAPP_PROTECTED_EMAILS` from `docker-compose.yml` and run `docker compose up --build` again.

To stop the app and delete its data, press Ctrl+C and run:

```sh
docker compose down -v
```

The stack uses host ports 8080, 8000 and 5433. If one of them is taken, stop the program that holds it first.

## A 5-minute tour

1. Open http://localhost:8080. Under the form, press **Use** next to the admin account, then press **Sign in**. On the first sign-in in a browser, a guided tour opens on Users and walks through the sidebar, the users table, the session inspector, the replay, the tokens and the audit log. Press **Next** to follow it or **Skip tour** to close it. **Take the tour** in the header runs it again.
2. Open **Users** in the sidebar (`/users`). You see a table of accounts, 10 to a page, with each account's role, session and last sign-in.
3. Click the row for Grace Hopper (`member@demo.test`). Her detail page (`/users/<id>`) opens with her role, her session and her timestamps.
4. Open http://localhost:8080 in a private window and sign in there as the member with **Use**. Back in the first window, reload Grace's page. Session now says Active. Press **Revoke session**, then **Sign out Grace Hopper**. Session changes to Signed out. In the private window, open **Users** in the sidebar. The sign-in form opens with "Your session ended."
5. Go back to Users and press **New user**. Fill in the form and press **Create user**. The new user's page opens with a green notice.
6. Press **Edit**, change the last name, and press **Save changes**. The notice says the user was saved.
7. Press **Delete**, then **Delete user** in the dialog. The list opens, and the deleted row strikes out and leaves.
8. Press the round button at the bottom right to open the session inspector. Press **Replay with a tampered access token**. The three steps under the button turn into checks: two `401 middleware-002` answers, one shared `POST /users/refresh-token`, and two retries. The retries answer 200 and 200 for an admin, and 200 and 403 for a member, because Users is admin-only. Above it, the refresh token gets a new `jti`, and its expiry stays the same.
9. Open **Audit log** (`/audit-log`). Type `member` in **Actor email**. Only the events whose actor email contains `member` stay. Clear it and pick **Session revoked** under **Action** to see the revoke from step 4.
10. Press **Sign out**. Sign in as the member with **Use**, then open Users. You see "This account is not an admin" with the trace id `middleware-004`.

## Architecture

### Backend layers

```
infrastructure   main.py (composition root), cli.py, config.py, database.py, security/, migrations/
      | builds
      v
interface        handlers/ (routes, schemas, errors)   repositories/postgres/ (ORM models, repositories)
      | calls usecases                                  | implements domain ports
      v                                                 v
usecases         user.py, admin_user.py, audit.py
      | uses
      v
domain           entities/, errors.py, repositories/ and services/ ports
```

Dependencies point down.

| Layer | Rule | How the rule is kept |
|---|---|---|
| `app/domain` | Imports only the standard library and itself. Entities are frozen dataclasses. Ports are `typing.Protocol` classes. | `app/domain/ruff.toml` bans FastAPI, Starlette, Pydantic, pydantic-settings, SQLAlchemy, asyncpg, Alembic, PyJWT, bcrypt and the outer layers with ruff rule TID251. |
| `app/usecases` | Imports only `domain`. A unit of work factory, the password hasher, the token issuer and the clock arrive through constructors. | `app/usecases/ruff.toml` bans the same libraries and the outer layers with TID251. |
| `app/interface` | `handlers/` turns requests into usecase calls. `repositories/postgres/` implements the ports and returns domain entities. ORM models never leave that package. | `app/interface/handlers/ruff.toml` bans SQLAlchemy, the database and security libraries, the repositories and infrastructure. `app/interface/repositories/ruff.toml` bans FastAPI, Pydantic, the security libraries, the usecases, the handlers and infrastructure. |
| `app/infrastructure` | Holds the drivers (engine, bcrypt, PyJWT), the settings and the migrations. Only `build_usecases` in `main.py` picks concrete classes. The HTTP app and the CLI both call it. | It is the outermost layer, so it may import every other one. |

`uv run ruff check .` fails if a file imports something its layer must not. A nested `ruff.toml` replaces the parent's ban list, so each file lists all of its layer's bans.

#### A login, traced through the layers

Paths are relative to `backend/app/`.

1. `interface/handlers/user.py` receives `POST /api/v1/users/login`. FastAPI parses the body into `LoginRequest` from `interface/handlers/schemas.py`, which lowercases the email.
2. The route calls `UserUsecase.login` in `usecases/user.py`.
3. The usecase opens a unit of work. `interface/repositories/postgres/user.py` finds the email through the unique index on `lower(email)` and returns a `UserCredentials` entity.
4. The `PasswordHasher` port (`infrastructure/security/bcrypt_hasher.py`) runs bcrypt in a worker thread. An unknown email is checked against a hash that no password matches, so both refusals take one bcrypt check and raise `InvalidCredentials` from `domain/errors.py`.
5. In a second unit of work, the `TokenIssuer` port (`infrastructure/security/jwt_issuer.py`) issues the token pair. The usecase stores their SHA-256 digests as the user's only session, sets `last_sign_in_at` and records an `auth.login` audit event. All three writes commit together.
6. On a refusal, the one `DomainError` handler in `interface/handlers/errors.py` looks up the status in `ERROR_STATUSES` and answers 400 `{"trace_id": "users-002", ...}`. The trace id comes from the error class, so the response and the audit event carry the same code.

`build_usecases` in `infrastructure/main.py` built every object in this chain when the app started.

#### Transactions and the audit log

Each usecase operation runs in one unit of work. The `UnitOfWork` port (`domain/repositories/unit_of_work.py`) is an async context manager that exposes every repository. Leaving the `async with` block commits, and an exception rolls back. `PostgresUnitOfWork` gives every repository one `AsyncSession`, so they share one transaction, and no repository commits on its own. A change and the audit event that describes it are stored together or not at all. If the audit write fails, the change rolls back and the caller gets 500 `internal-001`.

Refresh and logout check the presented refresh token inside the write (`UPDATE ... WHERE user_id = :id AND refresh_hash = :digest`). If two requests present the same refresh token at once, exactly one of them finds the row.

The audit log is append-only. The `AuditLog` port has only `record` and `page`, and a database trigger on `audit_events` refuses every `UPDATE` and `DELETE`. An event never holds a password, a hash or a token. `admin.user_updated` lists the names of the changed fields, never their values. Emails in an event are copies, so an event keeps the email of a user who was later renamed or deleted. A refused login or refresh changes nothing else, so its event commits in a unit of work of its own.

### Frontend layers

```
ui  ──►  application  ──►  domain
              ▲
infrastructure ┘   (implements the ports in application/ports.ts)
```

| Layer | What it holds | Rule |
|---|---|---|
| `src/domain` | Plain types and pure functions, such as `User`, `ApiError`, `timeline` and `replayReport` | Imports nothing from the other layers |
| `src/application` | `SessionController`, `ExchangeLog`, and the ports in `ports.ts` | Imports only `domain`. It reaches the outside through the `AuthApi`, `TokenStore`, `Clock` and `ExchangeRecorder` ports. |
| `src/infrastructure` | The openapi-fetch client, the `localStorage` token store and JWT decoding | Implements the ports |
| `src/ui` | The React pages, the session inspector and the guided tour | Never imports `infrastructure`. `src/main.tsx` builds the adapters and passes them in through `ServicesProvider`. |

`frontend/eslint.config.js` keeps the rule with `no-restricted-imports` and `no-restricted-globals`. In `domain` and `application`, an import of React, Base UI, lucide-react, zod or openapi-fetch fails `pnpm lint`. So does a use of a browser global such as `window`, `localStorage` or `fetch`. In `ui`, an import from `infrastructure` fails it.

#### A 401 is refreshed once and retried

Every authenticated call goes through one wrapper in `SessionController` (`src/application/session.ts`):

1. The wrapper sends the call with the current access token.
2. On a 401, it reads the token store again. If another tab already rotated the pair, the call takes the stored pair and retries without a refresh.
3. Otherwise it starts a refresh or joins the one in flight. Concurrent callers share one promise, so two 401s cause one `POST /api/v1/users/refresh-token`.
4. It stores the new pair and retries each call once.
5. If the refresh answers 401, the controller clears the tokens and the sign-in page shows "Your session ended". If the refresh fails with a network error or a 5xx, the session stays and the page shows the error.

Tabs of one browser share the pair through `localStorage` and its `storage` event, so a refresh in one tab never ends the session in another.

#### The session inspector

The round button at the bottom right opens it. It shows:

- Both tokens, decoded. The access token counts down to its expiry. After a refresh, the new `jti` replaces the old one and the refresh expiry stays the same.
- **Replay with a tampered access token**, which breaks the access token's signature in memory and loads Profile and Users at the same time. Three checks then show that both calls got a 401, that one refresh served both, and that both retries were accepted.
- One row per request with the method, the path, the status and the `trace_id`. A refresh and the retries it sent sit under the 401s they answered.

The adapter records each request from the real `Request` and `Response`. `timeline` and `replayReport` in `src/domain/exchange.ts` turn that record into what the inspector shows.

The look is a white dashboard on a mint ground, set in DM Sans, with Noto Sans Thai for Thai text (Google Fonts, served from the app through the @fontsource packages, SIL Open Font License).

### Go to Python mapping

| Go reference | This repository |
|---|---|
| `src/domain/entities` | `backend/app/domain/entities/`. The Go request and response structs became Pydantic schemas in `backend/app/interface/handlers/schemas.py`. |
| `src/domain/models` | `backend/app/interface/repositories/postgres/models.py`. The ORM models moved out of the domain. |
| `src/domain/repositories` | `backend/app/domain/repositories/`, plus `backend/app/domain/services/` for the hasher, token issuer and clock ports |
| `src/usecases` | `backend/app/usecases/` |
| `src/interface/handlers/gofiber` | `backend/app/interface/handlers/` (routes, schemas, bearer auth, the error envelope) |
| `src/interface/repositories/postgres` | `backend/app/interface/repositories/postgres/` |
| `src/infrastructure/gofiber` | `backend/app/interface/handlers/app.py` builds the FastAPI app. `backend/app/infrastructure/main.py` wires it. |
| `src/infrastructure/database` | `backend/app/infrastructure/database.py` and the Alembic migrations in `backend/app/infrastructure/migrations/` |
| `src/shared/authentication` | `backend/app/infrastructure/security/jwt_issuer.py` and `bcrypt_hasher.py`, behind ports in `domain/services/` |
| `src/config` | `backend/app/infrastructure/config.py`, which reads the same `GOAPP_*` variables |

`openapi.json` at the repository root connects the two halves. The backend writes it from the FastAPI app, and `pnpm gen:api` in `frontend/` generates the HTTP client's TypeScript types from it. A renamed route or field fails the frontend type check. A backend test fails if the committed file is stale. After you change a route or a schema, regenerate both:

```sh
cd backend && uv run python -m app.infrastructure.export_openapi > ../openapi.json
cd ../frontend && pnpm gen:api
```

## API

Swagger UI is at http://localhost:8000/swagger while the app runs, and [`openapi.json`](openapi.json) is the full schema. Bodies are JSON. A success answers the payload with no wrapper.

| Method | Path | Who can call it | Success | Main errors |
|---|---|---|---|---|
| GET | `/api/v1/` | Anyone | 200 `{name, version}` | |
| POST | `/api/v1/users/register` | Anyone | 201 user | 409 `users-001`, 422 `users-001` |
| POST | `/api/v1/users/login` | Anyone | 200 user and token pair | 400 `users-002`, 422 `users-002` |
| POST | `/api/v1/users/refresh-token` | Holder of the refresh token | 200 user and new token pair | 401 `users-003`, 422 `users-003` |
| POST | `/api/v1/users/logout` | Holder of the refresh token | 200 `null` | 401 `users-004`, 422 `users-004` |
| GET | `/api/v1/users/profile` | Signed-in user | 200 user | 401 `middleware-002` |
| GET | `/api/v1/admin/users` | Admin | 200 page of users with role and session | 401, 403, 422 |
| POST | `/api/v1/admin/users` | Admin | 201 user | 401, 403, 409 `users-001`, 422 |
| GET | `/api/v1/admin/users/{id}` | Admin | 200 user | 401, 403, 404 `users-005`, 422 |
| GET | `/api/v1/admin/users/{id}/overview` | Admin | 200 the user's list row | 401, 403, 404 `users-005`, 422 |
| PATCH | `/api/v1/admin/users/{id}` | Admin | 200 user | 401, 403, 404, 409 `users-001` `admin-002` `admin-004`, 422 |
| DELETE | `/api/v1/admin/users/{id}` | Admin | 204 | 401, 403, 404, 409 `admin-001` `admin-004`, 422 |
| DELETE | `/api/v1/admin/users/{id}/session` | Admin | 204, also when there is no session | 401, 403, 404, 409 `admin-003` `admin-004`, 422 |
| GET | `/api/v1/admin/audit-logs` | Admin | 200 page of events, newest first | 401, 403, 422 |

On the admin routes, 401 is `middleware-002`, 403 is `middleware-004` and 422 is `middleware-003`. The list routes take `_page` (1 to 10000) and `_pageSize` (1 to 1000). The audit log also filters by `action`, `outcome` and any part of `actor_email`.

Every error has the same body:

```json
{ "trace_id": "users-002", "message": "invalid email or password" }
```

`trace_id` is a stable code. The frontend maps it to a message that tells the user what to do next. A 422 message names the field, as in `first_name: String should have at most 255 characters`.

| `trace_id` | Status | Meaning |
|---|---|---|
| `users-001` | 409, 422 | The email is already used, or the register body is invalid |
| `users-002` | 400, 422 | Wrong email or password, or the login body is invalid |
| `users-003` | 401, 422 | The refresh token is refused, or the body is invalid |
| `users-004` | 401, 422 | The logout token is refused, or the body is invalid |
| `users-005` | 404 | No user has this id |
| `admin-001` | 409 | An admin cannot delete their own account |
| `admin-002` | 409 | An admin cannot clear their own admin flag |
| `admin-003` | 409 | An admin cannot revoke their own session. They sign out instead. |
| `admin-004` | 409 | The account is in `GOAPP_PROTECTED_EMAILS` |
| `middleware-001` | 404 | Unknown route |
| `middleware-002` | 401 | The access token is missing, invalid, expired or replaced by a newer sign-in |
| `middleware-003` | 422 | Invalid input on a route without its own code |
| `middleware-004` | 403 | The caller does not have the `admin` permission |
| `middleware-005` | 405 | Known route, wrong method. The answer has an `Allow` header. |
| `internal-001` | 500 | Unexpected server error. The server logs the cause. |

## Tests

The backend tests need Postgres on port 5433. Start it with `docker compose up -d db`, then run:

```sh
cd backend
uv sync
uv run ruff check .
uv run pytest -q
```

The integration tests rebuild their own `goapp_test` database on each run.

The frontend tests need no database:

```sh
cd frontend
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm test --run
```

## Differences from the Go reference

These are bugs in the Go template. Each fix has its own test.

1. Refresh tokens used `GOAPP_JWT_ACCESS_EXPIRES`. They now use `GOAPP_JWT_REFRESH_EXPIRES`.
2. `total_data` was the number of rows on the current page. It is now a `COUNT(*)` over the table, so `total_page` is right too.
3. `/data/user-tokens` returned every user's tokens to any signed-in user. The generic `/data` routes are not ported. Users are read through `/api/v1/admin/users`, which needs the `admin` permission and never returns a password hash or a token.
4. An unknown email at login answered "record not found". It now gets the same 400 `users-002` as a wrong password.
5. A duplicate email returned 500 with the raw database error. It is now 409 `users-001`.
6. The profile route was registered as POST while its docs said GET. It is GET.
7. The JWT issuer discarded the result of `strings.Replace`, so the issuer name was never slugified. It is now `golang-first-api-app`.
8. The email regex capped the top-level domain at four letters. Pydantic's `EmailStr` now parses emails.

This repository also adds these:

- User create, read, edit and delete under `/api/v1/admin/users`, through a dedicated `AdminUserUsecase`. The list shows each user's role, session and last sign-in, and an admin can revoke a user's session.
- An append-only audit log of sign-ins, refreshes and admin changes, at `GET /api/v1/admin/audit-logs`.
- The `seed-demo` command, which creates the two demo accounts.
- One database transaction per operation, so a change and its audit event are stored together or not at all.
- Session tokens stored only as SHA-256 digests, and emails that ignore letter case.
- The React dashboard in `frontend/`.

Smaller behavior changes:

- A failed refresh or logout is 401 (Go: 400). An unknown user id is 404 `users-005`.
- Middleware trace ids are spelled `middleware-00x` (Go: `middlware-00x`).
- `_page` and `_pageSize` out of range are 422. Go clamped them.
- Names and emails hold at most 255 characters, checked at the request. Go answered 500 from the database.
- `GOAPP_SECRET_KEY` must be at least 32 characters.
- Tokens carry their kind in `sub` and a random `jti`, so a token of the wrong kind is refused. Refresh rotation keeps the original refresh expiry, and a used refresh token is refused.
- MongoDB is not ported.

## Manual setup without the app containers

Use this setup to change the code. Postgres still runs in Docker. You need Python 3.13 with [uv](https://docs.astral.sh/uv/), and Node 22 with pnpm.

Start Postgres from the repository root:

```sh
docker compose up -d db
```

Start the API in a second terminal. It listens on http://localhost:3000.

```sh
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run python -m app.infrastructure.cli seed-demo
uv run uvicorn app.infrastructure.main:create_app --factory --port 3000
```

Start the dashboard in a third terminal. It listens on http://localhost:5173 and calls the API on port 3000.

```sh
cd frontend
pnpm install
pnpm dev
```

## Production image

The root `Dockerfile` builds one image for a public deployment. Its first stage builds the dashboard with an empty `VITE_API_URL`, so the dashboard calls `/api/...` on the origin that served it and the browser needs no CORS. Its second stage is the API image from `backend/Dockerfile` with the built dashboard in `/app/static`. `docker-compose.yml` does not use it and still builds `backend/` and `frontend/` separately.

```sh
docker build --platform linux/amd64 -t python-clean-architecture .
```

The container listens on port 8000. `GET /api/v1/` answers 200, so a health check can use it. On start the container waits for Postgres, runs `alembic upgrade head`, runs `seed-demo` if `GOAPP_SEED_DEMO=true`, and then starts uvicorn. Any `GET` outside `/api`, `/swagger` and `/openapi.json` that is not a built file answers `index.html`, so a deep link such as `/users/7` opens the dashboard. An unknown `/api/...` route still answers the 404 envelope.

| Variable | Required | What it does |
|---|---|---|
| `GOAPP_SECRET_KEY` | Yes | Signs the tokens. At least 32 characters. Keep it secret. |
| `GOAPP_POSTGRES_DB_HOST`, `GOAPP_POSTGRES_DB_PORT`, `GOAPP_POSTGRES_DB_NAME`, `GOAPP_POSTGRES_DB_USER`, `GOAPP_POSTGRES_DB_PASSWORD` | Yes | Where the database is. Keep the password secret. |
| `GOAPP_STATIC_DIR` | Set by the image | Serves the dashboard from this folder. The image sets it to `/app/static`. |
| `GOAPP_SEED_DEMO` | No | `true` creates the two public demo accounts on start. |
| `GOAPP_PROTECTED_EMAILS` | No | A JSON list of accounts an admin cannot edit, delete or sign out. A public demo sets `'["admin@demo.test", "member@demo.test"]'`. |
| `GOAPP_BEHIND_PROXY` | No | `true` makes uvicorn read the client address from `X-Forwarded-For`, so the audit log records the visitor and not the proxy. Set it only when a reverse proxy such as kamal-proxy is the only way in, because the API then trusts that header from any sender. |
| `GOAPP_NAME`, `GOAPP_VERSION` | No | What `GET /api/v1/` answers and the token issuer name. |
| `GOAPP_JWT_ACCESS_EXPIRES`, `GOAPP_JWT_REFRESH_EXPIRES` | No | Token lifetimes in seconds. The defaults are 86400 and 172800. |

`GOAPP_CORS_ORIGINS` is not needed, because the dashboard and the API share an origin. To hide the demo accounts on the sign-in page, build with `--build-arg VITE_SHOW_DEMO_ACCOUNTS=false`.

## Project layout

```
.
├── docker-compose.yml     Postgres, the API and the dashboard
├── Dockerfile             The production image: the API serving the built dashboard
├── openapi.json           The OpenAPI document the backend exports and the frontend reads
├── backend/               The FastAPI app
│   ├── app/               domain, usecases, interface, infrastructure
│   └── tests/             unit and integration tests
└── frontend/              The React dashboard
    └── src/               domain, application, infrastructure, ui
```
