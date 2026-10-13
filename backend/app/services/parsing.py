"""Bounded extraction with physical PDF pages and honest text locators."""

from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePath
from zipfile import BadZipFile, ZipFile

import fitz
from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from fastapi import HTTPException
from lxml.etree import XMLSyntaxError

from app.core.config import settings


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    text: str
    locator_type: str = "page"


def _bounded(pages: list[ExtractedPage]) -> list[ExtractedPage]:
    if len(pages) > 10000:
        raise HTTPException(413, "The document exceeds 10,000 extracted locations; split it into smaller files")
    if sum(len(page.text) for page in pages) > settings.max_extracted_chars:
        raise HTTPException(413, "The extracted document exceeds the text limit")
    if not any(page.text.strip() for page in pages):
        raise HTTPException(422, "No readable text was found in the document")
    return pages


def extract_pages(filename: str, content: bytes) -> tuple[list[ExtractedPage], str | None]:
    suffix = PurePath(filename).suffix.lower()
    if not content:
        raise HTTPException(422, "The uploaded file is empty")
    try:
        if suffix == ".pdf":
            return _extract_pdf(content)
        if suffix == ".docx":
            with ZipFile(BytesIO(content)) as archive:
                entries = archive.infolist()
                if len(entries) > 2000 or sum(item.file_size for item in entries) > settings.max_docx_expanded_mb * 1024 * 1024:
                    raise HTTPException(413, "The expanded DOCX exceeds the document limit")
                if "word/document.xml" not in archive.namelist():
                    raise HTTPException(422, "The file is not a valid DOCX document")
                if any(item.flag_bits & 1 for item in entries):
                    raise HTTPException(422, "Encrypted DOCX files are not supported")
            document = Document(BytesIO(content))
            pages: list[ExtractedPage] = []
            for block in document.iter_inner_content():
                if isinstance(block, Paragraph):
                    texts = [block.text]
                elif isinstance(block, Table):
                    texts = [" | ".join(cell.text for cell in row.cells) for row in block.rows]
                else:
                    continue
                for text in texts:
                    if text.strip():
                        pages.append(ExtractedPage(len(pages) + 1, text.strip(), "paragraph"))
            return _bounded(pages), "DOCX citations use extracted paragraph numbers (table rows count as paragraphs), not physical pages."
        if suffix == ".txt":
            if b"\x00" in content:
                raise HTTPException(422, "TXT files must contain UTF-8 text, not binary data or UTF-16")
            pages = [ExtractedPage(index, line, "line") for index, line in enumerate(content.decode("utf-8-sig").splitlines(), 1) if line.strip()]
            return _bounded(pages), "TXT citations use original line numbers, not physical pages."
    except (BadZipFile, KeyError, XMLSyntaxError, UnicodeDecodeError, ValueError, RuntimeError, OSError) as exc:
        raise HTTPException(422, "The file is corrupt or cannot be read") from exc
    raise HTTPException(415, "Only PDF, DOCX, and TXT files are supported")


def _extract_pdf(content: bytes) -> tuple[list[ExtractedPage], str | None]:
    try:
        with fitz.open(stream=content, filetype="pdf") as document:
            if document.needs_pass:
                raise HTTPException(422, "Password-protected PDFs are not supported")
            if len(document) > settings.max_pdf_pages:
                raise HTTPException(413, "The PDF exceeds the page limit")
            pages = []
            total = 0
            for index, page in enumerate(document):
                text = page.get_text("text").strip()
                total += len(text)
                if total > settings.max_extracted_chars:
                    raise HTTPException(413, "The extracted document exceeds the text limit")
                pages.append(ExtractedPage(index + 1, text))
    except (fitz.FileDataError, fitz.EmptyFileError, RuntimeError, ValueError) as exc:
        raise HTTPException(422, "The PDF is corrupt or cannot be read") from exc
    if not any(page.text for page in pages):
        raise HTTPException(422, "This PDF contains no extractable text; it may be scanned. OCR is not supported.")
    warning = "Some pages have no extractable text and may be scanned." if any(not page.text for page in pages) else None
    return pages, warning
