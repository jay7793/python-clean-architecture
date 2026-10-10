"""Print the OpenAPI document: `uv run python -m app.infrastructure.export_openapi`."""

import json
import sys

from app.infrastructure.config import Settings
from app.infrastructure.main import create_app


def main() -> None:
    # The spec does not depend on settings; a placeholder secret avoids requiring a .env.
    app = create_app(Settings(secret_key="openapi-export-placeholder-secret"))
    json.dump(app.openapi(), sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
