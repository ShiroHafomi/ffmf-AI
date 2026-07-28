"""Excel upload/extract & export endpoints — /api/excel/*

Temp processing only — uploaded files are parsed in memory and discarded;
export files are generated on-the-fly. No database storage involved.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response

from services.excel_service import (
    MAX_FILE_SIZE,
    ALLOWED_EXTENSIONS,
    extract_all_sheets,
    extract_structured_data,
    generate_csv_string,
    generate_excel_bytes,
    parse_file,
)
from services.limiter import DEFAULT_LIMIT, limiter
from services.schemas import (
    ErrorResponse,
    ExcelUploadResponse,
    ExportPayload,
    MultiSheetResponse,
)

logger = logging.getLogger("ffms")

router = APIRouter(tags=["Excel"])


# ─────────────────────── Helpers ────────────────────────
async def _read_file_bytes(file: UploadFile | None) -> tuple[bytes, str]:
    """Validate extension/size and return ``(raw_bytes, lowercase_extension)``."""
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
    if not ext or ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported file format.")

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File too large. Maximum allowed size is 5 MB.",
        )

    return content, file.filename


# ─────────────────────── Endpoints ──────────────────────
@router.post(
    "/api/excel/upload",
    summary="Upload an expense file for structured extraction",
    responses={
        200: {
            "model": ExcelUploadResponse,
            "description": "Structured expense extraction result",
        },
        400: {"model": ErrorResponse},
    },
)
@limiter.limit(DEFAULT_LIMIT)
async def upload_expense_file(request: Request, file: UploadFile = File(...)):
    """Upload an ``.xlsx`` / ``.xls`` / ``.csv`` expense file.

    The endpoint normalises column headers (English and Vietnamese aliases
    supported — "Ngay" → ``date``, "So tien" → ``amount``, etc.), parses
    dates and amounts, and returns structured JSON. Invalid rows are
    reported in the ``skipped`` list.
    """
    content, filename = await _read_file_bytes(file)

    try:
        rows = parse_file(content, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if len(rows) < 2:
        raise HTTPException(
            status_code=400,
            detail="The file must have a header row and at least one data row.",
        )

    try:
        result = extract_structured_data(rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return result


@router.post(
    "/api/excel/preview",
    summary="Preview all sheets (headers + sample rows)",
    responses={
        200: {"model": MultiSheetResponse, "description": "Multi-sheet preview result"},
        400: {"model": ErrorResponse},
    },
)
@limiter.limit(DEFAULT_LIMIT)
async def preview_excel(request: Request, file: UploadFile = File(...)):
    """Upload a spreadsheet and inspect all sheets without structured extraction.

    Returns each sheet's headers, up to 5 sample rows, and total row count.
    """
    content, filename = await _read_file_bytes(file)

    try:
        result = extract_all_sheets(content, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"sheets": result}


@router.post(
    "/api/excel/export/xlsx",
    summary="Export JSON data as .xlsx",
    responses={
        200: {
            "content": {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}
            },
            "description": "Excel workbook download",
        },
        400: {"model": ErrorResponse},
    },
)
@limiter.limit(DEFAULT_LIMIT)
async def export_xlsx(request: Request, payload: ExportPayload):
    """Export JSON data as an ``.xlsx`` file (download)."""
    if not payload.data:
        raise HTTPException(status_code=400, detail="No data rows provided.")

    try:
        xlsx_bytes = generate_excel_bytes(
            data=payload.data,
            columns=payload.columns,
            sheet_name=payload.sheet_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("XLSX generation failed")
        raise HTTPException(
            status_code=500,
            detail="Internal server error. Please try again later.",
        )

    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{payload.filename}.xlsx"',
        },
    )


@router.post(
    "/api/excel/export/csv",
    summary="Export JSON data as .csv",
    responses={
        200: {
            "content": {"text/csv": {}},
            "description": "CSV file download",
        },
        400: {"model": ErrorResponse},
    },
)
@limiter.limit(DEFAULT_LIMIT)
async def export_csv(request: Request, payload: ExportPayload):
    """Export JSON data as a ``.csv`` file (download)."""
    if not payload.data:
        raise HTTPException(status_code=400, detail="No data rows provided.")

    try:
        csv_content = generate_csv_string(
            data=payload.data,
            columns=payload.columns,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("CSV generation failed")
        raise HTTPException(
            status_code=500,
            detail="Internal server error. Please try again later.",
        )

    return Response(
        content=csv_content.encode("utf-8-sig"),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{payload.filename}.csv"',
        },
    )