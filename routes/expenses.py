"""API quản lý chi tiêu (Expense CRUD) — /api/expenses

Được gọi nội bộ bởi Node backend (đã xác thực & phân quyền RBAC
ở tầng đó). Service này nhận `household_id` từ Node truyền xuống và
thêm các kiểm tra authz cơ bản: category phải thuộc về đúng hộ, và
các thao tác theo id chỉ thành công khi khoản đó tồn tại.

Status code theo REST: POST -> 201 (tạo mới), các thao tác còn lại -> 200.
"""

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from typing import Optional

from services.limiter import limiter, DEFAULT_LIMIT
from services.db_service import (
    insert_expense,
    list_expenses,
    get_expense_by_id,
    update_expense,
    delete_expense,
    category_belongs_to_household,
)
from services.validation import handle_db_error
from services.cache import invalidate_household

router = APIRouter(tags=["Expenses"])


# ───────────────────────── Schemas ─────────────────────────
class ExpenseCreate(BaseModel):
    household_id: int
    amount: float
    category_id: Optional[int] = None
    expense_date: Optional[str] = None  # YYYY-MM-DD
    description: Optional[str] = None
    user_id: Optional[int] = None


class ExpenseUpdate(BaseModel):
    amount: Optional[float] = Field(default=None, gt=0)
    category_id: Optional[int] = None
    expense_date: Optional[str] = None  # YYYY-MM-DD
    description: Optional[str] = None


class ExpenseOut(BaseModel):
    id: int
    household_id: int
    category_id: Optional[int] = None
    amount: float
    description: Optional[str] = None
    expense_date: Optional[str] = None
    user_id: Optional[int] = None
    category_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ───────────────────────── Helpers ─────────────────────────
_DATE_RE = __import__("re").compile(r"^\d{4}-\d{2}-\d{2}$")


def _validate_date(value: Optional[str]) -> Optional[str]:
    """Chỉ chấp nhận YYYY-MM-DD; trả về chính nó hoặc None."""
    if value is None:
        return None
    if isinstance(value, str) and _DATE_RE.match(value):
        return value
    raise HTTPException(
        status_code=400,
        detail="expense_date must be in YYYY-MM-DD format.",
    )


# ───────────────────────── Endpoints ─────────────────────────
@router.post("/api/expenses", summary="Create an expense")
@limiter.limit(DEFAULT_LIMIT)
def create_expense(request: Request, payload: ExpenseCreate):
    """Thêm một khoản chi tiêu mới (201 Created)."""
    if payload.household_id < 1:
        raise HTTPException(
            status_code=400,
            detail="Invalid household_id. Must be a positive integer.",
        )
    if not payload.amount or payload.amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="amount must be a positive number.",
        )

    expense_date = _validate_date(payload.expense_date)

    # Authz: category (nếu có) phải thuộc về đúng hộ.
    if payload.category_id is not None:
        if payload.category_id <= 0:
            raise HTTPException(status_code=400, detail="Invalid category_id.")
        try:
            if not category_belongs_to_household(
                payload.household_id, payload.category_id
            ):
                raise HTTPException(
                    status_code=400,
                    detail="category does not belong to this household.",
                )
        except ConnectionError as e:
            handle_db_error("category_belongs_to_household", e)

    try:
        new_id = insert_expense(
            household_id=payload.household_id,
            amount=payload.amount,
            category_id=payload.category_id,
            expense_date=expense_date,
            description=payload.description,
            user_id=payload.user_id,
        )
    except ConnectionError as e:
        handle_db_error("insert_expense", e)

    row = get_expense_by_id(new_id) if new_id else None
    if row is None:
        # Vừa tạo mà không đọc lại được -> lỗi DB, không lộ chi tiết.
        handle_db_error("get_expense_by_id", ConnectionError("created row not found"))
    # Ghi thành công -> xoá cache dự báo/insights của hộ để lần đọc kế tiếp
    # phản ánh dữ liệu mới (không phục vụ kết quả cũ).
    invalidate_household(payload.household_id)
    # 201 Created (spec). Trả object trực tiếp qua HTTPException để
    # status code được đảm bảo trên mọi bản FastAPI.
    raise HTTPException(
        status_code=status.HTTP_201_CREATED,
        detail=ExpenseOut(**row).model_dump(mode="json"),
    )


