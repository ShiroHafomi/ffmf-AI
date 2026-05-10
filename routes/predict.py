"""API dự đoán chi tiêu — GET /predict/{household_id}"""

from fastapi import APIRouter, HTTPException

from services.db_service import get_monthly_expenses, get_latest_budget, get_category_expenses, get_category_budgets, get_monthly_incomes
from services.ai_service import predict_next_month, analyze, analyze_categories, analyze_income

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

    # Bước 5: Chạy AI dự đoán chi tiêu
    predicted = predict_next_month(expenses, amount_key="total_expense")
    last_month = float(expenses[-1]["total_expense"])

    # Bước 5.5: Dự đoán thu nhập
    try:
        incomes = get_monthly_incomes(household_id)
    except ConnectionError as e:
        incomes = []
    
    predicted_income = None
    last_month_income = None
    income_analysis = {}

    if incomes and len(incomes) >= 3:
        predicted_income = predict_next_month(incomes, amount_key="total_income")
        last_month_income = float(incomes[-1]["total_income"])
        income_analysis = analyze_income(predicted_income, last_month_income)

    # Bước 6: Phân tích và trả kết quả
    analysis = analyze(predicted, last_month, budget)

    # Bước 7: Phân tích danh mục
    category_expenses = get_category_expenses(household_id)
    category_budgets = get_category_budgets(household_id)
    
    current_month_total = sum([float(c["total"]) for c in category_expenses]) if category_expenses else 0
    category_analysis = analyze_categories(category_expenses, category_budgets, current_month_total)

    return {
        "predicted": predicted,
        "last_month": last_month,
        "budget": budget,
        "increase_percent": analysis["increase_percent"],
        "status": analysis["status"],
        "message": analysis["message"],
        "suggestion": analysis["suggestion"],
        "category_analysis": category_analysis,
        "predicted_income": predicted_income,
        "last_month_income": last_month_income,
        "income_increase_percent": income_analysis.get("increase_percent"),
        "income_status": income_analysis.get("status"),
        "income_message": income_analysis.get("message"),
        "income_suggestion": income_analysis.get("suggestion"),
    }
