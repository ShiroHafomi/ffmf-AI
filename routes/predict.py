"""API dự đoán chi tiêu — GET /predict/{household_id}"""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional

from services.limiter import limiter, DEFAULT_LIMIT
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
    suggest_cutbacks,
    evaluate_alert_thresholds,
)
from services.validation import validate_household_id, validate_threshold

router = APIRouter()


@router.get("/predict/{household_id}")
@limiter.limit(DEFAULT_LIMIT)
def predict(
    request: Request,
    household_id: int,
    threshold: float = 80,
    category_thresholds: Optional[str] = None,
):
    """Dự đoán tổng chi tiêu tháng tiếp theo cho hộ gia đình (RAG + fallback)."""

    # Bảo mật: validate đầu vào trước khi truy vấn DB.
    validate_household_id(household_id)
    threshold = validate_threshold(threshold)

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

    # Bước 4.5: Truy xuất (retrieve) phân rã danh mục làm ngữ cảnh cho RAG.
    # Nằm ngoài luồng chính — nếu lỗi truy vấn phụ thì bỏ qua, không làm sập.
    category_expenses: list[dict] = []
    category_budgets: list[dict] = []
    try:
        category_expenses = get_category_expenses(household_id)
        category_budgets = get_category_budgets(household_id)
    except ConnectionError:
        pass
    current_month_total = (
        sum(float(c["total"]) for c in category_expenses) if category_expenses else 0
    )

    # Bước 5: Dự đoán bằng RAG (Claude), fallback LinearRegression khi cần.
    pred_res = predict_next_month(
        expenses,
        amount_key="total_expense",
        category_context=category_expenses,
        budget=budget,
    )
    predicted = float(pred_res["predicted"])
    last_month = float(expenses[-1]["total_expense"])

    # Bước 5.5: Dự đoán thu nhập (nếu đủ dữ liệu)
    try:
        incomes = get_monthly_incomes(household_id)
    except ConnectionError:
        incomes = []

    predicted_income = None
    last_month_income = None
    income_analysis = {}
    if incomes and len(incomes) >= 3:
        inc_res = predict_next_month(incomes, amount_key="total_income")
        predicted_income = float(inc_res["predicted"])
        last_month_income = float(incomes[-1]["total_income"])
        income_analysis = analyze_income(predicted_income, last_month_income)

    # Bước 6: Phân tích và trả kết quả
    analysis = analyze(predicted, last_month, budget)

    # Bước 7: Phân tích danh mục.
    try:
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

    # Bước 7.5: Đề xuất cắt giảm phần vượt ngân sách + ngưỡng cảnh báo theo lever.
    thresholds: dict[str, float] = {}
    if category_thresholds:
        for part in category_thresholds.split(","):
            if ":" not in part:
                continue
            name, val = part.split(":", 1)
            try:
                thresholds[name.strip()] = float(val.strip())
            except ValueError:
                continue
    cutbacks = suggest_cutbacks(category_analysis["categories"])
    alerts = evaluate_alert_thresholds(
        category_analysis["categories"],
        thresholds,
        default_threshold=threshold,
    )

    return {
        "predicted": predicted,
        "last_month": last_month,
        "budget": budget,
        "increase_percent": analysis["increase_percent"],
        "status": analysis["status"],
        "message": analysis["message"],
        "suggestion": analysis["suggestion"],
        # Thông tin từ RAG (Claude) — method cho biết có thực sự dùng LLM hay fallback.
        "prediction_method": pred_res.get("method"),
        "prediction_confidence": pred_res.get("confidence"),
        "prediction_explanation": pred_res.get("explanation"),
        "prediction_suggestions": pred_res.get("suggestions", []),
        "category_analysis": category_analysis,
        "cutback_suggestions": cutbacks,
        "alert_thresholds": {
            "default_threshold": threshold,
            "per_lever_thresholds": thresholds,
            "result": alerts,
        },
        "predicted_income": predicted_income,
        "last_month_income": last_month_income,
        "income_increase_percent": income_analysis.get("increase_percent"),
        "income_status": income_analysis.get("status"),
        "income_message": income_analysis.get("message"),
        "income_suggestion": income_analysis.get("suggestion"),
    }
