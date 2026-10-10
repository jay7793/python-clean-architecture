"""Serves the built dashboard from the API's own origin, so production needs no CORS."""

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from starlette.convertors import Convertor, register_url_convertor
from starlette.exceptions import HTTPException


class PagePath(Convertor[str]):
    """Any path outside /api. An unknown API route then falls through to the 404 envelope, and a
    wrong method on a known one still answers 405."""

    regex = "(?!api(?:/|$)).*"

    def convert(self, value: str) -> str:
        return value

    def to_string(self, value: str) -> str:
        return value


register_url_convertor("page", PagePath())


def serve_single_page_app(app: FastAPI, directory: Path) -> None:
    """Add after the API routes. A built file answers as itself; any other page path answers
    index.html, so a deep link such as /users/7 loads the dashboard and its router takes over."""
    files = StaticFiles(directory=directory)

    @app.get("/{path:page}", include_in_schema=False)
    async def page(path: str, request: Request) -> Response:
        try:
            return await files.get_response(path, request.scope)
        except HTTPException as missing:
            if missing.status_code != 404:
                raise
            return await files.get_response("index.html", request.scope)
