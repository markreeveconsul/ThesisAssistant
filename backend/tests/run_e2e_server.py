"""Disposable local API for the Playwright acceptance test."""

import os
import secrets
import tempfile
from pathlib import Path


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="thesis-browser-") as directory:
        root = Path(directory)
        os.environ.update({
            "DATABASE_URL": f"sqlite:///{(root / 'app.db').as_posix()}",
            "UPLOAD_DIR": str(root / "uploads"), "CHROMA_DIR": str(root / "chroma"),
            "SECRET_KEY": secrets.token_hex(32),
            "CORS_ORIGINS": "http://127.0.0.1:3011,http://localhost:3011",
        })
        import uvicorn
        uvicorn.run("app.main:app", host="127.0.0.1", port=8011)


if __name__ == "__main__":
    main()
