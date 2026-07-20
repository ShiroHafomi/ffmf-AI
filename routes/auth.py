"""API xác thực (auth) — /api/auth/register

Endpoint này CHỈ tọo user vào MySQL chung (cùng DB với Node
backend). Nó mirrors convention của Node: bcrypt cost 10 (tương thích
với bcryptjs), display_id = 'U' + 8 hex, role_id = 3 (Member),
status = 1. Trả về { user } (không có password_hash) theo đúng
spec. Node backend vẫn là auth authority (token/JWT) — service này
chỉ làm tầng DB-provisioning nội bộ.
"""

import bcrypt
import re

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from typing import Optional

from services.limiter import limiter, DEFAULT_LIMIT
from services.db_service import (
    email_exists,
    create_user,
    find_user_by_id,
)
from services.validation import handle_db_error

router = APIRouter(tags=["Auth"])


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class PublicUser(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    full_name: Optional[str] = None
    role_id: int
    household_id: Optional[int] = None
    status: int
    household_role: Optional[str] = None

    model_config = {"from_attributes": True}


@router.post("/api/auth/register", summary="Register a new user", status_code=status.HTTP_201_CREATED)
@limiter.limit(DEFAULT_LIMIT)
def register(request: Request, payload: RegisterRequest):
    """Đăng ký user mới (201 Created -> { user })."""
    email = (payload.email or "").strip().lower()
    if not email or not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="A valid email is required.")
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(
            status_code=400,
            detail="password must be at least 6 characters.",
        )

    # Trùng email -> 409 (giống Node backend).
    try:
        if email_exists(email):
            raise HTTPException(
                status_code=409, detail="email already registered."
            )
    except ConnectionError as e:
        handle_db_error("email_exists", e)

    # bcrypt cost 10 — hash tương thích với bcryptjs của Node.
    try:
        pw_hash = bcrypt.hashpw(
            payload.password.encode("utf-8"), bcrypt.gensalt(10)
        ).decode("utf-8")
    except (ValueError, TypeError) as e:
        handle_db_error("bcrypt_hash", e)

    try:
        new_id = create_user(email, pw_hash, payload.name)
    except ConnectionError as e:
        handle_db_error("create_user", e)

    row = find_user_by_id(new_id) if new_id else None
    if row is None:
        handle_db_error(
            "find_user_by_id", ConnectionError("created user not found")
        )

    # 201 Created (spec), body = { user } (không lộ password_hash).
    raise HTTPException(
        status_code=status.HTTP_201_CREATED,
        detail=PublicUser(**row).model_dump(mode="json"),
    )
