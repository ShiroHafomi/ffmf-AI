"""API quản lý hộ gia đình (Household module) — /api/households

Đây là FastAPI mirror của module households của Node backend, thao tác trên
cùng DB MySQL `ffms` (households / household_members / users).

Xác thực: service này chạy nội bộ, chỉ nhận call từ Node backend (đã qua
X-API-Key). Node forward user id đã xác thực vào header `X-User-Id` — service
này TIN header này (không tự verify JWT). Từ đó suy ra owner khi tạo hộ, lấy
"hộ của tôi", và chặn các hành động quản lý (403) nếu người gọi không phải owner
của hộ tương ứng.

Quy tắc vai trò (household_members.role): 'owner' | 'parent' | 'child'.
Owner được gán khi tạo và cố định (không đổi xuống / không xoá qua API).
"""

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

from services.limiter import limiter, DEFAULT_LIMIT
from services.household_service import (
    create_household,
    get_household,
    get_household_members,
    find_households_by_name,
    find_user_by_email,
    add_member,
    set_member_role,
    remove_member,
    update_household,
    soft_delete_household,
    ASSIGNABLE_ROLES,
    HouseholdError,
)
from services.db_service import find_user_by_id
from services.validation import handle_db_error

router = APIRouter(tags=["Households"])


# ───────────────────────── Helpers ─────────────────────────
def _safe(context: str, fn, *args, **kwargs):
    """Chạy hàm service, dịch lỗi thành HTTP.

    ConnectionError (lỗi DB) -> 500 chung qua handle_db_error.
    HouseholdError (nghiệp vụ) -> status tương ứng.
    """
    try:
        return fn(*args, **kwargs)
    except ConnectionError as e:
        handle_db_error(context, e)
    except HouseholdError as e:
        raise HTTPException(status_code=e.status, detail=e.message)


def get_forwarded_user_id(request: Request) -> int:
    """Đọc user id từ header X-User-Id (do Node forward, nội bộ tin cậy)."""
    raw = request.headers.get("X-User-Id")
    if not raw:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header.")
    try:
        return int(raw)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid X-User-Id header.")


def get_caller(request: Request) -> dict:
    """Trả context người gọi (từ users + household_members). 401 nếu thiếu."""
    user_id = get_forwarded_user_id(request)
    caller = _safe("find_user_by_id", find_user_by_id, user_id)
    if caller is None:
        raise HTTPException(status_code=401, detail="user not found")
    return caller


def require_owner_of(request: Request, household_id: int) -> dict:
    """Chặn nếu người gọi không phải owner của hộ household_id.

    Trả 404 nếu hộ không tồn tại (đã bị soft-delete hoặc sai id); 403 nếu hộ
    tồn tại nhưng người gọi không phải owner.
    """
    caller = get_caller(request)
    household = _safe("get_household", get_household, household_id)
    if household is None:
        raise HTTPException(status_code=404, detail="Household not found.")
    if (
        caller.get("household_id") != household_id
        or caller.get("household_role") != "owner"
    ):
        raise HTTPException(
            status_code=403,
            detail="Only the household owner can perform this action.",
        )
    return caller


def require_owner_self(request: Request) -> int:
    """Chặn (403) nếu người gọi không phải owner của hộ của chính họ.
    Trả về household_id của người gọi."""
    caller = get_caller(request)
    hid = caller.get("household_id")
    if hid is None or caller.get("household_role") != "owner":
        raise HTTPException(
            status_code=403,
            detail="Only the household owner can perform this action.",
        )
    return hid


# ───────────────────────── Schemas ─────────────────────────
class CreateHouseholdRequest(BaseModel):
    name: str
    description: Optional[str] = None


class AddMemberRequest(BaseModel):
    user_id: int = Field(alias="userId")
    role: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class UpdateHouseholdRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class InviteRequest(BaseModel):
    email: str
    role: Optional[str] = None


class ChangeRoleRequest(BaseModel):
    role: str


# ───────────────────────── Endpoints ─────────────────────────
@router.post("/api/households", summary="Create a household")
@limiter.limit(DEFAULT_LIMIT)
def create_household_endpoint(request: Request, payload: CreateHouseholdRequest):
    """Tạo hộ mới. Owner = người gọi (X-User-Id). 409 nếu đã thuộc hộ khác."""
    user_id = get_forwarded_user_id(request)
    caller = _safe("find_user_by_id", find_user_by_id, user_id)
    if caller is None:
        raise HTTPException(status_code=401, detail="user not found")
    if caller.get("household_id"):
        raise HTTPException(
            status_code=409, detail="You already belong to a household"
        )

    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    new_id = _safe(
        "create_household", create_household, name, payload.description, user_id
    )
    # 201 Created (spec); body = { id, name, owner_id }.
    raise HTTPException(
        status_code=status.HTTP_201_CREATED,
        detail={"id": new_id, "name": name, "owner_id": user_id},
    )


@router.get("/api/households/me", summary="Get my household")
@limiter.limit(DEFAULT_LIMIT)
def get_my_household(request: Request):
    """Lấy hộ của người gọi kèm danh sách thành viên."""
    caller = get_caller(request)
    hid = caller.get("household_id")
    if not hid:
        return {"household": None, "members": []}
    household = _safe("get_household", get_household, hid)
    if household is None:
        return {"household": None, "members": []}
    members = _safe("get_household_members", get_household_members, hid)
    return {"household": household, "members": members}


