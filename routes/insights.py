"""API tổng hợp phân tích tài chính — GET /insights/{household_id}

Tập hợp dự đoán, phân tích danh mục, phát hiện bất thường, lời khuyên
tiết kiệm và các hành động được khuyến nghị vào một response duy nhất.
"""

from fastapi import APIRouter, HTTPException

from services.db_service import (
    get_monthly_expenses,
    get_latest_budget,
    get_category_expenses,
    get_category_budgets,
    get_monthly_incomes,
)
from services.ai_service import (
    predict_next_month,
    analyze,
    analyze_categories,
    analyze_income,
    detect_anomalies,
    generate_savings_advice,
    recommend_actions,
)

router = APIRouter()


@router.get("/insights/{household_id}")
def insights(household_id: int):
    """Tổng hợp toàn bộ phân tích tài chính cho hộ gia đình."""

    # Bước 1: Dữ liệu chi tiêu theo tháng
    try:
        expenses = get_monthly_expenses(household_id)
    except ConnectionError as e:
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối database: {e}")

    if not expenses:
        raise HTTPException(
            status_code=404,
            detail=f"Không tìm thấy dữ liệu chi tiêu cho household_id={household_id}",
        )

    if len(expenses) < 3:
        raise HTTPException(
            status_code=400,
            detail=f"Không đủ dữ liệu. Cần ít nhất 3 tháng, hiện có {len(expenses)} tháng.",
        )

    # Bước 2: Ngân sách mới nhất
    try:
        budget = get_latest_budget(household_id)
    except ConnectionError as e:
        raise HTTPException(status_code=500, detail=f"Lỗi kết nối database: {e}")

    # Bước 3: Dự đoán chi tiêu + phân tích
    predicted = predict_next_month(expenses, amount_key="total_expense")
    last_month = float(expenses[-1]["total_expense"])
    analysis = analyze(predicted, last_month, budget)

    # Bước 4: Dự đoán thu nhập (nếu đủ dữ liệu)
    try:
        incomes = get_monthly_incomes(household_id)
    except ConnectionError:
        incomes = []

    predicted_income = None
    last_month_income = None
    income_analysis = {}
    if incomes and len(incomes) >= 3:
        predicted_income = predict_next_month(incomes, amount_key="total_income")
        last_month_income = float(incomes[-1]["total_income"])
        income_analysis = analyze_income(predicted_income, last_month_income)

    # Bước 5: Phân tích danh mục (không làm sập nếu lỗi truy vấn phụ)
    try:
        category_expenses = get_category_expenses(household_id)
        category_budgets = get_category_budgets(household_id)
        current_month_total = (
            sum(float(c["total"]) for c in category_expenses)
            if category_expenses
            else 0
        )
        category_analysis = analyze_categories(
            category_expenses, category_budgets, current_month_total
        )
    except ConnectionError:
        category_analysis = {
            "categories": [],
            "overspent_categories": [],
            "suggestions": [],
            "total_budget": 0,
        }

    # Bước 6: Các phân tích nâng cao (insights)
    anomalies = detect_anomalies(expenses, amount_key="total_expense")
    savings = generate_savings_advice(predicted, predicted_income, budget)
    actions = recommend_actions(analysis, category_analysis, anomalies, savings)

    return {
        "household_id": household_id,
        "predictions": {
            "expense": {
                "predicted": predicted,
                "last_month": last_month,
                "increase_percent": analysis["increase_percent"],
                "status": analysis["status"],
            },
            "income": {
                "predicted": predicted_income,
                "last_month": last_month_income,
                "increase_percent": income_analysis.get("increase_percent"),
                "status": income_analysis.get("status"),
            },
            "budget": budget,
        },
        "analysis": {
            "message": analysis["message"],
            "suggestion": analysis["suggestion"],
        },
        "category_analysis": category_analysis,
        "anomalies": anomalies,
        "savings": savings,
        "recommended_actions": actions,
    }
