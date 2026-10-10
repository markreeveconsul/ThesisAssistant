"""PDF/DOCX/TXT text extraction with page locators and OCR warnings."""

from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePath

import fitz
from docx import Document
from fastapi import HTTPException, status


@dataclass(frozen=True)
class ExtractedPage:
    """One page/locator's text and citation number."""

    page_number: int
    text: str


def extract_pages(filename: str, content: bytes) -> tuple[list[ExtractedPage], str | None]:
    """Extract text from supported formats; report unreadable/image-only sources."""
    suffix = PurePath(filename).suffix.lower()
    if not content:
        raise HTTPException(status_code=422, detail="The uploaded file is empty")

    try:
        if suffix == ".pdf":
            return _extract_pdf(content)
        if suffix == ".docx":
            document = Document(BytesIO(content))
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
            text = text.strip()
            if not text:
                raise HTTPException(status_code=422, detail="No readable text was found in the document")
            return [ExtractedPage(page_number=1, text=text)], (
                "DOCX pagination is not intrinsic; citations use logical page 1 for this document."
            )
        if suffix == ".txt":
            text = content.decode("utf-8-sig").strip()
            if not text:
                raise HTTPException(status_code=422, detail="No readable text was found in the document")
            return [ExtractedPage(page_number=1, text=text)], (
                "TXT pagination is not intrinsic; citations use logical page 1 for this document."
            )
    except (fitz.FileDataError, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="The file is corrupt or cannot be read") from exc

    raise HTTPException(
        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        detail="Only PDF, DOCX, and TXT files are supported",
    )


def _extract_pdf(content: bytes) -> tuple[list[ExtractedPage], str | None]:
    """Preserve native one-based PDF page numbers and flag image-only scans."""
    try:
        document = fitz.open(stream=content, filetype="pdf")
        pages = [
            ExtractedPage(page_number=index + 1, text=page.get_text("text").strip())
            for index, page in enumerate(document)
        ]
    except (fitz.FileDataError, fitz.EmptyFileError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="The PDF is corrupt or cannot be read") from exc
    finally:
        if "document" in locals():
            document.close()

    if not pages or not any(page.text for page in pages):
        raise HTTPException(
            status_code=422,
            detail="This PDF contains no extractable text; it may be scanned. OCR is not supported.",
        )
    warning = "Some pages have no extractable text and may be scanned." if any(
        not page.text for page in pages
    ) else None
    return pages, warning