@router.get("/api/households/{household_id}", summary="Get a household by id")
@limiter.limit(DEFAULT_LIMIT)
def get_household_by_id(request: Request, household_id: int):
    """Truy vấn chi tiết hộ theo id (kèm thành viên)."""
    household = _safe("get_household", get_household, household_id)
    if household is None:
        raise HTTPException(status_code=404, detail="Household not found.")
    members = _safe("get_household_members", get_household_members, household_id)
    return {"household": household, "members": members}


@router.get("/api/households", summary="Search households by name")
@limiter.limit(DEFAULT_LIMIT)
def search_households(request: Request, name: Optional[str] = None):
    """Truy vấn chi tiết hộ theo tên (khớp một phần)."""
    if not name or not name.strip():
        raise HTTPException(
            status_code=400, detail="provide ?name= to search households"
        )
    rows = _safe("find_households_by_name", find_households_by_name, name.strip())
    return {"households": rows}


@router.post("/api/households/{household_id}/members", summary="Add a member")
@limiter.limit(DEFAULT_LIMIT)
def add_member_endpoint(
    request: Request, household_id: int, payload: AddMemberRequest
):
    """Thêm thành viên vào hộ (owner only). id của household_members do DB sinh."""
    require_owner_of(request, household_id)
    if payload.user_id < 1:
        raise HTTPException(status_code=400, detail="Invalid userId.")
    role = payload.role or "parent"
    if role not in ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=400, detail="role must be 'parent' or 'child'"
        )
    member_id = _safe(
        "add_member", add_member, household_id, payload.user_id, role
    )
    return {"id": member_id, "user_id": payload.user_id, "role": role}


@router.put("/api/households/{household_id}", summary="Update a household")
@limiter.limit(DEFAULT_LIMIT)
def update_household_endpoint(
    request: Request, household_id: int, payload: UpdateHouseholdRequest
):
    """Cập nhật tên / mô tả hộ (owner only)."""
    require_owner_of(request, household_id)
    name = (payload.name or "").strip() if payload.name is not None else None
    desc = payload.description
    if name is None and desc is None:
        raise HTTPException(
            status_code=400,
            detail="Nothing to update: provide name or description.",
        )
    ok = _safe("update_household", update_household, household_id, name, desc)
    if not ok:
        raise HTTPException(status_code=404, detail="Household not found.")
    household = _safe("get_household", get_household, household_id)
    return household


@router.delete("/api/households/{household_id}", summary="Soft-delete a household")
@limiter.limit(DEFAULT_LIMIT)
def delete_household_endpoint(request: Request, household_id: int):
    """Xoá mềm hộ (is_deleted = 1), owner only."""
    require_owner_of(request, household_id)
    ok = _safe("soft_delete_household", soft_delete_household, household_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Household not found.")
    return {"id": household_id, "deleted": True}


@router.delete("/api/households/{household_id}/members/{user_id}", summary="Remove a member")
@limiter.limit(DEFAULT_LIMIT)
def remove_member_endpoint(
    request: Request, household_id: int, user_id: int
):
    """Xoá thành viên khỏi hộ (owner only). Không cho xoá owner (400)."""
    require_owner_of(request, household_id)
    if user_id < 1:
        raise HTTPException(status_code=400, detail="Invalid userId.")
    _safe("remove_member", remove_member, household_id, user_id)
    return {"id": user_id, "removed": True}


@router.post("/api/households/invite", summary="Invite a member by email")
@limiter.limit(DEFAULT_LIMIT)
def invite_endpoint(request: Request, payload: InviteRequest):
    """Mời (thêm) user hiện có vào hộ của người gọi theo email (owner only)."""
    hid = require_owner_self(request)
    email = (payload.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="a valid email is required")
    role = payload.role or "parent"
    if role not in ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=400, detail="role must be 'parent' or 'child'"
        )
    user = _safe("find_user_by_email", find_user_by_email, email)
    if user is None:
        raise HTTPException(status_code=404, detail="No user with that email.")
    member_id = _safe("add_member", add_member, hid, user["id"], role)
    return {"id": member_id, "email": email, "role": role}


@router.patch("/api/households/members/{user_id}/role", summary="Change a member's role")
@limiter.limit(DEFAULT_LIMIT)
def change_role_endpoint(
    request: Request, user_id: int, payload: ChangeRoleRequest
):
    """Đổi vai trò thành viên trong hộ của người gọi (owner only)."""
    hid = require_owner_self(request)
    if user_id < 1:
        raise HTTPException(status_code=400, detail="Invalid userId.")
    role = (payload.role or "").strip()
    if role not in ASSIGNABLE_ROLES:
        raise HTTPException(
            status_code=400, detail="role must be 'parent' or 'child'"
        )
    ok = _safe("set_member_role", set_member_role, hid, user_id, role)
    if not ok:
        raise HTTPException(status_code=404, detail="Member not found in household.")
    return {"id": user_id, "role": role}
