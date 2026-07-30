"""Admin API routes — system-wide management endpoints.

All routes require the X-Admin-Key header matching ADMIN_API_KEY env var.
If ADMIN_API_KEY is not set, these endpoints return 404 (hidden).
"""

import os
import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services.limiter import limiter, DEFAULT_LIMIT
from services.admin_service import (
    list_users,
    set_user_role,
    delete_user,
    create_user,
    get_admin_user,
    list_households,
    soft_delete_household,
    get_household_members,
    list_expenses,
    list_budgets,
    list_categories,
    list_incomes,
    get_system_summary,
    get_system_health,
    read_logs,
    block_user,
    unblock_user,
    list_blocklist,
    get_ai_overview,
)
from services import cache

router = APIRouter(tags=["Admin"])

# ───────────────────────── Admin key validation ─────────────────────────
ADMIN_KEY = os.getenv("ADMIN_API_KEY", "").strip()
_ADMIN_KEY_REQUIRED = bool(ADMIN_KEY)


def _constant_time_compare(a: str, b: str) -> bool:
    a_b = a.encode("utf-8")
    b_b = b.encode("utf-8")
    if len(a_b) != len(b_b):
        return False
    result = 0
    for x, y in zip(a_b, b_b):
        result |= x ^ y
    return result == 0


async def require_admin_key(request: Request):
    """Dependency that validates X-Admin-Key header."""
    if not _ADMIN_KEY_REQUIRED:
        # Admin endpoints completely hidden if no key configured
        raise HTTPException(status_code=404, detail="Not found")

    provided = request.headers.get("X-Admin-Key", "")
    if not provided or not _constant_time_compare(provided, ADMIN_KEY):
        raise HTTPException(
            status_code=403,
            detail="Admin access forbidden",
        )


# ───────────────────────── Per-household rate limiting ─────────────────────────
# Simple in-memory token bucket: 10 requests per minute per household_id
_HOUSEHOLD_RATE_LIMIT = 10
_HOUSEHOLD_RATE_WINDOW = 60  # seconds
_household_buckets: dict[int, list[float]] = {}


def _check_household_rate_limit(household_id: int) -> tuple[bool, int]:
    """Check and consume a token from the household's bucket.

    Returns (allowed, retry_after_seconds).
    """
    now = time.time()
    bucket = _household_buckets.get(household_id, [])
    # Remove expired tokens
    bucket = [t for t in bucket if now - t < _HOUSEHOLD_RATE_WINDOW]

    if len(bucket) >= _HOUSEHOLD_RATE_LIMIT:
        # Bucket full - calculate when next token available
        oldest = bucket[0] if bucket else now
        retry_after = int(_HOUSEHOLD_RATE_WINDOW - (now - oldest)) + 1
        return False, max(1, retry_after)

    # Add current request
    bucket.append(now)
    _household_buckets[household_id] = bucket
    return True, 0


# Apply admin auth to all routes via dependency


# ───────────────────────── Schemas ─────────────────────────
class UserRoleUpdate(BaseModel):
    role_id: int = Field(..., description="1 = admin, 3 = member")


class DeleteUserRequest(BaseModel):
    acting_user_id: int = Field(..., description="ID of the admin performing the deletion")


class UserCreateRequest(BaseModel):
    email: str = Field(..., description="User email (must be unique)")
    name: Optional[str] = Field(default=None, description="User display name")
    password: Optional[str] = Field(default=None, description="Optional password (auto-generated if omitted)")
    role_id: int = Field(default=3, description="1 = admin, 3 = member")
    household_id: Optional[int] = Field(default=None, description="Optional household ID to assign user to")


class BlockRequest(BaseModel):
    acting_user_id: int = Field(..., description="ID of the admin performing the block")
    reason: Optional[str] = Field(default=None, description="Optional reason for blocking")


class CacheClearRequest(BaseModel):
    household_id: Optional[int] = Field(
        default=None, description="If provided, clear only this household's cache"
    )


