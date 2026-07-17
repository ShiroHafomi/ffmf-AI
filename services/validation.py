"""Shared input validation for the prediction/insights endpoints.

Centralises the sanity checks that apply to every request so the route
handlers stay focused on orchestration. Any violation raises HTTPException
with a generic message — we never echo the offending raw value back to the
caller, which avoids leaking request internals.
"""

from fastapi import HTTPException


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
    if threshold < 0:
        return 0.0
    if threshold > 100:
        return 100.0
    return threshold
