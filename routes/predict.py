"""API dự đoán chi tiêu — GET /predict/{household_id}"""

from fastapi import APIRouter, HTTPException

from services.db_service import get_monthly_expenses, get_latest_budget
from services.ai_service import predict_next_month, analyze

router = APIRouter()


@router.get("/predict/{household_id}")
def predict(household_id: int):
    """Dự đoán tổng chi tiêu tháng tiếp theo cho hộ gia đình."""

    # Bước 1: Lấy dữ liệu chi tiêu
    try:
        expenses = get_monthly_expenses(household_id)
    except ConnectionError as e:
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối database: {e}")

    # Bước 2: Kiểm tra có dữ liệu không
    if not expenses:
        raise HTTPException(
            status_code=404,
            detail=f"Không tìm thấy dữ liệu chi tiêu cho household_id={household_id}",
        )

    # Bước 3: Cần ít nhất 3 tháng dữ liệu
    if len(expenses) < 3:
        raise HTTPException(
            status_code=400,
            detail=f"Không đủ dữ liệu. Cần ít nhất 3 tháng, hiện có {len(expenses)} tháng.",
        )

    # Bước 4: Lấy ngân sách mới nhất
    try:
        budget = get_latest_budget(household_id)
    except ConnectionError as e:
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối database: {e}")

    # Bước 5: Chạy AI dự đoán
    predicted = predict_next_month(expenses)
    last_month = float(expenses[-1]["total_expense"])

    # Bước 6: Phân tích và trả kết quả
    analysis = analyze(predicted, last_month, budget)

    return {
        "predicted": predicted,
        "last_month": last_month,
        "budget": budget,
        "increase_percent": analysis["increase_percent"],
        "status": analysis["status"],
        "message": analysis["message"],
        "suggestion": analysis["suggestion"],
    }
