"""Run each untrusted parser in a disposable process with a parent-enforced timeout."""

import json
import sys
from dataclasses import asdict
from pathlib import Path

from fastapi import HTTPException

from app.services.parsing import extract_pages


def main() -> None:
    source, filename, destination = sys.argv[1:4]
    try:
        pages, warning = extract_pages(filename, Path(source).read_bytes())
        result = {"pages": [asdict(page) for page in pages], "warning": warning}
    except HTTPException as exc:
        result = {"error": exc.detail, "status": exc.status_code}
    except Exception:
        result = {"error": "The document could not be parsed. Try exporting a fresh copy.", "status": 422}
    Path(destination).write_text(json.dumps(result), encoding="utf-8")


if __name__ == "__main__":
    main()
