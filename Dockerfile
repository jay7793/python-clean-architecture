# The production image: the API and the built dashboard on one origin, so the browser needs no CORS.
# docker-compose.yml keeps building backend/ and frontend/ separately for local review.

FROM node:22.23.2-bookworm-slim AS web
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
WORKDIR /web
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
# Empty: the dashboard calls /api/... on the origin that served it.
ENV VITE_API_URL=""
ARG VITE_SHOW_DEMO_ACCOUNTS=true
ENV VITE_SHOW_DEMO_ACCOUNTS=$VITE_SHOW_DEMO_ACCOUNTS
RUN pnpm build

FROM ghcr.io/astral-sh/uv:0.12.19 AS uv

FROM python:3.13.15-slim AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.13.15-slim
RUN useradd --system --uid 10001 --home-dir /app app
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY backend/alembic.ini backend/docker-entrypoint.sh ./
COPY backend/app ./app
COPY --from=web /web/dist ./static
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    GOAPP_STATIC_DIR=/app/static
USER app
EXPOSE 8000
HEALTHCHECK --interval=3s --timeout=3s --start-period=10s --retries=20 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/', timeout=2)"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