# ───────────────────────── System overview ─────────────────────────
@router.get("/admin/stats", summary="System overview statistics")
@limiter.limit(DEFAULT_LIMIT)
def admin_stats(request: Request, _: None = Depends(require_admin_key)):
    """Return aggregate counts for the admin dashboard home page."""
    try:
        return get_system_summary()
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_stats", e)


@router.get("/admin/me", summary="Get current admin user info")
@limiter.limit(DEFAULT_LIMIT)
def admin_me(request: Request, _: None = Depends(require_admin_key)):
    """Return the first admin user (role_id=1) for acting_user_id purposes."""
    try:
        admin = get_admin_user()
        if not admin:
            raise HTTPException(status_code=404, detail="No admin user found")
        return {
            "admin_user_id": admin["id"],
            "email": admin["email"],
            "name": admin["name"],
            "role_id": admin["role_id"],
        }
    except HTTPException:
        raise
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_me", e)


# ───────────────────────── Users ─────────────────────────
@router.get("/admin/users", summary="List all users (paginated)")
@limiter.limit(DEFAULT_LIMIT)
def admin_list_users(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    _: None = Depends(require_admin_key),
):
    """Paginated user list with optional search by name/email."""
    try:
        return list_users(page=page, page_size=page_size, search=search)
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_list_users", e)


@router.post("/admin/users", summary="Create a new user")
@limiter.limit(DEFAULT_LIMIT)
def admin_create_user(
    request: Request,
    payload: UserCreateRequest,
    _: None = Depends(require_admin_key),
):
    """Create a new user. If no password provided, generates a secure random one.
    Returns the created user with the plaintext password (only if auto-generated)."""
    if payload.role_id not in (1, 3):
        raise HTTPException(status_code=400, detail="role_id must be 1 (admin) or 3 (member)")
    try:
        created = create_user(
            email=payload.email,
            name=payload.name,
            password=payload.password,
            role_id=payload.role_id,
            household_id=payload.household_id,
        )
        return {"user": created, "created": True}
    except ValueError as e:
        msg = str(e).lower()
        if "email" in msg and "exist" in msg:
            raise HTTPException(status_code=409, detail="Email already registered")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_create_user", e)


@router.put("/admin/users/{user_id}/role", summary="Change user role")
@limiter.limit(DEFAULT_LIMIT)
def admin_set_user_role(
    request: Request,
    user_id: int,
    payload: UserRoleUpdate,
    _: None = Depends(require_admin_key),
):
    """Update a user's global role (1=admin, 3=member)."""
    if user_id < 1 or payload.role_id not in (1, 3):
        raise HTTPException(status_code=400, detail="Invalid user_id or role_id")
    try:
        updated = set_user_role(user_id, payload.role_id)
        if not updated:
            raise HTTPException(status_code=404, detail="User not found")
        return {"id": user_id, "role_id": payload.role_id, "updated": True}
    except ValueError as e:
        msg = str(e).lower()
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_set_user_role", e)


@router.delete("/admin/users/{user_id}", summary="Delete a user")
@limiter.limit(DEFAULT_LIMIT)
def admin_delete_user(
    request: Request,
    user_id: int,
    acting_user_id: int,
    _: None = Depends(require_admin_key),
):
    """Permanently delete a user (with FK cleanup). Blocks self-delete and last-admin removal."""
    if user_id < 1 or acting_user_id < 1:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    try:
        delete_user(user_id, acting_user_id)
        return {"id": user_id, "deleted": True}
    except ValueError as e:
        msg = str(e).lower()
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_delete_user", e)


# ───────────────────────── Households ─────────────────────────
@router.get("/admin/households", summary="List all households (paginated)")
@limiter.limit(DEFAULT_LIMIT)
def admin_list_households(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    include_deleted: bool = False,
    _: None = Depends(require_admin_key),
):
    """List households with pagination and optional filter for deleted."""
    try:
        return list_households(page=page, page_size=page_size, include_deleted=include_deleted)
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_list_households", e)