@router.get("/api/expenses", summary="List expenses")
@limiter.limit(DEFAULT_LIMIT)
def get_expenses(
    request: Request,
    household_id: Optional[int] = None,
    limit: int = 50,
):
    """Lấy danh sách chi tiêu (200 OK). Lọc theo hộ nếu có."""
    try:
        rows = list_expenses(household_id, limit)
    except ConnectionError as e:
        handle_db_error("list_expenses", e)
    return {"expenses": [ExpenseOut(**r) for r in rows]}


@router.get("/api/expenses/{expense_id}", summary="Get an expense")
@limiter.limit(DEFAULT_LIMIT)
def get_expense(request: Request, expense_id: int):
    """Lấy chi tiết một khoản (200 OK -> {expense})."""
    try:
        row = get_expense_by_id(expense_id)
    except ConnectionError as e:
        handle_db_error("get_expense_by_id", e)
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found.")
    return {"expense": ExpenseOut(**row)}


@router.put("/api/expenses/{expense_id}", summary="Update an expense")
@limiter.limit(DEFAULT_LIMIT)
def update_expense_endpoint(request: Request, expense_id: int, payload: ExpenseUpdate):
    """Cập nhật một khoản (200 OK). Chỉ các trường được truyền."""
    # Đảm bảo tồn tại trước khi sửa.
    try:
        existing = get_expense_by_id(expense_id)
    except ConnectionError as e:
        handle_db_error("get_expense_by_id", e)
    if existing is None:
        raise HTTPException(status_code=404, detail="Expense not found.")

    expense_date = _validate_date(payload.expense_date)

    # Authz: category mới (nếu có) phải thuộc về đúng hộ của khoản này.
    if payload.category_id is not None:
        hid = existing.get("household_id")
        if payload.category_id <= 0:
            raise HTTPException(status_code=400, detail="Invalid category_id.")
        try:
            if not category_belongs_to_household(hid, payload.category_id):
                raise HTTPException(
                    status_code=400,
                    detail="category does not belong to this household.",
                )
        except ConnectionError as e:
            handle_db_error("category_belongs_to_household", e)

    try:
        ok = update_expense(
            expense_id,
            amount=payload.amount,
            category_id=payload.category_id,
            expense_date=expense_date,
            description=payload.description,
        )
    except ConnectionError as e:
        handle_db_error("update_expense", e)

    if not ok:
        raise HTTPException(status_code=404, detail="Expense not found.")

    # Ghi thành công -> xoá cache của hộ (household_id lấy từ khoản đang sửa).
    hid = existing.get("household_id")
    if hid is not None:
        invalidate_household(hid)

    row = get_expense_by_id(expense_id)
    return ExpenseOut(**row)


@router.delete("/api/expenses/{expense_id}", summary="Delete an expense")
@limiter.limit(DEFAULT_LIMIT)
def delete_expense_endpoint(request: Request, expense_id: int):
    """Xoá một khoản (200 OK)."""
    # Lấy household_id TRƯỚC khi xoá để có thể invalidate cache sau đó.
    try:
        existing = get_expense_by_id(expense_id)
    except ConnectionError as e:
        handle_db_error("get_expense_by_id", e)
    if existing is None:
        raise HTTPException(status_code=404, detail="Expense not found.")

    try:
        ok = delete_expense(expense_id)
    except ConnectionError as e:
        handle_db_error("delete_expense", e)
    if not ok:
        raise HTTPException(status_code=404, detail="Expense not found.")

    # Xoá thành công -> xoá cache dự báo/insights của hộ.
    hid = existing.get("household_id")
    if hid is not None:
        invalidate_household(hid)

    return {"deleted": expense_id, "ok": True}
