FROM ghcr.io/astral-sh/uv:0.12.19 AS uv

FROM python:3.13.15-slim AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.13.15-slim
RUN useradd --system --uid 10001 --home-dir /app app
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY alembic.ini docker-entrypoint.sh ./
COPY app ./app
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1
USER app
EXPOSE 8000
HEALTHCHECK --interval=3s --timeout=3s --start-period=10s --retries=20 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/', timeout=2)"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