@router.delete("/admin/households/{household_id}", summary="Soft-delete a household")
@limiter.limit(DEFAULT_LIMIT)
def admin_delete_household(
    request: Request,
    household_id: int,
    _: None = Depends(require_admin_key),
):
    """Mark a household as deleted (is_deleted = 1). Does not remove data."""
    if household_id < 1:
        raise HTTPException(status_code=400, detail="Invalid household_id")
    try:
        deleted = soft_delete_household(household_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Household not found")
        return {"id": household_id, "deleted": True}
    except ValueError as e:
        msg = str(e).lower()
        if "not found" in msg:
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_delete_household", e)


@router.get("/admin/households/{household_id}/members", summary="List household members")
@limiter.limit(DEFAULT_LIMIT)
def admin_household_members(
    request: Request,
    household_id: int,
    _: None = Depends(require_admin_key),
):
    """Return all members of a household with their roles."""
    if household_id < 1:
        raise HTTPException(status_code=400, detail="Invalid household_id")
    try:
        members = get_household_members(household_id)
        return {"household_id": household_id, "members": members}
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_household_members", e)


# ───────────────────────── Expenses ─────────────────────────
@router.get("/admin/expenses", summary="List all expenses (global, paginated)")
@limiter.limit(DEFAULT_LIMIT)
def admin_list_expenses(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    household_id: Optional[int] = None,
    _: None = Depends(require_admin_key),
):
    """Global expense list, optionally filtered by household."""
    try:
        return list_expenses(page=page, page_size=page_size, household_id=household_id)
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_list_expenses", e)


# ───────────────────────── Budgets ─────────────────────────
@router.get("/admin/budgets", summary="List all budgets (global, paginated)")
@limiter.limit(DEFAULT_LIMIT)
def admin_list_budgets(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    household_id: Optional[int] = None,
    _: None = Depends(require_admin_key),
):
    """Global budget list, optionally filtered by household."""
    try:
        return list_budgets(page=page, page_size=page_size, household_id=household_id)
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_list_budgets", e)


# ───────────────────────── Categories ─────────────────────────
@router.get("/admin/categories", summary="List all categories (global, paginated)")
@limiter.limit(DEFAULT_LIMIT)
def admin_list_categories(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    household_id: Optional[int] = None,
    _: None = Depends(require_admin_key),
):
    """Global category list, optionally filtered by household."""
    try:
        return list_categories(page=page, page_size=page_size, household_id=household_id)
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_list_categories", e)


# ───────────────────────── Incomes ─────────────────────────
@router.get("/admin/incomes", summary="List all incomes (global, paginated)")
@limiter.limit(DEFAULT_LIMIT)
def admin_list_incomes(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    household_id: Optional[int] = None,
    _: None = Depends(require_admin_key),
):
    """Global income list, optionally filtered by household."""
    try:
        return list_incomes(page=page, page_size=page_size, household_id=household_id)
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_list_incomes", e)


# ───────────────────────── Cache management ─────────────────────────
@router.get("/admin/cache", summary="Cache statistics")
@limiter.limit(DEFAULT_LIMIT)
def admin_cache_stats(request: Request, _: None = Depends(require_admin_key)):
    """Return cache size, TTL, per-household breakdown."""
    return cache.get_admin_stats()


@router.post("/admin/cache/clear", summary="Clear cache")
@limiter.limit(DEFAULT_LIMIT)
def admin_clear_cache(request: Request, payload: CacheClearRequest, _: None = Depends(require_admin_key)):
    """Clear entire cache or just one household's entries."""
    if payload.household_id:
        count = cache.clear_household(payload.household_id)
        return {"cleared": count, "household_id": payload.household_id}
    else:
        count = cache.clear_all()
        return {"cleared": count, "all": True}


# ───────────────────────── System health ─────────────────────────
@router.get("/admin/health", summary="System health & metrics")
@limiter.limit(DEFAULT_LIMIT)
def admin_health(request: Request, _: None = Depends(require_admin_key)):
    """DB pool status, cache stats, uptime, rate limit config."""
    try:
        return get_system_health()
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_health", e)


# ───────────────────────── Logs ─────────────────────────
@router.get("/admin/logs", summary="Application logs")
@limiter.limit(DEFAULT_LIMIT)
def admin_logs(
    request: Request,
    level: Optional[str] = None,
    date: Optional[str] = None,
    limit: int = 500,
    _: None = Depends(require_admin_key),
):
    """Read recent application log entries, optionally filtered by level/date."""
    try:
        limit = max(1, min(int(limit), 2000))
        logs = read_logs(level=level, date=date, limit=limit)
        return {"logs": logs, "count": len(logs)}
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_logs", e)


# ───────────────────────── Blocklist ─────────────────────────
@router.get("/admin/blocklist", summary="List blocked users (paginated)")
@limiter.limit(DEFAULT_LIMIT)
def admin_list_blocklist(
    request: Request,
    page: int = 1,
    page_size: int = 50,
    _: None = Depends(require_admin_key),
):
    """Return paginated list of currently blocked users."""
    try:
        return list_blocklist(page=page, page_size=page_size)
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_list_blocklist", e)


@router.post("/admin/blocklist/{user_id}", summary="Block a user")
@limiter.limit(DEFAULT_LIMIT)
def admin_block_user(
    request: Request,
    user_id: int,
    payload: BlockRequest,
    _: None = Depends(require_admin_key),
):
    """Block a user from authenticating. Re-activates if previously blocked."""
    if user_id < 1 or payload.acting_user_id < 1:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    try:
        return block_user(user_id, payload.acting_user_id, payload.reason)
    except ValueError as e:
        msg = str(e).lower()
        status_code = 404 if "not found" in msg else 400
        raise HTTPException(status_code=status_code, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_block_user", e)


@router.delete("/admin/blocklist/{user_id}", summary="Unblock a user")
@limiter.limit(DEFAULT_LIMIT)
def admin_unblock_user(
    request: Request,
    user_id: int,
    _: None = Depends(require_admin_key),
):
    """Remove a user from the active blocklist."""
    if user_id < 1:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    try:
        updated = unblock_user(user_id)
        return {"user_id": user_id, "unblocked": updated}
    except Exception as e:
        from services.validation import handle_db_error
        handle_db_error("admin_unblock_user", e)


# ───────────────────────── AI Overview ─────────────────────────
@router.get("/admin/ai-overview/{household_id}", summary="AI analysis overview for a household")
@limiter.limit(DEFAULT_LIMIT)
def admin_ai_overview(
    request: Request,
    household_id: int,
    admin_id: Optional[int] = None,
    _: None = Depends(require_admin_key),
):
    """Run all AI analyses (forecast, anomalies, savings, categories) for a household."""
    if household_id < 1:
        raise HTTPException(status_code=400, detail="Invalid household_id")

    # Per-household rate limit (10 req/min)
    allowed, retry_after = _check_household_rate_limit(household_id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests for this household",
            headers={"Retry-After": str(retry_after)},
        )

    try:
        result = get_ai_overview(household_id)
        # Log admin access for audit
        from services.ai_service import log_admin_ai_access
        log_admin_ai_access(
            admin_id=admin_id or 0,
            household_id=household_id,
            endpoint="ai_overview",
            status="ok",
        )
        return result
    except Exception as e:
        from services.ai_service import log_admin_ai_access
        log_admin_ai_access(
            admin_id=admin_id or 0,
            household_id=household_id,
            endpoint="ai_overview",
            status="error",
        )
        from services.validation import handle_db_error
        handle_db_error("admin_ai_overview", e)