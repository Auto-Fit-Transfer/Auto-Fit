"""Write the API contract snapshot used by repository checks."""

import json
from pathlib import Path

from backend.app.main import app


def main() -> None:
    destination = Path(__file__).resolve().parents[2] / "docs/api-openapi.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    print(destination)


if __name__ == "__main__":
    main()
