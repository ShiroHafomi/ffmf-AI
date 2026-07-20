"""Shared input validation for the prediction/insights endpoints.

Centralises the sanity checks that apply to every request so the route
handlers stay focused on orchestration. Any violation raises HTTPException
with a generic message — we never echo the offending raw value back to the
caller, which avoids leaking request internals.
"""

import logging

from fastapi import HTTPException

logger = logging.getLogger("ffms")


def handle_db_error(context: str, exc: Exception) -> None:
    """Log the real DB error server-side but raise a *generic* 500.

    The raw driver message (host, user, SQLSTATE, vendor version) must not
    leak to the API client — only a generic detail is returned, matching the
    project rule that error responses never echo raw values.
    """
    logger.error("Database error during %s: %s", context, exc)
    raise HTTPException(
        status_code=500,
        detail="Database connection error. Please try again later.",
    )


def validate_household_id(household_id: int) -> None:
    """household_id must be a positive integer (valid DB primary key)."""
    if household_id is None or household_id < 1:
        raise HTTPException(
            status_code=400,
            detail="Invalid household_id. Must be a positive integer.",
        )


def validate_threshold(threshold: float) -> float:
    """Clamp the default alert threshold to a sane 0-100 (%) range.

    Returns the clamped value so callers can use it directly.
    """
    if threshold is None:
        return 80.0
    return max(0.0, min(100.0, float(threshold)))
